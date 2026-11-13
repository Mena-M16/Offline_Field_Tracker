/**
 * FieldTrack Live Supabase Verification & Integration Test Suite
 *
 * Tests all 11 schema, constraint, concurrency, and RLS requirements over real
 * Supabase Auth JWTs and PostgREST endpoints.
 *
 * IMPORTANT:
 * - Run ONLY against a dedicated staging/test Supabase project (never production).
 * - Provide credentials exclusively via environment variables; no secrets or
 *   real personal data are hardcoded in this file.
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   TEST_WORKER_A_EMAIL
 *   TEST_WORKER_A_PASSWORD
 *   TEST_WORKER_B_EMAIL
 *   TEST_WORKER_B_PASSWORD
 *   TEST_COORDINATOR_EMAIL
 *   TEST_COORDINATOR_PASSWORD
 */

import crypto from 'node:crypto';
import assert from 'node:assert/strict';

interface AuthSession {
  access_token: string;
  user: {
    id: string;
    email?: string;
  };
}

interface HttpResult<T = unknown> {
  status: number;
  data: T;
  raw: string;
}

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'TEST_WORKER_A_EMAIL',
  'TEST_WORKER_A_PASSWORD',
  'TEST_WORKER_B_EMAIL',
  'TEST_WORKER_B_PASSWORD',
  'TEST_COORDINATOR_EMAIL',
  'TEST_COORDINATOR_PASSWORD',
] as const;

function getEnvConfig() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required test environment variables: ${missing.join(', ')}.\n` +
        'See supabase/tests/README.md for safe test user setup instructions.'
    );
  }

  return {
    url: process.env.SUPABASE_URL!.replace(/\/+$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY!.trim(),
    workerA: {
      email: process.env.TEST_WORKER_A_EMAIL!.trim(),
      password: process.env.TEST_WORKER_A_PASSWORD!,
    },
    workerB: {
      email: process.env.TEST_WORKER_B_EMAIL!.trim(),
      password: process.env.TEST_WORKER_B_PASSWORD!,
    },
    coordinator: {
      email: process.env.TEST_COORDINATOR_EMAIL!.trim(),
      password: process.env.TEST_COORDINATOR_PASSWORD!,
    },
  };
}

async function signIn(url: string, anonKey: string, email: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sign-in failed for test user (${res.status}): ${text}`);
  }
  return JSON.parse(text) as AuthSession;
}

async function rest<T = unknown>(
  url: string,
  anonKey: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    prefer?: string;
  } = {}
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = {
    apikey: anonKey,
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  return { status: res.status, data: data as T, raw };
}

async function runCheck(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
}

