-- ============================================================================
-- Offline Field Issue Tracker (FieldTrack)
-- Migration: 001_initial_schema.sql
-- Target: Supabase PostgreSQL (PostgreSQL 15+)
--
-- Purpose:
--   Establishes the relational schema, constraints, indexes, lifecycle
--   triggers, and Row Level Security (RLS) policies for FieldTrack.
--
-- Note:
--   Creating this file does NOT execute it against a live database.
--   Apply it manually in the Supabase SQL Editor or via `supabase db push`.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Core Tables (profiles created first so SQL helper functions compile cleanly)
-- ----------------------------------------------------------------------------

-- 1.1 Utility trigger function to maintain updated_at on row modification
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- 1.2 profiles
-- Links 1:1 with Supabase Auth (`auth.users`). Soft-disable columns (`is_active`,
-- `disabled_at`) allow administrators to deactivate departed or suspended staff
-- without deleting records referenced by reports and audit logs.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  email TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  organization TEXT NOT NULL DEFAULT 'Rural Public Infrastructure Services',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'field_worker'
    CHECK (role IN ('field_worker', 'coordinator')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_active_disabled_at_chk CHECK (
    (is_active = TRUE AND disabled_at IS NULL)
    OR (is_active = FALSE AND disabled_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.profiles IS
  'Application user profiles linked 1:1 with Supabase auth.users. Public signups default strictly to field_worker; accounts are soft-disabled via is_active/disabled_at to preserve historical audit integrity.';
COMMENT ON COLUMN public.profiles.role IS
  'RBAC role enforced by database checks, triggers, and RLS. Only postgres/supabase_admin/service_role may promote a user to coordinator.';
COMMENT ON COLUMN public.profiles.is_active IS
  'Soft-disable flag. Inactive users retain historical attribution on reports and activity_logs but are blocked from mutating records.';

-- 1.3 Authorization helper functions (defined after public.profiles exists)
-- Check whether the authenticated user holds an active coordinator profile.
-- SECURITY DEFINER avoids recursive RLS evaluation when policies on `profiles`
-- or `reports` inspect role membership.
CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'coordinator'
      AND is_active = TRUE
  );
$$;

-- Check whether the authenticated user's profile is currently active.
-- Used by write RLS policies so soft-disabled accounts cannot create or modify
-- operational records while preserving all existing historical reports.
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = TRUE
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Remaining Core Tables
-- ----------------------------------------------------------------------------

-- 2.2 reports
-- Core infrastructure issue reports synchronized from field devices.
-- Decision notes:
--   - `client_id` is generated on-device (UUID v4) and enforces UNIQUE
--     idempotency so offline sync retries never produce duplicate reports.
--   - `created_by` uses ON DELETE RESTRICT so deleting a profile or Auth user
--     cannot accidentally destroy historical field reports.
--   - `assigned_to` uses ON DELETE SET NULL if an unassigned account were ever
--     removed, though normal offboarding uses soft-disable (`is_active = FALSE`).
--   - `version` enables optimistic concurrency control during coordinator edits.
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'water_infrastructure',
      'equipment_damage',
      'service_interruption',
      'safety_concern',
      'maintenance',
      'other'
    )
  ),
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 3),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 5),
  location_name TEXT NOT NULL CHECK (char_length(trim(location_name)) >= 2),
  latitude DOUBLE PRECISION CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude DOUBLE PRECISION CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  accuracy_meters DOUBLE PRECISION CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'assigned', 'in_progress', 'resolved', 'rejected')),
  rejection_reason TEXT,
  photo_url TEXT,
  audio_url TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reports_coordinates_pair_chk CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  CONSTRAINT reports_rejection_reason_chk CHECK (
    status <> 'rejected'
    OR char_length(trim(COALESCE(rejection_reason, ''))) >= 10
  ),
  CONSTRAINT reports_submitted_at_chk CHECK (
    status = 'draft'
    OR submitted_at IS NOT NULL
  )
);

COMMENT ON TABLE public.reports IS
  'Infrastructure issue reports captured offline or online. Enforces client_id uniqueness for idempotent sync, optimistic locking via version, and strict workflow state transitions.';
COMMENT ON COLUMN public.reports.client_id IS
  'Client-generated UUID v4 idempotency key persisted in IndexedDB prior to sync to prevent duplicate rows on retry.';
COMMENT ON COLUMN public.reports.created_by IS
  'Original field worker profile ID. ON DELETE RESTRICT prevents cascading loss of report history if account deletion is attempted.';
COMMENT ON COLUMN public.reports.version IS
  'Monotonic optimistic concurrency counter incremented on every update to prevent lost coordinator updates.';

