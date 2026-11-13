-- ============================================================================
-- Offline Field Issue Tracker (FieldTrack)
-- Verification Suite: supabase/tests/001_verify_schema_and_rls.sql
--
-- Purpose:
--   Verifies all 11 database schema, constraint, trigger, concurrency,
--   and Row Level Security (RLS) requirements inside a single rolled-back
--   transaction so zero test data is left behind.
--
-- Execution:
--   Paste into the Supabase SQL Editor (postgres role) and click Run.
--   Each assertion prints a NOTICE; any failure raises an EXCEPTION and
--   rolls back the entire transaction.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_worker_a UUID := gen_random_uuid();
  v_worker_b UUID := gen_random_uuid();
  v_coord    UUID := gen_random_uuid();

  v_rep_a_client UUID := gen_random_uuid();
  v_rep_a_id     UUID;
  v_rep_draft_id UUID;
  v_rep_rej_id   UUID;
  v_rep_ts_id    UUID;
  v_log_a_id     UUID;

  v_count        INTEGER;
  v_version      INTEGER;
  v_role         TEXT;
  v_email        TEXT;
  v_submitted_at TIMESTAMPTZ;
  v_disabled_at  TIMESTAMPTZ;
  v_prev_updated TIMESTAMPTZ;
  v_curr_updated TIMESTAMPTZ;
