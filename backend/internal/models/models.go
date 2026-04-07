package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID          uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Phone       string     `gorm:"uniqueIndex;size:20;not null" json:"phone"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	DisplayName string     `gorm:"size:100;not null;default:'user'" json:"display_name"`
	Username    *string    `gorm:"uniqueIndex;size:50" json:"username"`
	AvatarURL   *string    `gorm:"type:text" json:"avatar_url"`
	Bio         string     `gorm:"type:text;default:''" json:"bio"`
	IsOnline    bool       `gorm:"default:false" json:"is_online"`
	LastSeen    time.Time  `gorm:"default:now()" json:"last_seen"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type Contact struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	OwnerID   uuid.UUID `gorm:"type:uuid;not null" json:"owner_id"`
	ContactID uuid.UUID `gorm:"type:uuid;not null" json:"contact_id"`
	Nickname  *string   `gorm:"size:100" json:"nickname"`
	CreatedAt time.Time `json:"created_at"`
	Owner     User      `gorm:"foreignKey:OwnerID" json:"-"`
	Contact   User      `gorm:"foreignKey:ContactID" json:"contact"`
}

type Chat struct {
	ID        uuid.UUID    `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ChatType  string       `gorm:"size:20;not null;default:'private'" json:"chat_type"`
	Title     *string      `gorm:"size:200" json:"title"`
	AvatarURL *string      `gorm:"type:text" json:"avatar_url"`
	CreatedBy *uuid.UUID   `gorm:"type:uuid" json:"created_by"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
	Members   []ChatMember `gorm:"foreignKey:ChatID" json:"members,omitempty"`
}

type ChatMember struct {
	ID       uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ChatID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_chat_user" json:"chat_id"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_chat_user" json:"user_id"`
	Role     string    `gorm:"size:20;default:'member'" json:"role"`
	JoinedAt time.Time `gorm:"default:now()" json:"joined_at"`
	User     User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

type Message struct {
	ID          uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ChatID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"chat_id"`
	SenderID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"sender_id"`
	ReplyToID   *uuid.UUID `gorm:"type:uuid" json:"reply_to_id"`
	MessageType string     `gorm:"size:20;not null;default:'text'" json:"message_type"`
	Content     *string    `gorm:"type:text" json:"content"`
	FileURL     *string    `gorm:"type:text" json:"file_url"`
	FileName    *string    `gorm:"size:500" json:"file_name"`
	FileSize    int64      `gorm:"default:0" json:"file_size"`
	MimeType    *string    `gorm:"size:100" json:"mime_type"`
	Duration    int        `gorm:"default:0" json:"duration"`
	IsRead      bool       `gorm:"default:false" json:"is_read"`
	IsEdited    bool       `gorm:"default:false" json:"is_edited"`
	IsDeleted   bool       `gorm:"default:false" json:"is_deleted"`
	CreatedAt   time.Time  `gorm:"index" json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Sender      User       `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	ReplyTo     *Message   `gorm:"foreignKey:ReplyToID" json:"reply_to,omitempty"`
}

type ReadReceipt struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	MessageID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_msg_user" json:"message_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_msg_user" json:"user_id"`
	ReadAt    time.Time `gorm:"default:now()" json:"read_at"`
}

type Call struct {
	ID        uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	CallerID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"caller_id"`
	CalleeID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"callee_id"`
	CallType  string     `gorm:"size:20;not null;default:'voice'" json:"call_type"`
	Status    string     `gorm:"size:20;not null;default:'ringing'" json:"status"`
	StartedAt time.Time  `gorm:"default:now()" json:"started_at"`
	EndedAt   *time.Time `json:"ended_at"`
	Duration  int        `gorm:"default:0" json:"duration"`
	Caller    User       `gorm:"foreignKey:CallerID" json:"caller,omitempty"`
	Callee    User       `gorm:"foreignKey:CalleeID" json:"callee,omitempty"`
}
