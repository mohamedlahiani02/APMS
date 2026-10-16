import apiClient from '@/lib/api/client';
import type { AuthSession, ChangePasswordRequest, LoginRequest, RefreshResponse, User } from '@/types';

export async function login(payload: LoginRequest): Promise<AuthSession> {
  const res = await apiClient.post<AuthSession>('/auth/login', payload, { skipAuthRefresh: true });
  return res.data;
}

export async function refresh(refreshToken: string): Promise<RefreshResponse> {
  const res = await apiClient.post<RefreshResponse>(
    '/auth/refresh',
    { refreshToken },
    { skipAuthRefresh: true }
  );
  return res.data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken });
}

export async function me(): Promise<User> {
  const res = await apiClient.get<User>('/auth/me');
  return res.data;
}

export async function changePassword(payload: ChangePasswordRequest): Promise<void> {
  await apiClient.post('/auth/change-password', payload);
}
