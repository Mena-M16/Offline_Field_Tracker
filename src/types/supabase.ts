/**
 * Supabase PostgreSQL Database Type Definitions
 *
 * Strictly aligned with:
 *   - supabase/migrations/001_initial_schema.sql
 *   - supabase/migrations/002_storage_buckets.sql
 *
 * Do NOT add unmigrated columns or invent schema fields here.
 */

export type DbUserRole = 'field_worker' | 'coordinator';

export type DbReportCategory =
  | 'water_infrastructure'
  | 'equipment_damage'
  | 'service_interruption'
  | 'safety_concern'
  | 'maintenance'
  | 'other';

export type DbReportPriority = 'low' | 'medium' | 'high' | 'critical';

export type DbReportStatus =
  | 'draft'
  | 'submitted'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'rejected';

export type DbActivityAction =
  | 'report_created'
  | 'report_saved_offline'
  | 'report_submitted'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'report_assigned'
  | 'status_changed'
  | 'report_rejected'
  | 'comment_added';

export type DbSyncLogStatus =
  | 'pending'
  | 'synchronizing'
  | 'synchronized'
  | 'failed'
  | 'conflict';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone_number: string | null;
          organization: string;
          avatar_url: string | null;
          role: DbUserRole;
          is_active: boolean;
          disabled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          phone_number?: string | null;
          organization?: string;
          avatar_url?: string | null;
          role?: DbUserRole;
          is_active?: boolean;
          disabled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          phone_number?: string | null;
          organization?: string;
          avatar_url?: string | null;
          role?: DbUserRole;
          is_active?: boolean;
          disabled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          client_id: string;
          created_by: string;
          assigned_to: string | null;
          category: DbReportCategory;
          title: string;
          description: string;
          location_name: string;
          latitude: number | null;
          longitude: number | null;
          accuracy_meters: number | null;
          priority: DbReportPriority;
          status: DbReportStatus;
          rejection_reason: string | null;
          photo_url: string | null;
          audio_url: string | null;
          version: number;
          reported_at: string;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          created_by: string;
          assigned_to?: string | null;
          category: DbReportCategory;
          title: string;
          description: string;
          location_name: string;
          latitude?: number | null;
          longitude?: number | null;
          accuracy_meters?: number | null;
          priority?: DbReportPriority;
          status?: DbReportStatus;
          rejection_reason?: string | null;
          photo_url?: string | null;
          audio_url?: string | null;
          version?: number;
          reported_at?: string;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          created_by?: string;
          assigned_to?: string | null;
          category?: DbReportCategory;
          title?: string;
          description?: string;
          location_name?: string;
          latitude?: number | null;
          longitude?: number | null;
          accuracy_meters?: number | null;
          priority?: DbReportPriority;
          status?: DbReportStatus;
          rejection_reason?: string | null;
          photo_url?: string | null;
          audio_url?: string | null;
          version?: number;
          reported_at?: string;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_logs: {
        Row: {
          id: string;
          report_id: string;
          actor_id: string;
          action: DbActivityAction;
          description: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id: string;
          actor_id: string;
          action: DbActivityAction;
          description?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string;
          actor_id?: string;
          action?: DbActivityAction;
          description?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_logs_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      sync_logs: {
        Row: {
          id: string;
          report_id: string | null;
          client_id: string | null;
          user_id: string;
          sync_status: DbSyncLogStatus;
          error_message: string | null;
          attempt_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_id?: string | null;
          client_id?: string | null;
          user_id: string;
          sync_status: DbSyncLogStatus;
          error_message?: string | null;
          attempt_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          report_id?: string | null;
          client_id?: string | null;
          user_id?: string;
          sync_status?: DbSyncLogStatus;
          error_message?: string | null;
          attempt_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sync_logs_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sync_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_visible_profile_names: {
        Args: {
          p_profile_ids: string[];
        };
        Returns: {
          id: string;
          full_name: string;
          role: DbUserRole;
        }[];
      };
      is_coordinator: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_active_user: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export type ReportRow = Database['public']['Tables']['reports']['Row'];
export type ReportInsert = Database['public']['Tables']['reports']['Insert'];
export type ReportUpdate = Database['public']['Tables']['reports']['Update'];

export type ActivityLogRow = Database['public']['Tables']['activity_logs']['Row'];
export type ActivityLogInsert = Database['public']['Tables']['activity_logs']['Insert'];

export type SyncLogRow = Database['public']['Tables']['sync_logs']['Row'];
export type SyncLogInsert = Database['public']['Tables']['sync_logs']['Insert'];

export type VisibleProfileNameRow =
  Database['public']['Functions']['get_visible_profile_names']['Returns'][number];
