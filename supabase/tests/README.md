# FieldTrack Database Verification & Testing Guide

This directory contains database verification suites and safe synthetic seed instructions for `supabase/migrations/001_initial_schema.sql`.

> **Safety Rule:** Always run tests against a dedicated **development or staging** Supabase project. Never use real personal emails, real phone numbers, or production credentials.

---

## Files in This Package

| File | Purpose | Modifies Database? |
| --- | --- | --- |
| `001_verify_schema_and_rls.sql` | Self-contained SQL verification suite testing all 11 schema, FK, constraint, trigger, concurrency, and RLS checks. | **No** (wrapped in `BEGIN ... ROLLBACK`) |
| `002_verify_storage_and_sync_index.sql` | Self-contained SQL verification suite testing `report-media` bucket, Storage RLS, `updated_at` sync index, and `get_visible_profile_names()` RPC. | **No** (wrapped in `BEGIN ... ROLLBACK`) |
| `verify-supabase-live.ts` | Live Node/TypeScript end-to-end verification script testing Supabase Auth JWTs, PostgREST, and RLS over HTTPS. | **Yes** (creates synthetic `[TEST]` reports in your test project) |
| `seed_demo_data.sql` | Inserts synthetic demo reports, activity logs, and sync logs without embedding any passwords in SQL. | **Yes** (idempotent on `client_id`) |

---

## Option A: Run the Rolled-Back SQL Verification Suites (Zero Cleanup Required)

This verifies all database and storage checks directly inside PostgreSQL while simulating `authenticated` JWT claims for two field workers and a coordinator, then rolls everything back cleanly.

1. Ensure both `supabase/migrations/001_initial_schema.sql` and `supabase/migrations/002_storage_buckets.sql` have been executed in order in your Supabase project.
2. Open **Supabase Dashboard -> SQL Editor -> New query**.
3. Paste and run `supabase/tests/001_verify_schema_and_rls.sql`, then paste and run `supabase/tests/002_verify_storage_and_sync_index.sql`.
4. Inspect the **Messages** tab and confirm all `PASS` notices appear.

---

## Option B: Create Safe Test Users & Run Live API/RLS Integration Tests

To verify authentication, JWT issuance, PostgREST permissions, and RLS over real HTTP requests, create three dedicated synthetic accounts in your **test** Supabase project.

### Step 1: Create Test Users Safely

1. In **Supabase Dashboard -> Authentication -> Users**, click **Add user -> Create new user** (ensure **Auto Confirm User** is checked) for three synthetic accounts using reserved `.invalid` addresses and strong temporary test passwords:
   - **Worker A:** `worker.alpha@fieldtrack.invalid`
   - **Worker B:** `worker.bravo@fieldtrack.invalid`
   - **Coordinator:** `coordinator.one@fieldtrack.invalid`
2. Verify in **Table Editor -> `public.profiles`** that `on_auth_user_created` automatically provisioned all three rows with `role = 'field_worker'`.
3. Promote **only** the coordinator account in **SQL Editor**:
   ```sql
   UPDATE public.profiles
   SET role = 'coordinator'
   WHERE email = 'coordinator.one@fieldtrack.invalid';
   ```
   *(Never place `SUPABASE_SERVICE_ROLE_KEY` in client code, `VITE_` variables, or committed `.env` files.)*

### Step 2: Export Test Credentials in Your Shell (Do Not Commit)

```bash
export SUPABASE_URL="https://YOUR_TEST_PROJECT_REF.supabase.co"
export SUPABASE_ANON_KEY="YOUR_TEST_PROJECT_ANON_KEY"
export TEST_WORKER_A_EMAIL="worker.alpha@fieldtrack.invalid"
export TEST_WORKER_A_PASSWORD="YOUR_TEMPORARY_TEST_PASSWORD_A"
export TEST_WORKER_B_EMAIL="worker.bravo@fieldtrack.invalid"
export TEST_WORKER_B_PASSWORD="YOUR_TEMPORARY_TEST_PASSWORD_B"
export TEST_COORDINATOR_EMAIL="coordinator.one@fieldtrack.invalid"
export TEST_COORDINATOR_PASSWORD="YOUR_TEMPORARY_TEST_PASSWORD_C"
```

### Step 3: Execute the Live Verification Script

```bash
npm run test:db
```

---

## Option C: Load Safe Synthetic Demo Data

Once `worker.alpha@fieldtrack.invalid` and `coordinator.one@fieldtrack.invalid` exist and the coordinator has been promoted:

1. Open **Supabase Dashboard -> SQL Editor -> New query**.
2. Paste `supabase/tests/seed_demo_data.sql` and click **Run**.
3. The script uses `ON CONFLICT (client_id) DO NOTHING`, contains zero passwords, and attaches 3 synthetic reports (`Demo: ...`) plus audit and sync logs to your test accounts.