BEGIN
  -- --------------------------------------------------------------------------
  -- CHECK 1: Required tables, RLS enabled, and anon privileges revoked
  -- --------------------------------------------------------------------------
  SELECT COUNT(*)
  INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN ('profiles', 'reports', 'activity_logs', 'sync_logs')
    AND c.relrowsecurity = TRUE;

  IF v_count <> 4 THEN
    RAISE EXCEPTION 'CHECK 1 FAILED: Expected 4 public tables with RLS enabled, found %.', v_count;
  END IF;

  IF has_table_privilege('anon', 'public.reports', 'SELECT')
     OR has_table_privilege('anon', 'public.profiles', 'SELECT')
     OR has_table_privilege('anon', 'public.activity_logs', 'SELECT')
     OR has_table_privilege('anon', 'public.sync_logs', 'SELECT') THEN
    RAISE EXCEPTION 'CHECK 1 FAILED: anon role must not have privileges on application tables.';
  END IF;
  RAISE NOTICE 'PASS [1/11]: Required tables exist, RLS is enabled, and anon access is revoked.';

  -- --------------------------------------------------------------------------
  -- Setup synthetic isolated test users inside rolled-back transaction
  -- (Uses reserved .invalid test addresses and non-login placeholder hashes)
  -- --------------------------------------------------------------------------
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  VALUES
    (
      v_worker_a,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test.worker.a.' || v_worker_a::text || '@example.invalid',
      '!TEST_HASH_NO_LOGIN!',
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Test Worker Alpha","role":"coordinator"}'::jsonb, -- attempts privilege escalation via metadata
      NOW(),
      NOW()
    ),
    (
      v_worker_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test.worker.b.' || v_worker_b::text || '@example.invalid',
      '!TEST_HASH_NO_LOGIN!',
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Test Worker Bravo"}'::jsonb,
      NOW(),
      NOW()
    ),
    (
      v_coord,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test.coord.' || v_coord::text || '@example.invalid',
      '!TEST_HASH_NO_LOGIN!',
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Test Coordinator"}'::jsonb,
      NOW(),
      NOW()
    );

  -- Verify Check 8a: signup trigger ignored 'role: coordinator' metadata on Worker A
  SELECT role INTO v_role FROM public.profiles WHERE id = v_worker_a;
  IF v_role <> 'field_worker' THEN
    RAISE EXCEPTION 'CHECK 8 FAILED: Signup metadata escalated role to %.', v_role;
  END IF;

  -- Administratively promote test coordinator (permitted as postgres)
  UPDATE public.profiles SET role = 'coordinator' WHERE id = v_coord;

  -- --------------------------------------------------------------------------
  -- CHECK 2: Foreign keys & history preservation on delete attempts
  -- --------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.reports (
      client_id, created_by, category, title, description, location_name, priority, status
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), 'water_infrastructure',
      'Orphan Report', 'Testing FK constraint enforcement.', 'Sector 1', 'medium', 'submitted'
    );
    RAISE EXCEPTION 'CHECK 2 FAILED: Report insert with non-existent created_by succeeded.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  -- Insert valid submitted report and draft report as Worker A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SET LOCAL ROLE authenticated;
  INSERT INTO public.reports (
    client_id, created_by, category, title, description, location_name, priority, status, version
  ) VALUES (
    v_rep_a_client, v_worker_a, 'water_infrastructure',
    'Broken Borehole Valve', 'Main shutoff valve cracked and leaking steadily.', 'North Pump House', 'high', 'submitted', 99
  )
  RETURNING id, version, submitted_at INTO v_rep_a_id, v_version, v_submitted_at;

  IF v_version <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 2 FAILED: Forged initial version % was not reset to 1.', v_version;
  END IF;

  INSERT INTO public.reports (
    client_id, created_by, category, title, description, location_name, priority, status
  ) VALUES (
    gen_random_uuid(), v_worker_a, 'maintenance',
    'Draft Inspection Note', 'Pending photo capture before submission.', 'East Feeder', 'low', 'draft'
  )
  RETURNING id INTO v_rep_draft_id;

  INSERT INTO public.activity_logs (report_id, actor_id, action, description)
  VALUES (v_rep_a_id, v_worker_a, 'report_created', 'Created test report A.')
  RETURNING id INTO v_log_a_id;
  RESET ROLE;

  -- Verify deleting profile with reports is blocked (ON DELETE RESTRICT)
  BEGIN
    DELETE FROM public.profiles WHERE id = v_worker_a;
    RAISE EXCEPTION 'CHECK 2 FAILED: Deleting profile with reports was not restricted.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  -- Verify deleting report with activity_logs is blocked (ON DELETE RESTRICT)
  BEGIN
    DELETE FROM public.reports WHERE id = v_rep_a_id;
    RAISE EXCEPTION 'CHECK 2 FAILED: Deleting report with activity_logs was not restricted.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS [2/11]: Foreign keys enforce referential integrity and protect history from deletion.';

  -- --------------------------------------------------------------------------
  -- CHECK 3: Duplicate client_id rejection and safe ON CONFLICT handling
  -- --------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.reports (
      client_id, created_by, category, title, description, location_name, priority, status
    ) VALUES (
      v_rep_a_client, v_worker_a, 'water_infrastructure',
      'Duplicate Sync Attempt', 'Same client_id should be rejected.', 'North Pump House', 'high', 'submitted'
    );
    RAISE EXCEPTION 'CHECK 3 FAILED: Duplicate client_id insert was not rejected.';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  INSERT INTO public.reports (
    client_id, created_by, category, title, description, location_name, priority, status
  ) VALUES (
    v_rep_a_client, v_worker_a, 'water_infrastructure',
    'Idempotent Retry Attempt', 'Should safely no-op on conflict.', 'North Pump House', 'high', 'submitted'
  )
  ON CONFLICT (client_id) DO NOTHING;

  SELECT COUNT(*) INTO v_count FROM public.reports WHERE client_id = v_rep_a_client;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CHECK 3 FAILED: Expected 1 row for client_id, found %.', v_count;
  END IF;
  RAISE NOTICE 'PASS [3/11]: Duplicate client_id rejected and ON CONFLICT idempotency verified.';

  -- --------------------------------------------------------------------------
  -- CHECK 4: Invalid report statuses & invalid state transitions rejected
  -- --------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.reports (
      client_id, created_by, category, title, description, location_name, priority, status
    ) VALUES (
      gen_random_uuid(), v_worker_a, 'safety_concern',
      'Invalid Status Test', 'Uses an unsupported status value.', 'Zone C', 'medium', 'archived'
    );
    RAISE EXCEPTION 'CHECK 4 FAILED: Invalid status "archived" was accepted.';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Illegal jump: submitted -> resolved
  BEGIN
    UPDATE public.reports SET status = 'resolved', version = 2 WHERE id = v_rep_a_id;
    RAISE EXCEPTION 'CHECK 4 FAILED: Illegal transition submitted -> resolved was allowed.';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Rejection without >= 10 char reason
  BEGIN
    UPDATE public.reports SET status = 'rejected', rejection_reason = 'Too short', version = 2 WHERE id = v_rep_a_id;
    RAISE EXCEPTION 'CHECK 4 FAILED: Rejection with < 10 char reason was allowed.';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS [4/11]: Invalid report statuses, illegal transitions, and short rejection reasons rejected.';

  -- --------------------------------------------------------------------------
  -- CHECK 5: Invalid priorities rejected
  -- --------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.reports (
      client_id, created_by, category, title, description, location_name, priority, status
    ) VALUES (
      gen_random_uuid(), v_worker_a, 'equipment_damage',
      'Invalid Priority Test', 'Uses an unsupported priority value.', 'Substation 2', 'urgent', 'submitted'
    );
    RAISE EXCEPTION 'CHECK 5 FAILED: Invalid priority "urgent" was accepted.';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS [5/11]: Invalid priority values rejected.';

  -- --------------------------------------------------------------------------
  -- CHECK 7 & 8b: Worker isolation & self-promotion prevention (as Worker B & Worker A)
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_b, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM public.reports WHERE id = v_rep_a_id;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 7 FAILED: Worker B was able to view Worker A report.';
  END IF;

  -- Worker B tries to update Worker A's report -> 0 rows affected
  UPDATE public.reports SET title = 'Tampered By Worker B' WHERE id = v_rep_a_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 7 FAILED: Worker B updated % rows belonging to Worker A.', v_count;
  END IF;
  RESET ROLE;

  -- Worker B tries to insert a report forged under Worker A's ID -> RLS error (42501)
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.reports (
      client_id, created_by, category, title, description, location_name, priority, status
    ) VALUES (
      gen_random_uuid(), v_worker_a, 'other',
      'Forged Report', 'Attempting to impersonate Worker A.', 'Yard 9', 'low', 'submitted'
    );
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 7 FAILED: Worker B inserted a report with Worker A created_by.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Worker A tries to promote self to coordinator -> blocked by trigger (42501)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.profiles SET role = 'coordinator' WHERE id = v_worker_a;
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 8 FAILED: Field worker promoted self to coordinator.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Worker A cannot tamper with profiles.email directly
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.profiles SET email = 'spoofed@example.invalid' WHERE id = v_worker_a;
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 8 FAILED: Authenticated user modified profiles.email directly.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Updating auth.users.email synchronizes public.profiles.email cleanly
  v_email := 'synced.worker.a.' || v_worker_a::text || '@example.invalid';
  UPDATE auth.users SET email = upper(v_email) WHERE id = v_worker_a;
  SELECT email INTO v_role FROM public.profiles WHERE id = v_worker_a;
  IF v_role <> lower(v_email) THEN
    RAISE EXCEPTION 'CHECK 8 FAILED: auth.users email update did not sync to public.profiles (got %).', v_role;
  END IF;
  RAISE NOTICE 'PASS [7/11 & 8/11]: Cross-worker access blocked, self-promotion prevented, and auth email synced.';

  -- --------------------------------------------------------------------------
  -- CHECK 6 & 9: Coordinator access/workflow management & optimistic version conflict
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_coord::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SET LOCAL ROLE authenticated;
  -- Coordinator can see Worker A's submitted report
  SELECT COUNT(*) INTO v_count FROM public.reports WHERE id = v_rep_a_id;
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 9 FAILED: Coordinator could not view submitted report.';
  END IF;

  -- Coordinator must NOT see Worker A's private draft
  SELECT COUNT(*) INTO v_count FROM public.reports WHERE id = v_rep_draft_id;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 9 FAILED: Coordinator should not see private worker drafts.';
  END IF;

  -- Coordinator transitions submitted -> assigned (bumps version 1 -> 2)
  UPDATE public.reports
  SET status = 'assigned', assigned_to = v_worker_b, version = 2
  WHERE id = v_rep_a_id AND version = 1
  RETURNING version INTO v_version;

  IF v_version <> 2 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 6/9 FAILED: Expected version 2 after assignment, got %.', v_version;
  END IF;

  -- Optimistic concurrency check 6a: conditional WHERE with stale version 1 matches 0 rows
  UPDATE public.reports
  SET status = 'in_progress', version = 2
  WHERE id = v_rep_a_id AND version = 1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 6 FAILED: Stale conditional update matched % rows.', v_count;
  END IF;
  RESET ROLE;

  -- Optimistic concurrency check 6b: trigger rejects stale concurrent payload (version = 2 when DB is already 2)
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.reports
    SET status = 'in_progress', version = 2
    WHERE id = v_rep_a_id;
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 6 FAILED: Trigger allowed stale version overwrite (NEW.version = OLD.version).';
  EXCEPTION
    WHEN serialization_failure THEN NULL;
  END;

  -- Optimistic concurrency check 6c: trigger rejects omitted version update
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.reports
    SET status = 'in_progress'
    WHERE id = v_rep_a_id;
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 6 FAILED: Trigger allowed version-less update.';
  EXCEPTION
    WHEN serialization_failure THEN NULL;
  END;

  -- Coordinator cannot alter submitted worker evidence (title)
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.reports
    SET title = 'Altered Evidence Title', version = 3
    WHERE id = v_rep_a_id;
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 9 FAILED: Coordinator altered submitted report title.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Coordinator completes valid workflow: assigned -> in_progress -> resolved
  SET LOCAL ROLE authenticated;
  UPDATE public.reports SET status = 'in_progress', version = 3 WHERE id = v_rep_a_id AND version = 2;
  UPDATE public.reports SET status = 'resolved', version = 4 WHERE id = v_rep_a_id AND version = 3;
  SELECT version INTO v_version FROM public.reports WHERE id = v_rep_a_id;
  IF v_version <> 4 THEN
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 9 FAILED: Expected version 4 after resolution, got %.', v_version;
  END IF;
  RESET ROLE;

  -- Also verify Coordinator can reject a submitted report with >= 10 char reason
  INSERT INTO public.reports (
    client_id, created_by, category, title, description, location_name, priority, status
  ) VALUES (
    gen_random_uuid(), v_worker_b, 'other',
    'Duplicate Report Test', 'Testing coordinator rejection path.', 'Station East', 'low', 'submitted'
  )
  RETURNING id INTO v_rep_rej_id;

  SET LOCAL ROLE authenticated;
  UPDATE public.reports
  SET status = 'rejected', rejection_reason = 'Duplicate submission already logged under Sector 4 ticket.', version = 2
  WHERE id = v_rep_rej_id AND version = 1;
  RESET ROLE;
  RAISE NOTICE 'PASS [6/11 & 9/11]: Optimistic version conflicts and coordinator workflow transitions verified.';

  -- --------------------------------------------------------------------------
  -- CHECK 10: Activity history immutability and unauthorized log insertion
  -- --------------------------------------------------------------------------
  -- Worker B cannot insert activity log on Worker A's report
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_b, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.activity_logs (report_id, actor_id, action, description)
    VALUES (v_rep_a_id, v_worker_b, 'comment_added', 'Unauthorized cross-worker comment.');
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 10 FAILED: Worker B inserted activity log on Worker A report.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Neither Coordinator nor Worker A can UPDATE or DELETE activity_logs
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_coord::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.activity_logs SET description = 'Altered history' WHERE id = v_log_a_id;
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 10 FAILED: activity_logs UPDATE succeeded.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.activity_logs WHERE id = v_log_a_id;
    RAISE EXCEPTION 'CHECK 10 FAILED: activity_logs DELETE succeeded even as postgres.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS [10/11]: Activity history is append-only and protected against unauthorized modification.';

  -- --------------------------------------------------------------------------
  -- CHECK 11: Timestamps & update triggers
  -- --------------------------------------------------------------------------
  IF v_submitted_at IS NULL THEN
    RAISE EXCEPTION 'CHECK 11 FAILED: submitted_at was not auto-populated on submitted insert.';
  END IF;

  -- Verify draft -> submitted auto-populates submitted_at
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SET LOCAL ROLE authenticated;
  UPDATE public.reports SET status = 'submitted', version = 2 WHERE id = v_rep_draft_id RETURNING submitted_at INTO v_submitted_at;
  RESET ROLE;

  IF v_submitted_at IS NULL THEN
    RAISE EXCEPTION 'CHECK 11 FAILED: submitted_at remained NULL after draft -> submitted.';
  END IF;

  -- Insert a draft with an older updated_at (BEFORE UPDATE does not fire on INSERT),
  -- then update it and assert trg_reports_updated_at advances updated_at to NOW().
  INSERT INTO public.reports (
    client_id, created_by, category, title, description, location_name, priority, status, updated_at
  ) VALUES (
    gen_random_uuid(), v_worker_a, 'maintenance',
    'Timestamp Trigger Test', 'Verifies updated_at refreshes on update.', 'Sector 9', 'low', 'draft',
    NOW() - INTERVAL '10 minutes'
  )
  RETURNING id, updated_at INTO v_rep_ts_id, v_prev_updated;

  UPDATE public.reports
  SET priority = 'medium', version = 2
  WHERE id = v_rep_ts_id
  RETURNING updated_at INTO v_curr_updated;

  IF v_curr_updated <= v_prev_updated THEN
    RAISE EXCEPTION 'CHECK 11 FAILED: updated_at trigger did not advance timestamp.';
  END IF;

  -- Verify soft-disable auto-populates disabled_at and blocks further inserts
  UPDATE public.profiles SET is_active = FALSE WHERE id = v_worker_b RETURNING disabled_at INTO v_disabled_at;
  IF v_disabled_at IS NULL THEN
    RAISE EXCEPTION 'CHECK 11 FAILED: disabled_at was not auto-populated when is_active = FALSE.';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_worker_b, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_worker_b::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.reports (
      client_id, created_by, category, title, description, location_name, priority, status
    ) VALUES (
      gen_random_uuid(), v_worker_b, 'other',
      'Disabled Account Report', 'Should be blocked by active-user RLS check.', 'Sector 5', 'low', 'submitted'
    );
    RESET ROLE;
    RAISE EXCEPTION 'CHECK 11 FAILED: Soft-disabled user was allowed to insert a report.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'PASS [11/11]: Timestamps, updated_at triggers, and soft-disable triggers behave correctly.';
  RAISE NOTICE 'ALL 11 FIELDTRACK DATABASE VERIFICATION CHECKS PASSED (rolling back test transaction).';
END $$;

ROLLBACK;
