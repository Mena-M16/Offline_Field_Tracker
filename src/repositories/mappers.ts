import type {
  ActivityLog,
  ActivityLogDetails,
  LocalReport,
  SyncLogEntry,
  UserProfile,
  UserRole,
  VisibleProfileName,
} from '../types';
import type {
  ActivityLogInsert,
  ActivityLogRow,
  Json,
  ProfileRow,
  ReportInsert,
  ReportRow,
  SyncLogInsert,
  SyncLogRow,
  VisibleProfileNameRow,
} from '../types/supabase';
import type {
  AppendActivityLogInput,
  CreateReportInput,
  RecordSyncAttemptInput,
} from './interfaces';

/**
 * Pure Data Mappers Between Supabase PostgreSQL Rows and Frontend Models
 *
 * Bridges schema field differences cleanly without modifying existing UI
 * components or inventing unmigrated database columns.
 */

export function mapProfileRowToUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    phone_number: row.phone_number ?? undefined,
    role: row.role,
    organization: row.organization,
    avatar_url: row.avatar_url ?? undefined,
    is_active: row.is_active,
    disabled_at: row.disabled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapVisibleProfileRow(row: VisibleProfileNameRow): VisibleProfileName {
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.role,
  };
}

export function mapReportRowToLocalReport(
  row: ReportRow,
  profileNames?: Map<string, VisibleProfileName>
): LocalReport {
  const creator = profileNames?.get(row.created_by);
  const assignee = row.assigned_to ? profileNames?.get(row.assigned_to) : undefined;

  return {
    client_id: row.client_id,
    server_id: row.id,
    created_by: row.created_by,
    creator_name: creator?.full_name ?? 'Field Worker',
    assigned_to: row.assigned_to ?? undefined,
    assignee_name: assignee?.full_name,
    category: row.category,
    title: row.title,
    description: row.description,
    location_name: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy_meters: row.accuracy_meters,
    priority: row.priority,
    status: row.status,
    sync_status: row.status === 'draft' ? 'draft' : 'synchronized',
    rejection_reason: row.rejection_reason ?? undefined,
    photo_url: row.photo_url ?? undefined,
    audio_url: row.audio_url ?? undefined,
    reported_at: row.reported_at,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
    sync_attempts: 1,
    last_sync_error: null,
  };
}

export function mapCreateReportInputToDbInsert(input: CreateReportInput): ReportInsert {
  return {
    client_id: input.client_id,
    created_by: input.created_by,
    category: input.category,
    title: input.title,
    description: input.description,
    location_name: input.location_name,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_meters: input.accuracy_meters,
    priority: input.priority,
    status: input.status,
    photo_url: input.photo_url ?? null,
    audio_url: input.audio_url ?? null,
    reported_at: input.reported_at,
    submitted_at: input.status === 'submitted' ? input.reported_at ?? new Date().toISOString() : null,
  };
}

function asMetadataRecord(metadata: Json): ActivityLogDetails {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as unknown as ActivityLogDetails;
  }
  return {};
}

export function mapActivityLogRowToActivityLog(
  row: ActivityLogRow,
  actorProfile?: VisibleProfileName
): ActivityLog {
  const details = asMetadataRecord(row.metadata);
  const resolvedRole: UserRole =
    actorProfile?.role ??
    (details.actor_role === 'coordinator' ? 'coordinator' : 'field_worker');

  return {
    id: row.id,
    report_id: row.report_id,
    client_id: typeof details.client_id === 'string' ? details.client_id : undefined,
    actor_id: row.actor_id,
    actor_name:
      actorProfile?.full_name ??
      (typeof details.actor_name === 'string' ? details.actor_name : 'System User'),
    actor_role: resolvedRole,
    event_type: row.action,
    details: {
      ...details,
      note: details.note ?? row.description ?? undefined,
    },
    description: row.description,
    created_at: row.created_at,
  };
}

export function mapAppendActivityInputToDbInsert(
  input: AppendActivityLogInput
): ActivityLogInsert {
  return {
    report_id: input.report_id,
    actor_id: input.actor_id,
    action: input.action,
    description: input.description ?? input.metadata?.note ?? null,
    metadata: (input.metadata ?? {}) as unknown as Json,
  };
}

export function mapSyncLogRowToEntry(row: SyncLogRow): SyncLogEntry {
  return {
    id: row.id,
    report_id: row.report_id,
    client_id: row.client_id,
    user_id: row.user_id,
    sync_status: row.sync_status,
    error_message: row.error_message,
    attempt_count: row.attempt_count,
    created_at: row.created_at,
  };
}

export function mapRecordSyncAttemptToDbInsert(
  input: RecordSyncAttemptInput
): SyncLogInsert {
  return {
    report_id: input.report_id ?? null,
    client_id: input.client_id ?? null,
    user_id: input.user_id,
    sync_status: input.sync_status,
    error_message: input.error_message ?? null,
    attempt_count: input.attempt_count,
  };
}

/**
 * Generates deterministic private Storage object path matching `002_storage_buckets.sql`:
 * `<auth_user_uuid>/<report_client_uuid>/<sanitized_filename>`
 */
export function buildStorageObjectPath(
  userId: string,
  clientId: string,
  filename: string
): string {
  const safeName = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+/, '') || `evidence_${Date.now()}`;
  return `${userId}/${clientId}/${safeName}`;
}