-- 2.3 activity_logs
-- Immutable append-only audit trail recording every report lifecycle event.
-- Both `report_id` and `actor_id` use ON DELETE RESTRICT so neither reports nor
-- actors with audit records can be accidentally deleted.
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (
    action IN (
      'report_created',
      'report_saved_offline',
      'report_submitted',
      'sync_started',
      'sync_completed',
      'sync_failed',
      'report_assigned',
      'status_changed',
      'report_rejected',
      'comment_added'
    )
  ),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.activity_logs IS
  'Append-only audit trail for infrastructure reports. Protected by triggers and privileges against any UPDATE or DELETE operations.';
COMMENT ON COLUMN public.activity_logs.actor_id IS
  'Profile ID of the worker or coordinator who performed the action. ON DELETE RESTRICT preserves audit attribution.';

-- 2.4 sync_logs
-- Telemetry and failure history for offline synchronization attempts.
-- `report_id` is nullable with ON DELETE SET NULL so failed sync attempts that
-- occurred before server persistence can still be logged via `client_id`.
-- `user_id` uses ON DELETE RESTRICT to preserve historical sync telemetry.
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  client_id UUID,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sync_status TEXT NOT NULL CHECK (
    sync_status IN ('pending', 'synchronizing', 'synchronized', 'failed', 'conflict')
  ),
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sync_logs_target_ref_chk CHECK (
    report_id IS NOT NULL OR client_id IS NOT NULL
  )
);

COMMENT ON TABLE public.sync_logs IS
  'Offline queue synchronization telemetry and error diagnostics per worker/report.';
COMMENT ON COLUMN public.sync_logs.report_id IS
  'Nullable foreign key to reports; remains NULL when logging pre-persistence failures identified by client_id.';

-- ----------------------------------------------------------------------------
-- 3. Indexes for Common Query Patterns
-- ----------------------------------------------------------------------------

-- Profile lookups by role and active status (coordinator assignment lists)
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role);

CREATE INDEX IF NOT EXISTS idx_profiles_is_active
  ON public.profiles (is_active)
  WHERE is_active = TRUE;

