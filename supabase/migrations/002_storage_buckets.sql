-- ============================================================================
-- Offline Field Issue Tracker (FieldTrack)
-- Migration: 002_storage_buckets.sql
-- Target: Supabase PostgreSQL + Supabase Storage
--
-- Purpose:
--   1. Provision private `report-media` Storage bucket for field photos and
--      voice memos with strict MIME type and file-size guardrails.
--   2. Configure RLS policies on `storage.objects` scoped by `<user_id>/...`.
--   3. Add incremental pull-sync index on `public.reports(updated_at DESC)`.
--   4. Provide a minimal, PII-free RPC (`get_visible_profile_names`) so
--      field workers can resolve assignee display names on their own reports.
--
-- Prerequisite:
--   Run `supabase/migrations/001_initial_schema.sql` first.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Incremental Delta-Sync Index
-- ----------------------------------------------------------------------------

-- Supports fast client pull-sync queries filtering by `updated_at > last_sync`
CREATE INDEX IF NOT EXISTS idx_reports_updated_at_desc
  ON public.reports (updated_at DESC);

-- ----------------------------------------------------------------------------
-- 2. Minimal Display-Name Lookup RPC for Report Attribution
-- ----------------------------------------------------------------------------

-- Allows authenticated users to resolve display names (`id`, `full_name`,
-- `role`) ONLY for profiles referenced as `created_by`, `assigned_to`, or
-- `actor_id` on reports/logs the caller is already permitted to view.
-- Excludes PII (`email`, `phone_number`) and prevents arbitrary user enumeration.
CREATE OR REPLACE FUNCTION public.get_visible_profile_names(p_profile_ids UUID[])
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.id = ANY(COALESCE(p_profile_ids, ARRAY[]::UUID[]))
    AND (
      p.id = auth.uid()
      OR public.is_coordinator()
      OR EXISTS (
        SELECT 1
        FROM public.reports r
        WHERE r.created_by = auth.uid()
          AND (r.assigned_to = p.id OR r.created_by = p.id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.activity_logs al
        JOIN public.reports r ON r.id = al.report_id
        WHERE r.created_by = auth.uid()
          AND al.actor_id = p.id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_visible_profile_names(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_profile_names(UUID[]) TO authenticated;

COMMENT ON FUNCTION public.get_visible_profile_names(UUID[]) IS
  'Returns non-PII display names and roles exclusively for profiles visible on the caller''s accessible reports or activity logs.';

-- ----------------------------------------------------------------------------
-- 3. Private Storage Bucket for Field Media (`report-media`)
-- ----------------------------------------------------------------------------

-- Object key convention: `<auth_user_uuid>/<report_client_uuid>/<filename>`
-- Bucket stays private (`public = false`) so evidence requires signed URLs
-- or authenticated Storage requests governed by RLS.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-media',
  'report-media',
  FALSE,
  10485760, -- 10 MiB max per uploaded photo or audio clip
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/mpeg'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 4. Storage Object RLS Policies (`storage.objects`)
-- ----------------------------------------------------------------------------

-- Active workers can read their own uploaded media; active coordinators can
-- read media across submitted/operational reports.
DROP POLICY IF EXISTS "report_media_select_owner_or_coordinator" ON storage.objects;
CREATE POLICY "report_media_select_owner_or_coordinator"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_coordinator()
    )
  );

-- Active users may upload only inside their own `<auth.uid()>/...` prefix
DROP POLICY IF EXISTS "report_media_insert_own_folder" ON storage.objects;
CREATE POLICY "report_media_insert_own_folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'report-media'
    AND public.is_active_user()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners may delete unsubmitted/draft media only; evidence linked to submitted
-- or operational reports cannot be deleted once submitted.
DROP POLICY IF EXISTS "report_media_delete_unsubmitted_own" ON storage.objects;
CREATE POLICY "report_media_delete_unsubmitted_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'report-media'
    AND public.is_active_user()
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.created_by = auth.uid()
        AND r.status <> 'draft'
        AND (r.photo_url = name OR r.audio_url = name)
    )
  );
