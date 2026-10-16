import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight refresh: concurrent 401s all await the same in-flight
// /auth/refresh call instead of each triggering their own.
let refreshInFlight: Promise<string> | null = null;

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('/auth/refresh') || url.includes('/auth/login');
}

async function runSingleFlightRefresh(): Promise<string> {
  refreshInFlight ??= useAuthStore
    .getState()
    .refreshNow()
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig | undefined;
    const status = error.response?.status;

    if (status !== 401 || !original || original._retry || original.skipAuthRefresh) {
      return Promise.reject(error);
    }
    if (isAuthEndpoint(original.url)) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const newAccess = await runSingleFlightRefresh();
      original.headers = original.headers ?? {};
      (original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`;
      return apiClient.request(original);
    } catch (refreshError) {
      useAuthStore.getState().clear();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