-- Worker "My Reports" and coordinator assignee filters
CREATE INDEX IF NOT EXISTS idx_reports_created_by_created_at
  ON public.reports (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_assigned_to
  ON public.reports (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- Coordinator triage, filtering, and analytics queries
CREATE INDEX IF NOT EXISTS idx_reports_status
  ON public.reports (status);

CREATE INDEX IF NOT EXISTS idx_reports_priority
  ON public.reports (priority);

CREATE INDEX IF NOT EXISTS idx_reports_category
  ON public.reports (category);

CREATE INDEX IF NOT EXISTS idx_reports_status_priority
  ON public.reports (status, priority);

CREATE INDEX IF NOT EXISTS idx_reports_created_at_desc
  ON public.reports (created_at DESC);

-- Activity timeline per report and per actor
CREATE INDEX IF NOT EXISTS idx_activity_logs_report_created
  ON public.activity_logs (report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id
  ON public.activity_logs (actor_id);

-- Sync diagnostics per report, client_id, and user
CREATE INDEX IF NOT EXISTS idx_sync_logs_report_id
  ON public.sync_logs (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_logs_client_id
  ON public.sync_logs (client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_logs_user_created
  ON public.sync_logs (user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Domain Integrity & Security Triggers
-- ----------------------------------------------------------------------------

-- 4.1 Maintain updated_at automatically on profiles and reports
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4.2 Auto-provision a profile row whenever a user registers in auth.users.
-- Role is strictly hardcoded to 'field_worker' so client metadata can never
-- escalate privileges during public registration.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_phone TEXT;
  v_email TEXT;
BEGIN
  v_email := lower(trim(COALESCE(NULLIF(trim(NEW.email), ''), NEW.id::text || '@unknown.local')));
  v_full_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '');
  IF v_full_name IS NULL OR char_length(v_full_name) < 2 THEN
    v_full_name := split_part(v_email, '@', 1);
    IF char_length(v_full_name) < 2 THEN
      v_full_name := 'Field Worker';
    END IF;
  END IF;

  v_phone := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'phone_number', '')), '');

  INSERT INTO public.profiles (id, full_name, email, phone_number, role, is_active)
  VALUES (
    NEW.id,
    v_full_name,
    v_email,
    v_phone,
    'field_worker',
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Keep public.profiles.email synchronized when auth.users.email is updated
CREATE OR REPLACE FUNCTION public.handle_auth_user_email_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = lower(trim(COALESCE(NULLIF(trim(NEW.email), ''), NEW.id::text || '@unknown.local')))
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_email_updated();

-- 4.3 Prevent non-administrative modification of privileged profile columns
-- (`role`, `is_active`, `disabled_at`, `email`) and auto-maintain `disabled_at`.
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_jwt_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(auth.jwt() ->> 'role', ''),
    ''
  );
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.disabled_at IS DISTINCT FROM OLD.disabled_at THEN
    IF current_user NOT IN ('postgres', 'supabase_admin') AND v_jwt_role <> 'service_role' THEN
      RAISE EXCEPTION 'FORBIDDEN_PROFILE_PRIVILEGE_CHANGE: Only administrators may modify role or activation status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    IF current_user NOT IN ('postgres', 'supabase_admin') AND v_jwt_role <> 'service_role' THEN
      RAISE EXCEPTION 'FORBIDDEN_EMAIL_CHANGE: Profile email is managed by Supabase Auth.'
        USING ERRCODE = '42501';
    END IF;
    NEW.email := lower(trim(NEW.email));
  END IF;

  -- Keep disabled_at synchronized with is_active for administrative updates
  IF NEW.is_active = FALSE AND NEW.disabled_at IS NULL THEN
    NEW.disabled_at := NOW();
  ELSIF NEW.is_active = TRUE THEN
    NEW.disabled_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_escalation();

-- 4.4 Enforce safe initial defaults on report inserts
CREATE OR REPLACE FUNCTION public.enforce_report_insert_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('draft', 'submitted') THEN
    NEW.version := 1;
    NEW.rejection_reason := NULL;
  END IF;

  IF NEW.status <> 'draft' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_insert_defaults ON public.reports;
CREATE TRIGGER trg_reports_insert_defaults
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_report_insert_defaults();

-- 4.5 Enforce immutable identity fields, strict workflow transitions, and
-- optimistic concurrency (`version = OLD.version + 1` required on update):
--   draft -> submitted -> assigned -> in_progress -> resolved
--   submitted | assigned | in_progress -> rejected (requires >= 10 char reason)
CREATE OR REPLACE FUNCTION public.enforce_report_lifecycle_and_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
  v_jwt_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(auth.jwt() ->> 'role', ''),
    ''
  );
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'IMMUTABLE_CLIENT_ID: client_id cannot be modified after creation.'
      USING ERRCODE = '22000';
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'IMMUTABLE_CREATOR: created_by cannot be reassigned.'
      USING ERRCODE = '22000';
  END IF;

  -- Preserve original field worker evidence once a report has left 'draft'
  IF OLD.status <> 'draft'
     AND current_user NOT IN ('postgres', 'supabase_admin')
     AND v_jwt_role <> 'service_role' THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.location_name IS DISTINCT FROM OLD.location_name
       OR NEW.latitude IS DISTINCT FROM OLD.latitude
       OR NEW.longitude IS DISTINCT FROM OLD.longitude
       OR NEW.accuracy_meters IS DISTINCT FROM OLD.accuracy_meters
       OR NEW.photo_url IS DISTINCT FROM OLD.photo_url
       OR NEW.audio_url IS DISTINCT FROM OLD.audio_url
       OR NEW.reported_at IS DISTINCT FROM OLD.reported_at
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'IMMUTABLE_SUBMISSION_EVIDENCE: Submitted report details cannot be altered after submission.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Enforce strict status state machine before checking version so invalid
  -- workflow transitions consistently surface SQLSTATE 23514.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := CASE OLD.status
      WHEN 'draft'       THEN NEW.status IN ('submitted')
      WHEN 'submitted'   THEN NEW.status IN ('assigned', 'rejected')
      WHEN 'assigned'    THEN NEW.status IN ('in_progress', 'rejected')
      WHEN 'in_progress' THEN NEW.status IN ('resolved', 'rejected')
      ELSE FALSE -- 'resolved' and 'rejected' are terminal workflow states
    END;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot transition report from % to %.',
        OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
      NEW.submitted_at := NOW();
    END IF;

    IF NEW.status = 'rejected' AND char_length(trim(COALESCE(NEW.rejection_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'MISSING_REJECTION_REASON: Rejection requires at least 10 characters.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Strict optimistic concurrency control:
  -- Callers must pass version = expected_version + 1 (or increment in SQL),
  -- preventing stale concurrent updates or version-less overwrites.
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: Expected next version %, received %.',
      OLD.version + 1, NEW.version
      USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_lifecycle_and_version ON public.reports;
CREATE TRIGGER trg_reports_lifecycle_and_version
  BEFORE UPDATE ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_report_lifecycle_and_version();

-- 4.6 Enforce append-only immutability on activity_logs
CREATE OR REPLACE FUNCTION public.prevent_activity_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_AUDIT_LOG: activity_logs records are append-only and cannot be modified or deleted.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_logs_immutable ON public.activity_logs;
CREATE TRIGGER trg_activity_logs_immutable
  BEFORE UPDATE OR DELETE ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_activity_log_mutation();

-- ----------------------------------------------------------------------------
-- 5. Least-Privilege Table Grants & Row Level Security (RLS)
-- ----------------------------------------------------------------------------

-- Revoke broad default privileges from public/anon; authenticated users only
-- receive table privileges scoped tightly by RLS policies below.
REVOKE ALL ON public.profiles, public.reports, public.activity_logs, public.sync_logs FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT SELECT, INSERT ON public.sync_logs TO authenticated;

REVOKE ALL ON FUNCTION public.is_coordinator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_coordinator() TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 profiles policies
DROP POLICY IF EXISTS "profiles_select_own_or_coordinator" ON public.profiles;
CREATE POLICY "profiles_select_own_or_coordinator"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_coordinator());

DROP POLICY IF EXISTS "profiles_insert_self_field_worker_only" ON public.profiles;
CREATE POLICY "profiles_insert_self_field_worker_only"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND role = 'field_worker'
    AND is_active = TRUE
    AND disabled_at IS NULL
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND is_active = TRUE)
  WITH CHECK (auth.uid() = id AND is_active = TRUE);

-- 5.2 reports policies
-- Workers view their own reports (even if an old account is disabled, or active);
-- active coordinators view all non-draft reports across every field worker.
DROP POLICY IF EXISTS "reports_select_worker_own_or_coordinator_operational" ON public.reports;
CREATE POLICY "reports_select_worker_own_or_coordinator_operational"
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR (public.is_coordinator() AND status <> 'draft')
  );

-- Active workers/coordinators can insert their own drafts or submitted reports
DROP POLICY IF EXISTS "reports_insert_own_initial_state" ON public.reports;
CREATE POLICY "reports_insert_own_initial_state"
  ON public.reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND created_by = auth.uid()
    AND status IN ('draft', 'submitted')
  );

