import axios from 'axios';

export const APP_AUTH_TOKEN_STORAGE_KEY = 'external-ui.auth-token';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/';

function getApiOrigin() {
  return globalThis.location.origin;
}

function getApiBaseUrl() {
  return new URL(API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`, getApiOrigin());
}

export function getStoredAppToken() {
  return globalThis.localStorage.getItem(APP_AUTH_TOKEN_STORAGE_KEY);
}

export function setStoredAppToken(token: string) {
  globalThis.localStorage.setItem(APP_AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAppToken() {
  globalThis.localStorage.removeItem(APP_AUTH_TOKEN_STORAGE_KEY);
}

export function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(normalizedPath, getApiBaseUrl()).toString();
}

export const instance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 0,
  withCredentials: false,
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Expires: '0',
  },
});

instance.interceptors.request.use((config) => {
  const token = getStoredAppToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

instance.interceptors.response.use((response) => {
  const refreshedToken = response.headers['x-ui-auth-token'];
  if (typeof refreshedToken === 'string' && refreshedToken) {
    setStoredAppToken(refreshedToken);
  }
  return response;
});
