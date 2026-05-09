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
    this.maxReconnectAttempts = 50; // Maksimal 50 marta urinib ko'rish
    // 'disconnected' | 'connecting' | 'connected'
    this.status = 'disconnected';
    this._statusListeners = new Set();
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this._statusListeners.forEach((fn) => fn(status));
  }

  addStatusListener(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  async connect(userId) {
    this.userId = userId;
    this._bindOnlineHandler();
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) return;

    // Cancel any pending reconnect before opening a new connection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close the old socket silently (don't trigger scheduleReconnect)
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    // JWT already uses URL-safe base64 chars, keep it raw to avoid decode mismatches on backend.
    const url = `${WS_URL}?user_id=${userId}&token=${token}`;
    this._setStatus('connecting');
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this._setStatus('connected');
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
      this._setStatus('connecting');
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  // On web, the browser fires `online` events when the device regains
  // connectivity (Wi-Fi reconnect, switching from cellular to Wi-Fi, etc).
  // Reset the backoff and reconnect immediately instead of waiting up to 30s.
  _bindOnlineHandler() {
    if (this._onlineBound) return;
    this._onlineBound = true;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('online', () => {
      console.log('[WS] window online — resetting backoff & reconnecting');
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.userId && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.connect(this.userId);
      }
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    // Maksimal urinishlar sonini tekshirish
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Maksimal qayta ulanish urinishlari soni oshdi. To\'xtatilmoqda.');
      this._setStatus('disconnected');
      return;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s... up to 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
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
    this._setStatus('disconnected');
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