-- Active creators may edit or submit only their own drafts
DROP POLICY IF EXISTS "reports_update_worker_drafts" ON public.reports;
CREATE POLICY "reports_update_worker_drafts"
  ON public.reports
  FOR UPDATE
  TO authenticated
  USING (
    public.is_active_user()
    AND created_by = auth.uid()
    AND status = 'draft'
  )
  WITH CHECK (
    public.is_active_user()
    AND created_by = auth.uid()
    AND status IN ('draft', 'submitted')
  );

-- Active coordinators may assign, transition, or reject non-draft reports
DROP POLICY IF EXISTS "reports_update_coordinator_workflow" ON public.reports;
CREATE POLICY "reports_update_coordinator_workflow"
  ON public.reports
  FOR UPDATE
  TO authenticated
  USING (
    public.is_coordinator()
    AND status <> 'draft'
  )
  WITH CHECK (
    public.is_coordinator()
    AND status IN ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected')
  );

-- Creators may delete only unsubmitted drafts; submitted/resolved reports are preserved
DROP POLICY IF EXISTS "reports_delete_own_drafts_only" ON public.reports;
CREATE POLICY "reports_delete_own_drafts_only"
  ON public.reports
  FOR DELETE
  TO authenticated
  USING (
    public.is_active_user()
    AND created_by = auth.uid()
    AND status = 'draft'
  );

-- 5.3 activity_logs policies (append-only)
DROP POLICY IF EXISTS "activity_logs_select_accessible_reports" ON public.activity_logs;
CREATE POLICY "activity_logs_select_accessible_reports"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = activity_logs.report_id
        AND (
          r.created_by = auth.uid()
          OR (public.is_coordinator() AND r.status <> 'draft')
        )
    )
  );

DROP POLICY IF EXISTS "activity_logs_insert_authorized_actor" ON public.activity_logs;
CREATE POLICY "activity_logs_insert_authorized_actor"
  ON public.activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND actor_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = activity_logs.report_id
        AND (
          r.created_by = auth.uid()
          OR (public.is_coordinator() AND r.status <> 'draft')
        )
    )
  );

-- 5.4 sync_logs policies (append-only telemetry)
DROP POLICY IF EXISTS "sync_logs_select_own_or_coordinator" ON public.sync_logs;
CREATE POLICY "sync_logs_select_own_or_coordinator"
  ON public.sync_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_coordinator()
  );

DROP POLICY IF EXISTS "sync_logs_insert_own" ON public.sync_logs;
CREATE POLICY "sync_logs_insert_own"
  ON public.sync_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND user_id = auth.uid()
  );
