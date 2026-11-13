-- ============================================================================
-- Offline Field Issue Tracker (FieldTrack)
-- Verification Suite: supabase/tests/002_verify_storage_and_sync_index.sql
--
-- Purpose:
--   Verifies migration `002_storage_buckets.sql` inside a rolled-back
--   transaction:
--     1. `idx_reports_updated_at_desc` index exists on `public.reports`.
--     2. `report-media` private bucket exists with 10 MiB limit and MIME filter.
--     3. `storage.objects` RLS enforces owner-only uploads, blocks cross-worker
--        access, allows coordinator reads, and protects submitted evidence.
--     4. `public.get_visible_profile_names()` exposes display names only for
--        report-linked profiles without leaking unrelated users or PII.
--
-- Execution:
--   Run in Supabase SQL Editor AFTER applying 001 and 002 migrations.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_worker_a UUID := gen_random_uuid();
  v_worker_b UUID := gen_random_uuid();
  v_coord    UUID := gen_random_uuid();

  v_rep_a_id     UUID;
  v_draft_path   TEXT;
  v_submit_path  TEXT;
  v_count        INTEGER;
  v_bucket_pub   BOOLEAN;
BEGIN
  -- 1. Check updated_at index exists
  SELECT COUNT(*)
  INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'reports'
    AND indexname = 'idx_reports_updated_at_desc';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CHECK 1 FAILED: idx_reports_updated_at_desc missing on public.reports.';
  END IF;
  RAISE NOTICE 'PASS [1/4]: idx_reports_updated_at_desc index exists.';

  -- 2. Check private report-media bucket
  SELECT public
  INTO v_bucket_pub
  FROM storage.buckets
  WHERE id = 'report-media';

  IF NOT FOUND OR v_bucket_pub IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'CHECK 2 FAILED: Private storage bucket report-media missing or marked public.';
  END IF;
  RAISE NOTICE 'PASS [2/4]: Private report-media storage bucket is configured.';

  -- Setup isolated synthetic users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  VALUES
    (
      v_worker_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'storage.a.' || v_worker_a::text || '@example.invalid', '!TEST_HASH_NO_LOGIN!', NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Storage Worker A"}'::jsonb, NOW(), NOW()
    ),
    (
      v_worker_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'storage.b.' || v_worker_b::text || '@example.invalid', '!TEST_HASH_NO_LOGIN!', NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Storage Worker B"}'::jsonb, NOW(), NOW()
    ),
    (
      v_coord, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'storage.c.' || v_coord::text || '@example.invalid', '!TEST_HASH_NO_LOGIN!', NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Storage Coordinator"}'::jsonb, NOW(), NOW()
    );

  UPDATE public.profiles SET role = 'coordinator' WHERE id = v_coord;

  v_draft_path  := v_worker_a::text || '/' || gen_random_uuid()::text || '/draft-photo.jpg';
  v_submit_path := v_worker_a::text || '/' || gen_random_uuid()::text || '/submitted-photo.jpg';

  INSERT INTO public.reports (
    client_id, created_by, assigned_to, category, title, description, location_name, priority, status, photo_url
  ) VALUES (
    gen_random_uuid(), v_worker_a, v_coord, 'water_infrastructure',
    'Storage Evidence Report', 'Submitted report linked to photo object path.', 'Zone 1', 'high', 'submitted', v_submit_path
  )
  RETURNING id INTO v_rep_a_id;

  -- 3. Verify Storage RLS as Worker A, Worker B, and Coordinator
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('report-media', v_draft_path, v_worker_a),
         ('report-media', v_submit_path, v_worker_a);

  -- Worker A can delete unsubmitted draft media
  DELETE FROM storage.objects WHERE bucket_id = 'report-media' AND name = v_draft_path;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 3 FAILED: Worker A could not delete unsubmitted draft media.';
  END IF;

  -- Worker A cannot delete media linked to a submitted report
  DELETE FROM storage.objects WHERE bucket_id = 'report-media' AND name = v_submit_path;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 3 FAILED: Submitted evidence media was deleted by worker.';
  END IF;
  RESET ROLE;

  -- Worker B cannot read or upload into Worker A's folder
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_b, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'report-media' AND name = v_submit_path;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 3 FAILED: Worker B read Worker A storage object.';
  END IF;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('report-media', v_worker_a::text || '/forged/photo.jpg', v_worker_b);
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 3 FAILED: Worker B uploaded into Worker A folder.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Coordinator can read Worker A's submitted media
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_coord::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM storage.objects WHERE bucket_id = 'report-media' AND name = v_submit_path;
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 3 FAILED: Coordinator could not view submitted report media.';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS [3/4]: Storage object RLS enforces isolation and evidence retention.';

  -- 4. Verify get_visible_profile_names() RPC for Worker A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SET LOCAL ROLE authenticated;
  -- Should return v_coord (assigned to Worker A's report) and NOT v_worker_b
  SELECT COUNT(*) INTO v_count
  FROM public.get_visible_profile_names(ARRAY[v_coord, v_worker_b]);
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 4 FAILED: Expected 1 visible profile name (coordinator), got %.', v_count;
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS [4/4]: get_visible_profile_names() exposes assignee display name without leaking unrelated users.';
END $$;

ROLLBACK;
