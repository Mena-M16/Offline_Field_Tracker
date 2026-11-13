import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeDatabaseError } from '../lib/databaseErrors';
import type { ActivityLog, VisibleProfileName } from '../types';
import type { Database } from '../types/supabase';
import type { AppendActivityLogInput, IActivityLogRepository } from './interfaces';
import {
  mapActivityLogRowToActivityLog,
  mapAppendActivityInputToDbInsert,
} from './mappers';
import { SupabaseProfileRepository } from './supabaseProfileRepository';

/**
 * Supabase PostgreSQL Activity Log Repository (Append-Only)
 *
 * Protected by RLS and `trg_activity_logs_immutable`: supports SELECT and INSERT
 * only; updates and deletions are prohibited at both repository and database layers.
 */
export class SupabaseActivityLogRepository implements IActivityLogRepository {
  private readonly profileRepo: SupabaseProfileRepository;

  constructor(private readonly client: SupabaseClient<Database>) {
    this.profileRepo = new SupabaseProfileRepository(client);
  }

  async listForReport(reportId: string): Promise<ActivityLog[]> {
    const { data, error } = await this.client
      .from('activity_logs')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false });

    if (error) {
      throw normalizeDatabaseError(error);
    }

    const rows = data ?? [];
    const actorMap = await this.resolveActors(rows.map((r) => r.actor_id));
    return rows.map((row) => mapActivityLogRowToActivityLog(row, actorMap.get(row.actor_id)));
  }

  async listRecent(limit = 100): Promise<ActivityLog[]> {
    const safeLimit = Math.max(1, Math.min(250, limit));
    const { data, error } = await this.client
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      throw normalizeDatabaseError(error);
    }

    const rows = data ?? [];
    const actorMap = await this.resolveActors(rows.map((r) => r.actor_id));
    return rows.map((row) => mapActivityLogRowToActivityLog(row, actorMap.get(row.actor_id)));
  }

  async append(input: AppendActivityLogInput): Promise<ActivityLog> {
    const insertPayload = mapAppendActivityInputToDbInsert(input);
    const { data, error } = await this.client
      .from('activity_logs')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw normalizeDatabaseError(error);
    }

    const actorMap = await this.resolveActors([data.actor_id]);
    return mapActivityLogRowToActivityLog(data, actorMap.get(data.actor_id));
  }

  private async resolveActors(actorIds: string[]): Promise<Map<string, VisibleProfileName>> {
    const map = new Map<string, VisibleProfileName>();
    if (actorIds.length === 0) return map;

    try {
      const profiles = await this.profileRepo.getVisibleProfileNames(actorIds);
      for (const p of profiles) {
        map.set(p.id, p);
      }
    } catch {
      // Fallback to metadata actor_name / actor_role if RPC lookup is unavailable
    }
    return map;
  }
}