async function main() {
  const cfg = getEnvConfig();

  const workerASession = await signIn(cfg.url, cfg.anonKey, cfg.workerA.email, cfg.workerA.password);
  const workerBSession = await signIn(cfg.url, cfg.anonKey, cfg.workerB.email, cfg.workerB.password);
  const coordSession = await signIn(cfg.url, cfg.anonKey, cfg.coordinator.email, cfg.coordinator.password);

  const workerAId = workerASession.user.id;
  const workerBId = workerBSession.user.id;
  const coordId = coordSession.user.id;

  assert.notEqual(workerAId, workerBId, 'Worker A and Worker B must be distinct test accounts.');

  let reportAId = '';
  let reportAClientId = crypto.randomUUID();
  let reportAVersion = 1;
  let reportDraftId = '';
  let logAId = '';

  // 1. Verify required tables exist and unauthenticated anon requests are rejected
  await runCheck('1. Required tables exist and anon access is blocked', async () => {
    for (const table of ['profiles', 'reports', 'activity_logs', 'sync_logs']) {
      const anonRes = await rest(cfg.url, cfg.anonKey, `${table}?select=id&limit=1`);
      assert.ok(
        anonRes.status === 401 || anonRes.status === 403,
        `Expected 401/403 for anon SELECT on ${table}, got ${anonRes.status}`
      );

      const authRes = await rest(cfg.url, cfg.anonKey, `${table}?select=id&limit=1`, {
        token: coordSession.access_token,
      });
      assert.equal(authRes.status, 200, `Expected 200 on ${table} for coordinator, got ${authRes.status}: ${authRes.raw}`);
    }
  });

  // 2. Verify foreign keys work correctly
  await runCheck('2. Foreign key constraints reject invalid references', async () => {
    const fakeUuid = crypto.randomUUID();
    const badAssignee = await rest(cfg.url, cfg.anonKey, 'reports', {
      method: 'POST',
      token: workerASession.access_token,
      prefer: 'return=representation',
      body: {
        client_id: crypto.randomUUID(),
        created_by: workerAId,
        assigned_to: fakeUuid,
        category: 'water_infrastructure',
        title: '[TEST] Bad FK Check',
        description: 'Testing foreign key constraint on assigned_to.',
        location_name: 'Test Zone 1',
        priority: 'medium',
        status: 'submitted',
      },
    });
    assert.ok(
      badAssignee.status === 400 || badAssignee.status === 409,
      `Expected 400/409 FK error for non-existent assigned_to, got ${badAssignee.status}`
    );

    const badLog = await rest(cfg.url, cfg.anonKey, 'activity_logs', {
      method: 'POST',
      token: workerASession.access_token,
      body: {
        report_id: fakeUuid,
        actor_id: workerAId,
        action: 'report_created',
        description: 'Should fail FK/RLS.',
      },
    });
    assert.ok(badLog.status >= 400, `Expected 4xx for non-existent report_id, got ${badLog.status}`);
  });

  // Create valid submitted report + draft report for remaining checks
  const createA = await rest<Array<{ id: string; version: number; submitted_at: string | null; updated_at: string }>>(
    cfg.url,
    cfg.anonKey,
    'reports',
    {
      method: 'POST',
      token: workerASession.access_token,
      prefer: 'return=representation',
      body: {
        client_id: reportAClientId,
        created_by: workerAId,
        category: 'water_infrastructure',
        title: '[TEST] Borehole Pressure Drop',
        description: 'Automated test report verifying end-to-end constraints and RLS.',
        location_name: 'Test Borehole #1',
        priority: 'high',
        status: 'submitted',
      },
    }
  );
  assert.equal(createA.status, 201, `Failed creating baseline Worker A report: ${createA.raw}`);
  reportAId = createA.data[0].id;
  reportAVersion = createA.data[0].version;
  const initialSubmittedAt = createA.data[0].submitted_at;
  const initialUpdatedAt = createA.data[0].updated_at;

  const createLog = await rest<Array<{ id: string }>>(cfg.url, cfg.anonKey, 'activity_logs', {
    method: 'POST',
    token: workerASession.access_token,
    prefer: 'return=representation',
    body: {
      report_id: reportAId,
      actor_id: workerAId,
      action: 'report_created',
      description: 'Baseline activity entry created by verification suite.',
    },
  });
  assert.equal(createLog.status, 201, `Failed creating baseline activity log: ${createLog.raw}`);
  logAId = createLog.data[0].id;

  const createDraft = await rest<Array<{ id: string; submitted_at: string | null }>>(
    cfg.url,
    cfg.anonKey,
    'reports',
    {
      method: 'POST',
      token: workerASession.access_token,
      prefer: 'return=representation',
      body: {
        client_id: crypto.randomUUID(),
        created_by: workerAId,
        category: 'maintenance',
        title: '[TEST] Worker A Private Draft',
        description: 'Draft used to verify coordinator isolation and draft->submitted trigger.',
        location_name: 'Test Depot',
        priority: 'low',
        status: 'draft',
      },
    }
  );
  assert.equal(createDraft.status, 201, `Failed creating baseline draft report: ${createDraft.raw}`);
  reportDraftId = createDraft.data[0].id;

  // 3. Duplicate client_id rejected or safely handled
  await runCheck('3. Duplicate client_id rejected and idempotent ignore-duplicates handled', async () => {
    const dupRes = await rest(cfg.url, cfg.anonKey, 'reports', {
      method: 'POST',
      token: workerASession.access_token,
      body: {
        client_id: reportAClientId,
        created_by: workerAId,
        category: 'water_infrastructure',
        title: '[TEST] Duplicate Retry',
        description: 'Should trigger 409 unique violation on client_id.',
        location_name: 'Test Borehole #1',
        priority: 'high',
        status: 'submitted',
      },
    });
    assert.equal(dupRes.status, 409, `Expected 409 conflict on duplicate client_id, got ${dupRes.status}: ${dupRes.raw}`);

    const safeRetry = await rest(cfg.url, cfg.anonKey, 'reports?on_conflict=client_id', {
      method: 'POST',
      token: workerASession.access_token,
      prefer: 'resolution=ignore-duplicates,return=representation',
      body: {
        client_id: reportAClientId,
        created_by: workerAId,
        category: 'water_infrastructure',
        title: '[TEST] Idempotent Retry',
        description: 'Safe ON CONFLICT DO NOTHING retry.',
        location_name: 'Test Borehole #1',
        priority: 'high',
        status: 'submitted',
      },
    });
    assert.ok(
      safeRetry.status === 200 || safeRetry.status === 201,
      `Expected 200/201 on idempotent ignore-duplicates, got ${safeRetry.status}: ${safeRetry.raw}`
    );
  });

  // 4. Invalid report statuses rejected
  await runCheck('4. Invalid report statuses and illegal transitions rejected', async () => {
    const badEnum = await rest(cfg.url, cfg.anonKey, 'reports', {
      method: 'POST',
      token: workerASession.access_token,
      body: {
        client_id: crypto.randomUUID(),
        created_by: workerAId,
        category: 'other',
        title: '[TEST] Invalid Status',
        description: 'Unsupported status enum check.',
        location_name: 'Test Yard',
        priority: 'low',
        status: 'archived',
      },
    });
    assert.equal(badEnum.status, 400, `Expected 400 on invalid status, got ${badEnum.status}`);

    const badJump = await rest(cfg.url, cfg.anonKey, `reports?id=eq.${reportAId}`, {
      method: 'PATCH',
      token: coordSession.access_token,
      body: { status: 'resolved' },
    });
    assert.equal(badJump.status, 400, `Expected 400 on submitted -> resolved jump, got ${badJump.status}: ${badJump.raw}`);
  });

  // 5. Invalid priorities rejected
  await runCheck('5. Invalid priorities rejected', async () => {
    const badPriority = await rest(cfg.url, cfg.anonKey, 'reports', {
      method: 'POST',
      token: workerASession.access_token,
      body: {
        client_id: crypto.randomUUID(),
        created_by: workerAId,
        category: 'safety_concern',
        title: '[TEST] Invalid Priority',
        description: 'Unsupported priority enum check.',
        location_name: 'Test Yard',
        priority: 'urgent',
        status: 'submitted',
      },
    });
    assert.equal(badPriority.status, 400, `Expected 400 on invalid priority, got ${badPriority.status}`);
  });

  // 7. Field workers cannot access another worker's reports
  await runCheck('7. Field workers cannot read or mutate another worker reports', async () => {
    const readOther = await rest<unknown[]>(cfg.url, cfg.anonKey, `reports?id=eq.${reportAId}`, {
      token: workerBSession.access_token,
    });
    assert.equal(readOther.status, 200);
    assert.equal(readOther.data.length, 0, 'Worker B must receive 0 rows for Worker A report.');

    const forgeInsert = await rest(cfg.url, cfg.anonKey, 'reports', {
      method: 'POST',
      token: workerBSession.access_token,
      body: {
        client_id: crypto.randomUUID(),
        created_by: workerAId,
        category: 'other',
        title: '[TEST] Forged Ownership',
        description: 'Worker B impersonating Worker A.',
        location_name: 'Test Yard',
        priority: 'low',
        status: 'submitted',
      },
    });
    assert.ok(
      forgeInsert.status === 401 || forgeInsert.status === 403,
      `Expected 401/403 RLS error when forging created_by, got ${forgeInsert.status}`
    );
  });

  // 8. Field workers cannot promote themselves to coordinators
  await runCheck('8. Field workers cannot promote themselves to coordinator', async () => {
    const escalate = await rest(cfg.url, cfg.anonKey, `profiles?id=eq.${workerAId}`, {
      method: 'PATCH',
      token: workerASession.access_token,
      prefer: 'return=representation',
      body: { role: 'coordinator' },
    });
    assert.ok(
      escalate.status === 403 || escalate.status === 401 || escalate.status === 400,
      `Expected 403/401/400 blocking role escalation, got ${escalate.status}: ${escalate.raw}`
    );

    const checkProfile = await rest<Array<{ role: string }>>(
      cfg.url,
      cfg.anonKey,
      `profiles?id=eq.${workerAId}&select=role`,
      { token: workerASession.access_token }
    );
    assert.equal(checkProfile.data[0]?.role, 'field_worker', 'Worker A role must remain field_worker.');
  });

  // 6 & 9. Coordinator access, workflow transitions, and version conflict handling
  await runCheck('6 & 9. Coordinator workflow transitions and optimistic version conflicts work', async () => {
    const coordDraftCheck = await rest<unknown[]>(cfg.url, cfg.anonKey, `reports?id=eq.${reportDraftId}`, {
      token: coordSession.access_token,
    });
    assert.equal(coordDraftCheck.status, 200);
    assert.equal(coordDraftCheck.data.length, 0, 'Coordinator must not see private worker drafts.');

    // Transition submitted -> assigned with expected version
    const assignRes = await rest<Array<{ version: number; status: string }>>(
      cfg.url,
      cfg.anonKey,
      `reports?id=eq.${reportAId}&version=eq.${reportAVersion}`,
      {
        method: 'PATCH',
        token: coordSession.access_token,
        prefer: 'return=representation',
        body: { status: 'assigned', assigned_to: workerBId },
      }
    );
    assert.equal(assignRes.status, 200, `Coordinator assignment failed: ${assignRes.raw}`);
    assert.equal(assignRes.data.length, 1);
    assert.equal(assignRes.data[0].version, reportAVersion + 1);

    // Conditional update with stale version returns 0 rows
    const staleCond = await rest<unknown[]>(
      cfg.url,
      cfg.anonKey,
      `reports?id=eq.${reportAId}&version=eq.${reportAVersion}`,
      {
        method: 'PATCH',
        token: coordSession.access_token,
        prefer: 'return=representation',
        body: { status: 'in_progress' },
      }
    );
    assert.equal(staleCond.status, 200);
    assert.equal(staleCond.data.length, 0, 'Stale expected_version filter must match 0 rows.');

    // Trigger check: explicit stale version payload raises 409 / 40001 serialization conflict
    const staleTrigger = await rest(cfg.url, cfg.anonKey, `reports?id=eq.${reportAId}`, {
      method: 'PATCH',
      token: coordSession.access_token,
      body: { status: 'in_progress', version: reportAVersion },
    });
    assert.ok(
      staleTrigger.status === 409 || staleTrigger.status === 400,
      `Expected 409/400 version conflict from trigger, got ${staleTrigger.status}: ${staleTrigger.raw}`
    );

    reportAVersion = assignRes.data[0].version;
  });

  // 10. Activity history cannot be modified by unauthorized users
  await runCheck('10. Activity history is immutable and protected from unauthorized writes', async () => {
    const workerBInsert = await rest(cfg.url, cfg.anonKey, 'activity_logs', {
      method: 'POST',
      token: workerBSession.access_token,
      body: {
        report_id: reportAId,
        actor_id: workerBId,
        action: 'comment_added',
        description: 'Unauthorized write attempt.',
      },
    });
    assert.ok(
      workerBInsert.status === 401 || workerBInsert.status === 403,
      `Expected 401/403 when Worker B inserts log on Worker A report, got ${workerBInsert.status}`
    );

    const tamperUpdate = await rest<unknown[]>(cfg.url, cfg.anonKey, `activity_logs?id=eq.${logAId}`, {
      method: 'PATCH',
      token: coordSession.access_token,
      prefer: 'return=representation',
      body: { description: 'Tampered audit entry' },
    });
    assert.ok(
      tamperUpdate.status >= 400 || (Array.isArray(tamperUpdate.data) && tamperUpdate.data.length === 0),
      `Expected activity_logs PATCH to be blocked, got ${tamperUpdate.status}: ${tamperUpdate.raw}`
    );

    const tamperDelete = await rest<unknown[]>(cfg.url, cfg.anonKey, `activity_logs?id=eq.${logAId}`, {
      method: 'DELETE',
      token: coordSession.access_token,
      prefer: 'return=representation',
    });
    assert.ok(
      tamperDelete.status >= 400 || (Array.isArray(tamperDelete.data) && tamperDelete.data.length === 0),
      `Expected activity_logs DELETE to be blocked, got ${tamperDelete.status}: ${tamperDelete.raw}`
    );
  });

  // 11. Timestamps & update triggers work correctly
  await runCheck('11. Timestamps and updated_at / submitted_at triggers work correctly', async () => {
    assert.ok(initialSubmittedAt, 'submitted_at must be populated on submitted insert.');

    // Wait briefly so clock advances before update
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const coordProgress = await rest<Array<{ updated_at: string; version: number }>>(
      cfg.url,
      cfg.anonKey,
      `reports?id=eq.${reportAId}&version=eq.${reportAVersion}`,
      {
        method: 'PATCH',
        token: coordSession.access_token,
        prefer: 'return=representation',
        body: { status: 'in_progress' },
      }
    );
    assert.equal(coordProgress.status, 200);
    assert.ok(
      new Date(coordProgress.data[0].updated_at).getTime() > new Date(initialUpdatedAt).getTime(),
      'updated_at trigger must advance timestamp on modification.'
    );

    // Worker A submits draft -> submitted_at auto-populates
    const submitDraft = await rest<Array<{ submitted_at: string | null; status: string }>>(
      cfg.url,
      cfg.anonKey,
      `reports?id=eq.${reportDraftId}`,
      {
        method: 'PATCH',
        token: workerASession.access_token,
        prefer: 'return=representation',
        body: { status: 'submitted' },
      }
    );
    assert.equal(submitDraft.status, 200);
    assert.equal(submitDraft.data[0].status, 'submitted');
    assert.ok(submitDraft.data[0].submitted_at, 'submitted_at must auto-populate on draft -> submitted.');

    // Verify coordinator ID was resolved cleanly
    assert.ok(coordId);
  });

  console.log('\nAll 11 live Supabase verification checks passed.');
}

main().catch((err) => {
  console.error('\nVerification suite failed:', err);
  process.exit(1);
});
