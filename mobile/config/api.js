// ============================================================
// CENTRAL API CONFIGURATION
// Change BASE_URL to point to your backend server.
// ============================================================

export const BASE_URL = 'http://172.20.10.2:8084';

// WebSocket URL (derived from BASE_URL)
export const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';

// API version prefix
const API_PREFIX = '/api/v1';

// Full API base URL
export const API_BASE = `${BASE_URL}${API_PREFIX}`;

// All endpoints in one place
export const API = {
  AUTH: {
    REGISTER: `${API_BASE}/auth/register`,
    LOGIN: `${API_BASE}/auth/login`,
    LOGOUT: `${API_BASE}/auth/logout`,
    ME: `${API_BASE}/auth/me`,
    UPDATE_PROFILE: `${API_BASE}/auth/profile`,
    UPDATE_AVATAR: `${API_BASE}/auth/avatar`,
  },
  CONTACTS: {
    LIST: `${API_BASE}/contacts`,
    ADD: `${API_BASE}/contacts`,
    DELETE: (id) => `${API_BASE}/contacts/${id}`,
    SEARCH: `${API_BASE}/contacts/search`,
  },
  CHATS: {
    LIST: `${API_BASE}/chats`,
    CREATE_PRIVATE: `${API_BASE}/chats/private`,
    CREATE_GROUP: `${API_BASE}/chats/group`,
    GET: (chatId) => `${API_BASE}/chats/${chatId}`,
  },
  MESSAGES: {
    LIST: (chatId) => `${API_BASE}/chats/${chatId}/messages`,
    SEND: (chatId) => `${API_BASE}/chats/${chatId}/messages`,
    SEND_FILE: (chatId) => `${API_BASE}/chats/${chatId}/messages/file`,
    SEND_VOICE: (chatId) => `${API_BASE}/chats/${chatId}/messages/voice`,
    MARK_READ: (chatId) => `${API_BASE}/chats/${chatId}/messages/read`,
    EDIT: (chatId, msgId) => `${API_BASE}/chats/${chatId}/messages/${msgId}`,
    DELETE: (chatId, msgId) => `${API_BASE}/chats/${chatId}/messages/${msgId}`,
  },
  CALLS: {
    INITIATE: `${API_BASE}/calls`,
    HISTORY: `${API_BASE}/calls/history`,
    ANSWER: (callId) => `${API_BASE}/calls/${callId}/answer`,
    DECLINE: (callId) => `${API_BASE}/calls/${callId}/decline`,
    END: (callId) => `${API_BASE}/calls/${callId}/end`,
    SIGNAL: `${API_BASE}/calls/signal`,
  },
};
