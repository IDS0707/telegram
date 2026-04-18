import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API } from '../../config/api';
import { wsService } from '../services/websocket';

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  totalUnread: 0,

  setTotalUnread: (count) => set({ totalUnread: count }),

  register: async (phone, password, confirmPassword, displayName) => {
    const res = await axios.post(API.AUTH.REGISTER, {
      phone,
      password,
      confirm_password: confirmPassword,
      display_name: displayName || undefined,
    });
    const { token, user } = res.data;
    if (!token || !user) throw new Error('Invalid server response');
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    wsService.connect(user.id);
    set({ user, token, isAuthenticated: true });
  },

  login: async (phone, password) => {
    const res = await axios.post(API.AUTH.LOGIN, {
      phone,
      password,
    });
    const { token, user } = res.data;
    if (!token || !user) throw new Error('Invalid server response');
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    wsService.connect(user.id);
    set({ user, token, isAuthenticated: true });
  },

  logout: async () => {
    const token = get().token;
    try {
      await Promise.race([
        axios.post(
          API.AUTH.LOGOUT,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
    } catch {}
    wsService.disconnect();
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadStoredAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userStr = await AsyncStorage.getItem('user');
      if (token && userStr) {
        // Verify token is still valid with the backend
        try {
          const res = await axios.get(API.AUTH.ME, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const user = res.data;
          await AsyncStorage.setItem('user', JSON.stringify(user));
          wsService.connect(user.id);
          set({ user, token, isAuthenticated: true, isLoading: false });
        } catch (err) {
          if (err.response?.status === 401) {
            // Token explicitly rejected — log out
            await AsyncStorage.removeItem('auth_token');
            await AsyncStorage.removeItem('user');
            set({ isLoading: false });
          } else {
            // Network / server error — keep cached credentials so user stays logged in
            const user = userStr ? JSON.parse(userStr) : null;
            if (user) {
              wsService.connect(user.id);
              set({ user, token, isAuthenticated: true, isLoading: false });
            } else {
              set({ isLoading: false });
            }
          }
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  updateProfile: async (data) => {
    const token = get().token;
    const res = await axios.put(API.AUTH.UPDATE_PROFILE, data, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const updatedUser = res.data;
    await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
    set({ user: updatedUser });
  },

  fetchMe: async () => {
    const token = get().token;
    const res = await axios.get(API.AUTH.ME, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = res.data;
    await AsyncStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },
}));
