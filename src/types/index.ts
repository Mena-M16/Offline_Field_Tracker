import type {
  DbActivityAction,
  DbReportCategory,
  DbReportPriority,
  DbReportStatus,
  DbSyncLogStatus,
  DbUserRole,
} from './supabase';

export type UserRole = DbUserRole;

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  role: UserRole;
  organization: string;
  avatar_url?: string;
  is_active?: boolean;
  disabled_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ReportCategory = DbReportCategory;
export type ReportPriority = DbReportPriority;
export type ReportStatus = DbReportStatus;

export type SyncStatus =
  | 'draft'
  | 'pending'
  | 'synchronizing'
  | 'synchronized'
  | 'failed';

export type SyncLogStatus = DbSyncLogStatus;

export interface LocalReport {
  id?: number;               // Dexie local auto-increment PK
  client_id: string;         // UUID v4 persistent idempotency key (reports.client_id)
  server_id?: string;        // Server UUID assigned once persisted (reports.id)
  created_by: string;        // Worker profile UUID (reports.created_by)
  creator_name: string;      // Cached/resolved display name for UI rendering
  assigned_to?: string;      // Assigned profile UUID (reports.assigned_to)
  assignee_name?: string;    // Cached/resolved display name via get_visible_profile_names
  category: ReportCategory;
  title: string;
  description: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  priority: ReportPriority;
  status: ReportStatus;
  sync_status: SyncStatus;
  rejection_reason?: string;
  photo_url?: string;        // Storage object path, signed/remote URL, or offline preview
  photo_blob?: Blob;         // Stored locally in IndexedDB while offline
  audio_url?: string;        // Storage object path or offline data URL
  reported_at: string;
  submitted_at?: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  sync_attempts: number;
  last_sync_error?: string | null;
}

export type AuditEventType = DbActivityAction;

export interface ActivityLogDetails {
  previous_status?: ReportStatus;
  new_status?: ReportStatus;
  assigned_to?: string;
  assignee_name?: string;
  reason?: string;
  note?: string;
  error?: string;
  client_id?: string;
  actor_name?: string;
  actor_role?: UserRole;
}

export interface ActivityLog {
  id: string;
  report_id: string;
  client_id?: string;
  actor_id: string;
  actor_name: string;
  actor_role: UserRole;
  event_type: AuditEventType;
  details: ActivityLogDetails;
  description?: string | null;
  created_at: string;
}

export interface SyncLogEntry {
  id: string;
  report_id: string | null;
  client_id: string | null;
  user_id: string;
  sync_status: SyncLogStatus;
  error_message: string | null;
  attempt_count: number;
  created_at: string;
}

export interface VisibleProfileName {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface DashboardStats {
  total_reports: number;
  pending_sync: number;
  submitted: number;
  assigned: number;
  in_progress: number;
  resolved: number;
  rejected: number;
  critical_count: number;
  high_count: number;
  category_breakdown: Record<ReportCategory, number>;
  priority_breakdown: Record<ReportPriority, number>;
  status_breakdown: Record<ReportStatus, number>;
}
