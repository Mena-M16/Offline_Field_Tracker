import { apiClient, type ApiResponse } from './client';
import type { UserProfile } from '../types';

export interface ProfileSelfUpdatePayload {
  full_name?: string;
  phone_number?: string;
}

export async function fetchCurrentUserProfile(): Promise<ApiResponse<UserProfile>> {
  return apiClient.get<UserProfile>('/auth/me');
}

export async function updateCurrentUserProfile(
  payload: ProfileSelfUpdatePayload
): Promise<ApiResponse<UserProfile>> {
  return apiClient.patch<UserProfile>('/auth/me', payload);
}
