import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeDatabaseError } from '../lib/databaseErrors';
import type { SyncLogEntry } from '../types';
import type { Database } from '../types/supabase';
import type { ISyncLogRepository, RecordSyncAttemptInput } from './interfaces';
import {
  mapRecordSyncAttemptToDbInsert,
  mapSyncLogRowToEntry,
} from './mappers';

/**
 * Supabase PostgreSQL Sync Telemetry Repository
 *
 * Records offline synchronization attempts (success, conflict, failure) scoped
 * by RLS (`user_id = auth.uid()`).
 */
export class SupabaseSyncLogRepository implements ISyncLogRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listForUser(userId: string, limit = 50): Promise<SyncLogEntry[]> {
    const safeLimit = Math.max(1, Math.min(200, limit));
    const { data, error } = await this.client
      .from('sync_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      throw normalizeDatabaseError(error);
    }

    return (data ?? []).map(mapSyncLogRowToEntry);
  }

  async recordAttempt(input: RecordSyncAttemptInput): Promise<SyncLogEntry> {
    const payload = mapRecordSyncAttemptToDbInsert(input);
    const { data, error } = await this.client
      .from('sync_logs')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw normalizeDatabaseError(error);
    }

    return mapSyncLogRowToEntry(data);
  }
}
