package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Phone        string    `gorm:"uniqueIndex;size:20;not null" json:"phone"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	DisplayName  string    `gorm:"size:100;not null;default:'user'" json:"display_name"`
	Username     *string   `gorm:"uniqueIndex;size:50" json:"username"`
	AvatarURL    *string   `gorm:"type:text" json:"avatar_url"`
	Bio          string    `gorm:"type:text;default:''" json:"bio"`
	IsOnline     bool      `gorm:"default:false" json:"is_online"`
	LastSeen     time.Time `gorm:"default:now()" json:"last_seen"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
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
	ID              uuid.UUID    `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ChatType        string       `gorm:"size:20;not null;default:'private'" json:"chat_type"`
	Title           *string      `gorm:"size:200" json:"title"`
	AvatarURL       *string      `gorm:"type:text" json:"avatar_url"`
	CreatedBy       *uuid.UUID   `gorm:"type:uuid" json:"created_by"`
	PinnedMessageID *uuid.UUID   `gorm:"type:uuid" json:"pinned_message_id"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
	Members         []ChatMember `gorm:"foreignKey:ChatID" json:"members,omitempty"`
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
	ID                uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ChatID            uuid.UUID  `gorm:"type:uuid;not null;index" json:"chat_id"`
	SenderID          uuid.UUID  `gorm:"type:uuid;not null;index" json:"sender_id"`
	ReplyToID         *uuid.UUID `gorm:"type:uuid" json:"reply_to_id"`
	ForwardFromID     *uuid.UUID `gorm:"type:uuid" json:"forward_from_id"`
	ForwardFromChatID *uuid.UUID `gorm:"type:uuid" json:"forward_from_chat_id"`
	PollID            *uuid.UUID `gorm:"type:uuid" json:"poll_id"`
	MessageType       string     `gorm:"size:20;not null;default:'text'" json:"message_type"`
	Content           *string    `gorm:"type:text" json:"content"`
	FileURL           *string    `gorm:"type:text" json:"file_url"`
	FileName          *string    `gorm:"size:500" json:"file_name"`
	FileSize          int64      `gorm:"default:0" json:"file_size"`
	MimeType          *string    `gorm:"size:100" json:"mime_type"`
	Duration          int        `gorm:"default:0" json:"duration"`
	IsRead            bool       `gorm:"default:false" json:"is_read"`
	IsEdited          bool       `gorm:"default:false" json:"is_edited"`
	IsDeleted         bool       `gorm:"default:false" json:"is_deleted"`
	CreatedAt         time.Time  `gorm:"index" json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	Sender            User       `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	ReplyTo           *Message   `gorm:"foreignKey:ReplyToID" json:"reply_to,omitempty"`
	ForwardFrom       *User      `gorm:"foreignKey:ForwardFromID" json:"forward_from,omitempty"`
	Poll              *Poll      `gorm:"foreignKey:PollID" json:"poll,omitempty"`
	Reactions         []Reaction `gorm:"foreignKey:MessageID" json:"reactions,omitempty"`
}

type Reaction struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	MessageID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_msg_reactor" json:"message_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_msg_reactor" json:"user_id"`
	Emoji     string    `gorm:"size:30;not null" json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
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

type BlockedUser struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	BlockerID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_blocker_blocked" json:"blocker_id"`
	BlockedID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_blocker_blocked" json:"blocked_id"`
	CreatedAt time.Time `json:"created_at"`
	Blocker   User      `gorm:"foreignKey:BlockerID" json:"-"`
	Blocked   User      `gorm:"foreignKey:BlockedID" json:"blocked,omitempty"`
}

type Story struct {
	ID        uuid.UUID   `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID    uuid.UUID   `gorm:"type:uuid;not null;index" json:"user_id"`
	MediaURL  string      `gorm:"type:text;not null" json:"media_url"`
	MediaType string      `gorm:"size:20;not null;default:'image'" json:"media_type"`
	Caption   string      `gorm:"type:text" json:"caption"`
	ExpiresAt time.Time   `json:"expires_at"`
	CreatedAt time.Time   `json:"created_at"`
	User      User        `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Views     []StoryView `gorm:"foreignKey:StoryID" json:"views,omitempty"`
}

type StoryView struct {
	ID       uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	StoryID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_story_viewer" json:"story_id"`
	ViewerID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_story_viewer" json:"viewer_id"`
	ViewedAt time.Time `gorm:"default:now()" json:"viewed_at"`
}

type SavedMessage struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_saved_msg" json:"user_id"`
	MessageID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_saved_msg" json:"message_id"`
	SavedAt   time.Time `gorm:"default:now()" json:"saved_at"`
	Message   Message   `gorm:"foreignKey:MessageID" json:"message,omitempty"`
}

// ─── Channel ───────────────────────────────────────────────────────────────

