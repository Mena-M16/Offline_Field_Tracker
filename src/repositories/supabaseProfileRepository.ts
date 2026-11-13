import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDatabaseError, normalizeDatabaseError } from '../lib/databaseErrors';
import type { IProfileRepository } from './interfaces';
import { mapProfileRowToUserProfile, mapVisibleProfileRow } from './mappers';
import type { UserProfile, VisibleProfileName } from '../types';
import type { Database, ProfileUpdate } from '../types/supabase';

/**
 * Supabase PostgreSQL Profile Repository
 *
 * All operations execute through the caller's RLS-scoped SupabaseClient
 * (`auth.uid()` / Bearer JWT). Never modifies `role`, `email`, `is_active`,
 * or `disabled_at`.
 */
export class SupabaseProfileRepository implements IProfileRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getById(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw normalizeDatabaseError(error);
    }

    return data ? mapProfileRowToUserProfile(data) : null;
  }

  async updateOwnProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'full_name' | 'phone_number' | 'organization' | 'avatar_url'>>
  ): Promise<UserProfile> {
    const payload: ProfileUpdate = {};

    if (updates.full_name !== undefined) {
      const trimmed = updates.full_name.trim();
      if (trimmed.length < 2) {
        throw new AppDatabaseError({
          code: 'INVALID_INPUT',
          message: 'Full name must be at least 2 characters.',
          httpStatus: 400,
        });
      }
      payload.full_name = trimmed;
    }

    if (updates.phone_number !== undefined) {
      const trimmedPhone = updates.phone_number.trim();
      payload.phone_number = trimmedPhone.length > 0 ? trimmedPhone : null;
    }

    if (updates.organization !== undefined) {
      const trimmedOrg = updates.organization.trim();
      if (trimmedOrg.length > 0) {
        payload.organization = trimmedOrg;
      }
    }

    if (updates.avatar_url !== undefined) {
      const trimmedAvatar = updates.avatar_url.trim();
      payload.avatar_url = trimmedAvatar.length > 0 ? trimmedAvatar : null;
    }

    if (Object.keys(payload).length === 0) {
      const existing = await this.getById(userId);
      if (!existing) {
        throw new AppDatabaseError({
          code: 'NOT_FOUND',
          message: 'Profile not found.',
          httpStatus: 404,
        });
      }
      return existing;
    }

    const { data, error } = await this.client
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      throw normalizeDatabaseError(error);
    }

    return mapProfileRowToUserProfile(data);
  }

  async getVisibleProfileNames(profileIds: string[]): Promise<VisibleProfileName[]> {
    const uniqueIds = Array.from(
      new Set(profileIds.map((id) => id.trim()).filter(Boolean))
    );
    if (uniqueIds.length === 0) {
      return [];
    }

    const { data, error } = await this.client.rpc('get_visible_profile_names', {
      p_profile_ids: uniqueIds,
    });

    if (error) {
      throw normalizeDatabaseError(error);
    }

    return (data ?? []).map(mapVisibleProfileRow);
  }

  async listAssignableProfiles(): Promise<VisibleProfileName[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) {
      throw normalizeDatabaseError(error);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      full_name: row.full_name,
      role: row.role,
    }));
  }
}
