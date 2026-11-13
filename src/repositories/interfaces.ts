import type {
  ActivityLog,
  ActivityLogDetails,
  AuditEventType,
  LocalReport,
  ReportCategory,
  ReportPriority,
  ReportStatus,
  SyncLogEntry,
  SyncLogStatus,
  UserProfile,
  VisibleProfileName,
} from '../types';

/**
 * Clean Repository Interfaces for FieldTrack
 *
 * Decouples UI/Sync/API consumers from storage details so Dexie offline
 * persistence and Supabase PostgreSQL + Storage repositories can implement
 * consistent contracts across Phases 3–5.
 */

export interface ReportQueryFilter {
  status?: ReportStatus;
  priority?: ReportPriority;
  category?: ReportCategory;
  createdBy?: string;
  assignedTo?: string;
  updatedAfter?: string;
  limit?: number;
}

export interface CreateReportInput {
  client_id: string;
  created_by: string;
  category: ReportCategory;
  title: string;
  description: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  priority: ReportPriority;
  status: Extract<ReportStatus, 'draft' | 'submitted'>;
  photo_url?: string | null;
  audio_url?: string | null;
  reported_at?: string;
}

export interface IdempotentCreateResult {
  report: LocalReport;
  created: boolean; // false when an existing client_id row was returned
}

export interface TransitionReportStatusInput {
  reportId: string;
  expectedVersion: number;
  nextStatus: Exclude<ReportStatus, 'draft'>;
  assignedTo?: string | null;
  rejectionReason?: string | null;
}

export interface AppendActivityLogInput {
  report_id: string;
  actor_id: string;
  action: AuditEventType;
  description?: string | null;
  metadata?: ActivityLogDetails;
}

export interface RecordSyncAttemptInput {
  report_id?: string | null;
  client_id?: string | null;
  user_id: string;
  sync_status: SyncLogStatus;
  error_message?: string | null;
  attempt_count: number;
}

export interface StorageUploadInput {
  userId: string;
  clientId: string;
  filename: string;
  contentType: string;
  data: Blob | ArrayBuffer | Uint8Array;
}

export interface IProfileRepository {
  getById(userId: string): Promise<UserProfile | null>;
  updateOwnProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'full_name' | 'phone_number' | 'organization' | 'avatar_url'>>
  ): Promise<UserProfile>;
  getVisibleProfileNames(profileIds: string[]): Promise<VisibleProfileName[]>;
  listAssignableProfiles(): Promise<VisibleProfileName[]>;
}

export interface IReportRepository {
  listReports(filter?: ReportQueryFilter): Promise<LocalReport[]>;
  getById(id: string): Promise<LocalReport | null>;
  getByClientId(clientId: string): Promise<LocalReport | null>;
  createIdempotent(input: CreateReportInput): Promise<IdempotentCreateResult>;
  transitionStatus(input: TransitionReportStatusInput): Promise<LocalReport>;
  deleteDraft(id: string): Promise<void>;
}

/**
 * Append-only audit trail contract (no update/delete methods permitted).
 */
export interface IActivityLogRepository {
  listForReport(reportId: string): Promise<ActivityLog[]>;
  listRecent(limit?: number): Promise<ActivityLog[]>;
  append(input: AppendActivityLogInput): Promise<ActivityLog>;
}

export interface ISyncLogRepository {
  listForUser(userId: string, limit?: number): Promise<SyncLogEntry[]>;
  recordAttempt(input: RecordSyncAttemptInput): Promise<SyncLogEntry>;
}

export interface IMediaStorageRepository {
  uploadEvidence(input: StorageUploadInput): Promise<{ objectPath: string }>;
  createSignedUrl(objectPath: string, expiresInSeconds?: number): Promise<string>;
  deleteDraftEvidence(objectPath: string): Promise<void>;
}

/**
 * Contract for the local Dexie IndexedDB repository currently powering
 * offline-first capture and queue storage.
 */
export interface ILocalOfflineStore {
  getAllReports(): Promise<LocalReport[]>;
  getOperationalReports(): Promise<LocalReport[]>;
  getReportsByCreator(userId: string): Promise<LocalReport[]>;
  getReportByIdOrClientId(reportId: string | number): Promise<LocalReport | undefined>;
  saveReport(reportData: LocalReport, existingId?: number): Promise<number>;
  updateReportFields(id: number, changes: Partial<LocalReport>): Promise<number>;
  deleteReport(id: number): Promise<void>;
  getPendingOrFailedReports(): Promise<LocalReport[]>;
  getAllActivityLogs(): Promise<ActivityLog[]>;
  getLogsForReport(clientId: string, serverId?: string): Promise<ActivityLog[]>;
  addActivityLog(log: ActivityLog): Promise<string>;
}