type Channel struct {
	ID          uuid.UUID       `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Title       string          `gorm:"size:200;not null" json:"title"`
	Username    *string         `gorm:"uniqueIndex;size:50" json:"username"`
	Description string          `gorm:"type:text;default:''" json:"description"`
	AvatarURL   *string         `gorm:"type:text" json:"avatar_url"`
	OwnerID     uuid.UUID       `gorm:"type:uuid;not null" json:"owner_id"`
	IsPublic    bool            `gorm:"default:true" json:"is_public"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	Owner       User            `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	Members     []ChannelMember `gorm:"foreignKey:ChannelID" json:"members,omitempty"`
	Posts       []ChannelPost   `gorm:"foreignKey:ChannelID" json:"posts,omitempty"`
}

type ChannelMember struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ChannelID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_channel_member" json:"channel_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_channel_member" json:"user_id"`
	Role      string    `gorm:"size:20;default:'subscriber'" json:"role"` // owner, admin, subscriber
	JoinedAt  time.Time `gorm:"default:now()" json:"joined_at"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

type ChannelPost struct {
	ID        uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ChannelID uuid.UUID      `gorm:"type:uuid;not null;index" json:"channel_id"`
	AuthorID  uuid.UUID      `gorm:"type:uuid;not null" json:"author_id"`
	Content   *string        `gorm:"type:text" json:"content"`
	MediaURL  *string        `gorm:"type:text" json:"media_url"`
	MediaType *string        `gorm:"size:20" json:"media_type"`
	ViewCount int            `gorm:"default:0" json:"view_count"`
	IsPinned  bool           `gorm:"default:false" json:"is_pinned"`
	CreatedAt time.Time      `gorm:"index" json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	Author    User           `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
	Reactions []PostReaction `gorm:"foreignKey:PostID" json:"reactions,omitempty"`
}

type PostReaction struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	PostID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_post_reactor" json:"post_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_post_reactor" json:"user_id"`
	Emoji     string    `gorm:"size:30;not null" json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
}

// ─── Poll ──────────────────────────────────────────────────────────────────

type Poll struct {
	ID          uuid.UUID    `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Question    string       `gorm:"type:text;not null" json:"question"`
	IsAnonymous bool         `gorm:"default:true" json:"is_anonymous"`
	IsMultiple  bool         `gorm:"default:false" json:"is_multiple"`
	IsClosed    bool         `gorm:"default:false" json:"is_closed"`
	CreatedBy   uuid.UUID    `gorm:"type:uuid;not null" json:"created_by"`
	CreatedAt   time.Time    `json:"created_at"`
	Options     []PollOption `gorm:"foreignKey:PollID" json:"options,omitempty"`
}

type PollOption struct {
	ID        uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	PollID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"poll_id"`
	Text      string     `gorm:"size:200;not null" json:"text"`
	VoteCount int        `gorm:"default:0" json:"vote_count"`
	Votes     []PollVote `gorm:"foreignKey:OptionID" json:"votes,omitempty"`
}

type PollVote struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	PollID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_poll_voter_option" json:"poll_id"`
	OptionID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_poll_voter_option" json:"option_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_poll_voter_option" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// ─── Chat Folders ──────────────────────────────────────────────────────────

type ChatFolder struct {
	ID        uuid.UUID        `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID    uuid.UUID        `gorm:"type:uuid;not null;index" json:"user_id"`
	Name      string           `gorm:"size:100;not null" json:"name"`
	Emoji     string           `gorm:"size:10;default:'📁'" json:"emoji"`
	SortOrder int              `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time        `json:"created_at"`
	Items     []ChatFolderItem `gorm:"foreignKey:FolderID" json:"items,omitempty"`
}

type ChatFolderItem struct {
	ID       uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	FolderID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_folder_chat" json:"folder_id"`
	ChatID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_folder_chat" json:"chat_id"`
}

// ─── Scheduled Messages ────────────────────────────────────────────────────

type ScheduledMessage struct {
	ID          uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	ChatID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"chat_id"`
	SenderID    uuid.UUID  `gorm:"type:uuid;not null" json:"sender_id"`
	Content     *string    `gorm:"type:text" json:"content"`
	FileURL     *string    `gorm:"type:text" json:"file_url"`
	MessageType string     `gorm:"size:20;default:'text'" json:"message_type"`
	ScheduledAt time.Time  `gorm:"not null" json:"scheduled_at"`
	IsSent      bool       `gorm:"default:false" json:"is_sent"`
	SentAt      *time.Time `json:"sent_at"`
	CreatedAt   time.Time  `json:"created_at"`
	Sender      User       `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
}

// ─── Stickers ──────────────────────────────────────────────────────────────

type StickerSet struct {
	ID         uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	Name       string    `gorm:"size:100;not null" json:"name"`
	Title      string    `gorm:"size:200;not null" json:"title"`
	ThumbURL   *string   `gorm:"type:text" json:"thumb_url"`
	AuthorID   uuid.UUID `gorm:"type:uuid;not null" json:"author_id"`
	IsAnimated bool      `gorm:"default:false" json:"is_animated"`
	CreatedAt  time.Time `json:"created_at"`
	Stickers   []Sticker `gorm:"foreignKey:SetID" json:"stickers,omitempty"`
}

type Sticker struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	SetID     uuid.UUID `gorm:"type:uuid;not null;index" json:"set_id"`
	Emoji     string    `gorm:"size:30;not null" json:"emoji"`
	FileURL   string    `gorm:"type:text;not null" json:"file_url"`
	Width     int       `gorm:"default:512" json:"width"`
	Height    int       `gorm:"default:512" json:"height"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
}

type UserStickerSet struct {
	ID      uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID  uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_user_stickerset" json:"user_id"`
	SetID   uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_user_stickerset" json:"set_id"`
	AddedAt time.Time  `gorm:"default:now()" json:"added_at"`
	Set     StickerSet `gorm:"foreignKey:SetID" json:"set,omitempty"`
}

// ─── 2FA ───────────────────────────────────────────────────────────────────

type TwoFactor struct {
	ID        uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"user_id"`
	Secret    string    `gorm:"size:64;not null" json:"secret"`
	IsEnabled bool      `gorm:"default:false" json:"is_enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
