import axios from 'axios';

export const APP_AUTH_TOKEN_STORAGE_KEY = 'external-ui.auth-token';

export function getStoredAppToken() {
  return window.localStorage.getItem(APP_AUTH_TOKEN_STORAGE_KEY);
}

export function setStoredAppToken(token: string) {
  window.localStorage.setItem(APP_AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAppToken() {
  window.localStorage.removeItem(APP_AUTH_TOKEN_STORAGE_KEY);
}

export const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 0,
  withCredentials: false,
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Expires: '0',
  },
});

instance.interceptors.request.use(
  async (config) => {
    const token = getStoredAppToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);
