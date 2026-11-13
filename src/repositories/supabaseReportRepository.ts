import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDatabaseError, normalizeDatabaseError } from '../lib/databaseErrors';
import type { LocalReport, VisibleProfileName } from '../types';
import type { Database, ReportRow, ReportUpdate } from '../types/supabase';
import type {
  CreateReportInput,
  IdempotentCreateResult,
  IReportRepository,
  ReportQueryFilter,
  TransitionReportStatusInput,
} from './interfaces';
import {
  mapCreateReportInputToDbInsert,
  mapReportRowToLocalReport,
} from './mappers';
import {
  isStorageObjectPath,
  SupabaseMediaStorageRepository,
} from './supabaseMediaStorageRepository';
import { SupabaseProfileRepository } from './supabaseProfileRepository';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Supabase PostgreSQL Reports Repository
 *
 * Enforces:
 * - RLS-scoped reads and writes via the caller's SupabaseClient (`auth.uid()`).
 * - Deterministic `client_id` idempotent insertion (`23505` duplicate shield).
 * - Optimistic concurrency control (`WHERE id = :id AND version = :expectedVersion`,
 *   setting `version = expectedVersion + 1` per `trg_reports_lifecycle_and_version`).
 * - Private `report-media` signed URL hydration and PII-free profile attribution.
 */
export class SupabaseReportRepository implements IReportRepository {
  private readonly profileRepo: SupabaseProfileRepository;
  private readonly mediaRepo: SupabaseMediaStorageRepository;

  constructor(private readonly client: SupabaseClient<Database>) {
    this.profileRepo = new SupabaseProfileRepository(client);
    this.mediaRepo = new SupabaseMediaStorageRepository(client);
  }

  async listReports(filter?: ReportQueryFilter): Promise<LocalReport[]> {
    let query = this.client
      .from('reports')
      .select('*')
      .order('updated_at', { ascending: false });

    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    if (filter?.priority) {
      query = query.eq('priority', filter.priority);
    }
    if (filter?.category) {
      query = query.eq('category', filter.category);
    }
    if (filter?.createdBy) {
      query = query.eq('created_by', filter.createdBy);
    }
    if (filter?.assignedTo) {
      query = query.eq('assigned_to', filter.assignedTo);
    }
    if (filter?.updatedAfter) {
      query = query.gt('updated_at', filter.updatedAfter);
    }
    if (filter?.limit && filter.limit > 0) {
      query = query.limit(Math.min(500, filter.limit));
    }

    const { data, error } = await query;
    if (error) {
      throw normalizeDatabaseError(error);
    }

    return this.hydrateReportRows(data ?? []);
  }

  async getById(id: string): Promise<LocalReport | null> {
    if (!UUID_REGEX.test(id.trim())) {
      return null;
    }

    const { data, error } = await this.client
      .from('reports')
      .select('*')
      .eq('id', id.trim())
      .maybeSingle();

    if (error) {
      throw normalizeDatabaseError(error);
    }

    if (!data) return null;
    const [hydrated] = await this.hydrateReportRows([data]);
    return hydrated ?? null;
  }

  async getByClientId(clientId: string): Promise<LocalReport | null> {
    if (!UUID_REGEX.test(clientId.trim())) {
      return null;
    }

    const { data, error } = await this.client
      .from('reports')
      .select('*')
      .eq('client_id', clientId.trim())
      .maybeSingle();

    if (error) {
      throw normalizeDatabaseError(error);
    }

    if (!data) return null;
    const [hydrated] = await this.hydrateReportRows([data]);
    return hydrated ?? null;
  }

  async createIdempotent(input: CreateReportInput): Promise<IdempotentCreateResult> {
    const existing = await this.getByClientId(input.client_id);
    if (existing) {
      return { report: existing, created: false };
    }

    const insertPayload = mapCreateReportInputToDbInsert(input);
    const { data, error } = await this.client
      .from('reports')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      const normalized = normalizeDatabaseError(error);
      if (normalized.code === 'DUPLICATE_CLIENT_ID' || normalized.code === 'UNIQUE_VIOLATION') {
        const afterConflict = await this.getByClientId(input.client_id);
        if (afterConflict) {
          return { report: afterConflict, created: false };
        }
      }
      throw normalized;
    }

    const [hydrated] = await this.hydrateReportRows([data]);
    return { report: hydrated, created: true };
  }

  async transitionStatus(input: TransitionReportStatusInput): Promise<LocalReport> {
    const updatePayload: ReportUpdate = {
      status: input.nextStatus,
      version: input.expectedVersion + 1,
    };

    if (input.nextStatus === 'submitted') {
      updatePayload.submitted_at = new Date().toISOString();
    }

    if (input.assignedTo !== undefined) {
      updatePayload.assigned_to = input.assignedTo;
    }

    if (input.nextStatus === 'rejected') {
      updatePayload.rejection_reason = input.rejectionReason ?? null;
    }

    const { data, error } = await this.client
      .from('reports')
      .update(updatePayload)
      .eq('id', input.reportId)
      .eq('version', input.expectedVersion)
      .select('*')
      .maybeSingle();

    if (error) {
      throw normalizeDatabaseError(error);
    }

    if (!data) {
      const current = await this.getById(input.reportId);
      if (!current) {
        throw new AppDatabaseError({
          code: 'NOT_FOUND',
          message: 'Report was not found or you do not have permission to update it.',
          httpStatus: 404,
        });
      }
      if (current.version !== input.expectedVersion) {
        throw new AppDatabaseError({
          code: 'VERSION_CONFLICT',
          message:
            'This report was updated by another user. Refresh the latest version before saving changes.',
          httpStatus: 409,
        });
      }
      throw new AppDatabaseError({
        code: 'RLS_POLICY_VIOLATION',
        message: 'Permission denied for this report status transition.',
        httpStatus: 403,
      });
    }

    const [hydrated] = await this.hydrateReportRows([data]);
    return hydrated;
  }

  async deleteDraft(id: string): Promise<void> {
    const { error } = await this.client
      .from('reports')
      .delete()
      .eq('id', id)
      .eq('status', 'draft');

    if (error) {
      throw normalizeDatabaseError(error);
    }
  }

  private async hydrateReportRows(rows: ReportRow[]): Promise<LocalReport[]> {
    if (rows.length === 0) return [];

    const profileIds: string[] = [];
    for (const row of rows) {
      profileIds.push(row.created_by);
      if (row.assigned_to) {
        profileIds.push(row.assigned_to);
      }
    }

    const profileMap = new Map<string, VisibleProfileName>();
    if (profileIds.length > 0) {
      try {
        const visible = await this.profileRepo.getVisibleProfileNames(profileIds);
        for (const p of visible) {
          profileMap.set(p.id, p);
        }
      } catch {
        // Non-fatal fallback: mapper defaults creator_name cleanly
      }
    }

    const mapped = await Promise.all(
      rows.map(async (row) => {
        const report = mapReportRowToLocalReport(row, profileMap);

        if (isStorageObjectPath(report.photo_url)) {
          try {
            report.photo_url = await this.mediaRepo.createSignedUrl(report.photo_url);
          } catch {
            // Keep object path if signed URL generation fails transiently
          }
        }

        if (isStorageObjectPath(report.audio_url)) {
          try {
            report.audio_url = await this.mediaRepo.createSignedUrl(report.audio_url);
          } catch {
            // Keep object path if signed URL generation fails transiently
          }
        }

        return report;
      })
    );

    return mapped;
  }
}
