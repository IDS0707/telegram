// ============================================
// CENTRAL API CONFIGURATION
// ============================================
// Change BASE_URL to point to your backend server.
// Every API call in the app reads from this file.
// When deploying to VPS, just update BASE_URL below.
// ============================================

export const BASE_URL = 'http://192.168.1.100:8084';

// WebSocket URL (derived from BASE_URL)
export const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';

// API version prefix
const API_PREFIX = '/api/v1';

// Full API base
export const API_BASE = `${BASE_URL}${API_PREFIX}`;

// ============================================
// All API endpoints in one place
// ============================================
export const API = {
  // Auth
  AUTH: {
    REGISTER: `${API_BASE}/auth/register`,
    LOGIN: `${API_BASE}/auth/login`,
    LOGOUT: `${API_BASE}/auth/logout`,
    ME: `${API_BASE}/auth/me`,
    UPDATE_PROFILE: `${API_BASE}/auth/profile`,
    UPDATE_AVATAR: `${API_BASE}/auth/avatar`,
  },

  // Contacts
  CONTACTS: {
    LIST: `${API_BASE}/contacts`,
    ADD: `${API_BASE}/contacts`,
    DELETE: (id: string) => `${API_BASE}/contacts/${id}`,
    SEARCH: `${API_BASE}/contacts/search`,
  },

  // Chats
  CHATS: {
    LIST: `${API_BASE}/chats`,
    CREATE_PRIVATE: `${API_BASE}/chats/private`,
    CREATE_GROUP: `${API_BASE}/chats/group`,
    GET: (chatId: string) => `${API_BASE}/chats/${chatId}`,
  },

  // Messages
  MESSAGES: {
    LIST: (chatId: string) => `${API_BASE}/chats/${chatId}/messages`,
    SEND: (chatId: string) => `${API_BASE}/chats/${chatId}/messages`,
    SEND_FILE: (chatId: string) => `${API_BASE}/chats/${chatId}/messages/file`,
    SEND_VOICE: (chatId: string) => `${API_BASE}/chats/${chatId}/messages/voice`,
    MARK_READ: (chatId: string) => `${API_BASE}/chats/${chatId}/messages/read`,
    EDIT: (chatId: string, msgId: string) => `${API_BASE}/chats/${chatId}/messages/${msgId}`,
    DELETE: (chatId: string, msgId: string) => `${API_BASE}/chats/${chatId}/messages/${msgId}`,
  },

  // Calls
  CALLS: {
    INITIATE: `${API_BASE}/calls`,
    HISTORY: `${API_BASE}/calls/history`,
    ANSWER: (callId: string) => `${API_BASE}/calls/${callId}/answer`,
    DECLINE: (callId: string) => `${API_BASE}/calls/${callId}/decline`,
    END: (callId: string) => `${API_BASE}/calls/${callId}/end`,
    SIGNAL: `${API_BASE}/calls/signal`,
  },

  // Uploads (for displaying files)
  UPLOADS: (path: string) => `${BASE_URL}${path}`,
};
