import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API } from '../../config/api';
import { wsService } from '../services/websocket';

interface User {
  id: string;
  phone: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string;
  is_online: boolean;
  last_seen: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  register: (phone: string, password: string, confirmPassword: string) => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  register: async (phone, password, confirmPassword) => {
    const res = await axios.post(API.AUTH.REGISTER, {
      phone,
      password,
      confirm_password: confirmPassword,
    });
    const { token, user } = res.data;
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    wsService.connect(user.id);
    set({ user, token, isAuthenticated: true });
  },

  login: async (phone, password) => {
    const res = await axios.post(API.AUTH.LOGIN, { phone, password });
    const { token, user } = res.data;
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    wsService.connect(user.id);
    set({ user, token, isAuthenticated: true });
  },

  logout: async () => {
    const token = get().token;
    try {
      await axios.post(API.AUTH.LOGOUT, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
        const user = JSON.parse(userStr);
        wsService.connect(user.id);
        set({ user, token, isAuthenticated: true, isLoading: false });
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
