import apiClient from '@/lib/api/client';
import type { ResetPasswordResponse, User, UserCreateRequest, UserUpdateRequest } from '@/types';
import type { Page, PageQuery } from '@/types/api';

export async function listUsers(params: PageQuery = {}): Promise<Page<User>> {
  const res = await apiClient.get<Page<User>>('/users', { params });
  return res.data;
}

export async function getUser(id: string): Promise<User> {
  const res = await apiClient.get<User>(`/users/${id}`);
  return res.data;
}

export async function createUser(data: UserCreateRequest): Promise<User> {
  const res = await apiClient.post<User>('/users', data);
  return res.data;
}

export async function updateUser(id: string, data: UserUpdateRequest): Promise<User> {
  const res = await apiClient.put<User>(`/users/${id}`, data);
  return res.data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}

export async function resetUserPassword(id: string): Promise<ResetPasswordResponse> {
  const res = await apiClient.post<ResetPasswordResponse>(`/users/${id}/reset-password`);
  return res.data;
}

export async function unlockUser(id: string): Promise<void> {
  await apiClient.post(`/users/${id}/unlock`);
}
