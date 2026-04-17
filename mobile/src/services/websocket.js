import AsyncStorage from '@react-native-async-storage/async-storage';
import { WS_URL } from '../../config/api';

class WebSocketService {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.reconnectTimer = null;
    this.userId = '';
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000;
  }

  async connect(userId) {
    this.userId = userId;
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) return;

    const url = `${WS_URL}?user_id=${userId}&token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;
        this.handlers.get(type)?.forEach((h) => h(payload));
        this.handlers.get('*')?.forEach((h) => h(data));
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    // Exponential backoff: 1s, 2s, 4s, 8s... up to 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.userId) {
        this.connect(this.userId);
      }
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.userId = '';
    this.ws?.close();
    this.ws = null;
  }

  send(type, payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type).add(handler);
  }

  off(type, handler) {
    this.handlers.get(type)?.delete(handler);
  }
}

export const wsService = new WebSocketService();
