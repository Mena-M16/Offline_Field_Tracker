-- ============================================================================
-- Offline Field Issue Tracker (FieldTrack)
-- Safe Synthetic Demo Seed: supabase/tests/seed_demo_data.sql
--
-- Purpose:
--   Populates synthetic infrastructure reports, activity logs, and sync logs
--   for test users ALREADY created in Supabase Auth (with zero hardcoded
--   passwords or real personal information).
--
-- Prerequisites:
--   1. Run `supabase/migrations/001_initial_schema.sql`.
--   2. Create synthetic test accounts in Supabase Dashboard -> Authentication ->
--      Users (or via Admin API) using reserved `.invalid` addresses:
--        - worker.alpha@fieldtrack.invalid
--        - coordinator.one@fieldtrack.invalid
--   3. Promote the test coordinator in SQL Editor:
--        UPDATE public.profiles
--        SET role = 'coordinator'
--        WHERE email = 'coordinator.one@fieldtrack.invalid';
--   4. Run this script in the Supabase SQL Editor.
-- ============================================================================

DO $$
DECLARE
  v_worker_id UUID;
  v_coord_id  UUID;
  v_rep_1     UUID;
  v_rep_2     UUID;
  v_rep_3     UUID;
BEGIN
  SELECT id INTO v_worker_id
  FROM public.profiles
  WHERE email = 'worker.alpha@fieldtrack.invalid'
  LIMIT 1;

  SELECT id INTO v_coord_id
  FROM public.profiles
  WHERE email = 'coordinator.one@fieldtrack.invalid'
    AND role = 'coordinator'
  LIMIT 1;

  IF v_worker_id IS NULL OR v_coord_id IS NULL THEN
    RAISE EXCEPTION
      'Missing synthetic test users. Create worker.alpha@fieldtrack.invalid and coordinator.one@fieldtrack.invalid (promoted to coordinator) first.';
  END IF;

  INSERT INTO public.reports (
    client_id,
    created_by,
    assigned_to,
    category,
    title,
    description,
    location_name,
    latitude,
    longitude,
    accuracy_meters,
    priority,
    status,
    version,
    reported_at,
    submitted_at
  )
  VALUES
    (
      '11111111-1111-4111-8111-111111111101',
      v_worker_id,
      v_worker_id,
      'water_infrastructure',
      'Demo: Borehole Pump Inverter Fault',
      'Synthetic demo report for testing coordinator triage and offline sync state.',
      'Demo Sector 3 Pumping Station',
      -1.286389,
      36.817223,
      4.0,
      'critical',
      'in_progress',
      3,
      NOW() - INTERVAL '12 hours',
      NOW() - INTERVAL '12 hours'
    ),
    (
      '11111111-1111-4111-8111-111111111102',
      v_worker_id,
      v_coord_id,
      'equipment_damage',
      'Demo: Feeder Transformer Seal Leak',
      'Synthetic demo report illustrating assigned high-priority equipment issue.',
      'Demo Feeder Line 4B',
      -1.291520,
      36.824110,
      5.2,
      'high',
      'assigned',
      2,
      NOW() - INTERVAL '1 day',
      NOW() - INTERVAL '1 day'
    ),
    (
      '11111111-1111-4111-8111-111111111103',
      v_worker_id,
      NULL,
      'safety_concern',
      'Demo: Uncovered Inspection Manhole',
      'Synthetic submitted report ready for coordinator assignment or rejection testing.',
      'Demo Market Crossroad',
      -1.278910,
      36.811550,
      2.5,
      'medium',
      'submitted',
      1,
      NOW() - INTERVAL '3 hours',
      NOW() - INTERVAL '3 hours'
    )
  ON CONFLICT (client_id) DO NOTHING;

  SELECT id INTO v_rep_1 FROM public.reports WHERE client_id = '11111111-1111-4111-8111-111111111101';
  SELECT id INTO v_rep_2 FROM public.reports WHERE client_id = '11111111-1111-4111-8111-111111111102';
  SELECT id INTO v_rep_3 FROM public.reports WHERE client_id = '11111111-1111-4111-8111-111111111103';

  IF v_rep_1 IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.activity_logs WHERE report_id = v_rep_1
  ) THEN
    INSERT INTO public.activity_logs (report_id, actor_id, action, description, metadata)
    VALUES
      (
        v_rep_1,
        v_worker_id,
        'report_created',
        'Demo report captured offline and queued.',
        '{"demo":true}'::jsonb
      ),
      (
        v_rep_1,
        v_coord_id,
        'report_assigned',
        'Demo report assigned to field technician.',
        jsonb_build_object('assigned_to', v_worker_id)
      ),
      (
        v_rep_1,
        v_coord_id,
        'status_changed',
        'Demo status transitioned to in_progress.',
        '{"previous_status":"assigned","new_status":"in_progress"}'::jsonb
      );
  END IF;

  IF v_rep_1 IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sync_logs WHERE report_id = v_rep_1
  ) THEN
    INSERT INTO public.sync_logs (report_id, client_id, user_id, sync_status, attempt_count)
    VALUES
      (v_rep_1, '11111111-1111-4111-8111-111111111101', v_worker_id, 'synchronized', 1),
      (v_rep_2, '11111111-1111-4111-8111-111111111102', v_worker_id, 'synchronized', 1),
      (v_rep_3, '11111111-1111-4111-8111-111111111103', v_worker_id, 'synchronized', 1);
  END IF;
END $$;
