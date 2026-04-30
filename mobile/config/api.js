// ============================================================
// CENTRAL API CONFIGURATION
// Change BASE_URL to point to your backend server.
// ============================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Production server URL (HTTPS ishlatish tavsiya etiladi)
const PRODUCTION_URL = 'http://your-server.com:8084';

// Local development IP (Wi-Fi orqali test qilish uchun)
const LOCAL_IP = '103.103.103.246';
const ANDROID_USB_URL = 'http://127.0.0.1:8084';

// Environment detection
const isDevelopment = __DEV__;

// Default BASE_URL
let defaultBaseUrl;
if (Platform.OS === 'web') {
  defaultBaseUrl = 'http://localhost:8084';
} else if (Platform.OS === 'android') {
  // USB debug rejimida adb reverse bilan ishlatish uchun
  defaultBaseUrl = ANDROID_USB_URL;
} else {
  // iOS yoki boshqa platformalar uchun local IP
  defaultBaseUrl = `http://${LOCAL_IP}:8084`;
}

// Runtime da o'zgartirilishi mumkin bo'lgan BASE_URL
let runtimeBaseUrl = null;

// BASE_URL ni olish (async storage dan yoki default)
export const getBaseUrl = async () => {
  if (runtimeBaseUrl) return runtimeBaseUrl;
  try {
    const stored = await AsyncStorage.getItem('api_base_url');
    if (stored) {
      runtimeBaseUrl = stored;
      return stored;
    }
  } catch (e) {
    console.warn('Failed to load stored API URL:', e);
  }
  return defaultBaseUrl;
};

// BASE_URL ni o'rnatish
export const setBaseUrl = async (url) => {
  try {
    await AsyncStorage.setItem('api_base_url', url);
    runtimeBaseUrl = url;
  } catch (e) {
    console.error('Failed to save API URL:', e);
  }
};

// Sync export (eski kod bilan moslik uchun)
export const BASE_URL = defaultBaseUrl;

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
