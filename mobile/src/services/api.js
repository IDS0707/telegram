import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../../config/api';
import { useAuthStore } from '../store/authStore';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000, // 15 soniyaga qisqartirildi
});

// Attach JWT token to every request
apiClient.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // FormData yuborilganda boundary bilan to'g'ri multipart headerni axios o'zi qo'ysin.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    } else {
      config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Handle errors and provide user-friendly messages
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Network xatolari (internet yo'q, server ishlamayapti)
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        error.userMessage = 'So\'rov vaqti tugadi. Iltimos, qayta urinib ko\'ring.';
      } else if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        error.userMessage = 'Internet aloqasi yo\'q yoki server ishlamayapti. Iltimos, tarmoqni tekshiring.';
      } else if (error.code === 'ENOTFOUND') {
        error.userMessage = 'Server topilmadi. URL manzilni tekshiring.';
      } else {
        error.userMessage = 'Tarmoq xatosi. Iltimos, qayta urinib ko\'ring.';
      }
      error.isNetworkError = true;
      return Promise.reject(error);
    }

    // HTTP status code xatolari
    const status = error.response.status;

    // 401 - Unauthorized (token expired yoki invalid)
    if (status === 401) {
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('user');
      useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
      error.userMessage = 'Sessiya tugadi. Iltimos, qaytadan kiring.';
    }
    // 403 - Forbidden
    else if (status === 403) {
      error.userMessage = 'Bu amalni bajarishga ruxsat yo\'q.';
    }
    // 404 - Not Found
    else if (status === 404) {
      error.userMessage = 'Ma\'lumot topilmadi.';
    }
    // 429 - Too Many Requests
    else if (status === 429) {
      error.userMessage = 'Juda ko\'p so\'rov yuborildi. Iltimos, biroz kuting.';
    }
    // 500+ - Server Error
    else if (status >= 500) {
      error.userMessage = 'Server xatosi. Iltimos, keyinroq urinib ko\'ring.';
    }
    // Server dan kelgan xato xabari
    else if (error.response?.data?.error) {
      error.userMessage = error.response.data.error;
    }
    // Default xato
    else {
      error.userMessage = 'Kutilmagan xato yuz berdi.';
    }

    return Promise.reject(error);
  }
);

// Retry funksiyasi - muvaffaqiyatsiz so'rovlarni qayta yuborish
export const retryRequest = async (requestFn, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      // Oxirgi urinish yoki auth xatolari uchun retry qilmaymiz
      if (i === maxRetries - 1 || error.response?.status === 401 || error.response?.status === 403) {
        throw error;
      }
      // Exponential backoff: 1s, 2s, 4s...
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

export default apiClient;
