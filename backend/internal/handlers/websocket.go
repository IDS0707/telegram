package handlers

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"telegram-clone-backend/internal/models"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WSMessage represents a WebSocket message
type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// Client represents a connected WebSocket client
type Client struct {
	ID     uuid.UUID
	UserID uuid.UUID
	Conn   *websocket.Conn
	Send   chan []byte
}

// Hub manages WebSocket connections
type Hub struct {
	DB         *gorm.DB
	JWTSecret  string
	clients    map[uuid.UUID]map[uuid.UUID]*Client // userID -> map[clientID]*Client
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub(db *gorm.DB, jwtSecret string) *Hub {
	return &Hub{
		DB:         db,
		JWTSecret:  jwtSecret,
		clients:    make(map[uuid.UUID]map[uuid.UUID]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if _, ok := h.clients[client.UserID]; !ok {
				h.clients[client.UserID] = make(map[uuid.UUID]*Client)
			}
			h.clients[client.UserID][client.ID] = client
			h.mu.Unlock()

			// Update user online status
			h.DB.Model(&models.User{}).Where("id = ?", client.UserID).Update("is_online", true)
			log.Printf("User %s connected (client %s)", client.UserID, client.ID)

		case client := <-h.unregister:
			h.mu.Lock()
			if userClients, ok := h.clients[client.UserID]; ok {
				delete(userClients, client.ID)
				close(client.Send)
				if len(userClients) == 0 {
					delete(h.clients, client.UserID)
					h.DB.Model(&models.User{}).Where("id = ?", client.UserID).Updates(map[string]interface{}{
						"is_online": false,
						"last_seen": time.Now(),
					})
				}
			}
			h.mu.Unlock()
			log.Printf("User %s disconnected (client %s)", client.UserID, client.ID)
		}
	}
}

// BroadcastToChat sends a message to all members of a chat
func (h *Hub) BroadcastToChat(chatID uuid.UUID, msg WSMessage) {
	var members []models.ChatMember
	h.DB.Where("chat_id = ?", chatID).Find(&members)

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, member := range members {
		if userClients, ok := h.clients[member.UserID]; ok {
			for _, client := range userClients {
				select {
				case client.Send <- data:
				default:
					// Buffer full, skip
				}
			}
		}
	}
}

// SendToUser sends a message to a specific user
func (h *Hub) SendToUser(userID uuid.UUID, msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	if userClients, ok := h.clients[userID]; ok {
		for _, client := range userClients {
			select {
			case client.Send <- data:
			default:
			}
		}
	}
}

// BroadcastToChannel sends a message to all subscribers of a channel
func (h *Hub) BroadcastToChannel(channelID uuid.UUID, eventType string, payload interface{}) {
	var members []models.ChannelMember
	h.DB.Where("channel_id = ?", channelID).Find(&members)

	wsMsg := WSMessage{Type: eventType, Payload: payload}
	data, err := json.Marshal(wsMsg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, member := range members {
		if userClients, ok := h.clients[member.UserID]; ok {
			for _, client := range userClients {
				select {
				case client.Send <- data:
				default:
				}
			}
		}
	}
}

// HandleWebSocket handles WebSocket connections
func (h *Hub) HandleWebSocket() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		userIDStr := c.Query("user_id")
		tokenStr := c.Query("token")

		if userIDStr == "" || tokenStr == "" {
			log.Println("WebSocket: missing user_id or token")
			c.Close()
			return
		}

		// Validate JWT token
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.ErrUnauthorized
			}
			return []byte(h.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			log.Println("WebSocket: invalid token")
			c.Close()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			log.Println("WebSocket: invalid claims")
			c.Close()
			return
		}

		// Verify user_id matches token
		tokenUserID, ok := claims["user_id"].(string)
		if !ok || tokenUserID != userIDStr {
			log.Println("WebSocket: user_id mismatch")
			c.Close()
			return
		}

		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			log.Println("WebSocket: invalid user_id")
			c.Close()
			return
		}

		client := &Client{
			ID:     uuid.New(),
			UserID: userID,
			Conn:   c,
			Send:   make(chan []byte, 256),
		}

		h.register <- client

		// Writer goroutine
		go func() {
			defer func() {
				c.Close()
			}()
			for msg := range client.Send {
				if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
					break
				}
			}
		}()

		// Reader loop
		for {
			_, msgBytes, err := c.ReadMessage()
			if err != nil {
				break
			}

			var wsMsg WSMessage
			if err := json.Unmarshal(msgBytes, &wsMsg); err != nil {
				continue
			}

			// Handle client-side messages (typing indicators, etc.)
			switch wsMsg.Type {
			case "typing":
				if payload, ok := wsMsg.Payload.(map[string]interface{}); ok {
					if chatIDStr, ok := payload["chat_id"].(string); ok {
						chatID, err := uuid.Parse(chatIDStr)
						if err == nil {
							h.BroadcastToChat(chatID, WSMessage{
								Type: "typing",
								Payload: fiber.Map{
									"user_id": userID,
									"chat_id": chatID,
								},
							})
						}
					}
				}
			case "stop_typing":
				if payload, ok := wsMsg.Payload.(map[string]interface{}); ok {
					if chatIDStr, ok := payload["chat_id"].(string); ok {
						chatID, err := uuid.Parse(chatIDStr)
						if err == nil {
							h.BroadcastToChat(chatID, WSMessage{
								Type: "stop_typing",
								Payload: fiber.Map{
									"user_id": userID,
									"chat_id": chatID,
								},
							})
						}
					}
				}
			}
		}

		h.unregister <- client
	})
}
