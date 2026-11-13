import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiClient } from '../src/api/client';
import { TopNav } from '../src/components/layout/TopNav';
import { getFrontendEnvStatus } from '../src/config/env';
import { AuthContext, type AuthContextType, DEMO_WORKER } from '../src/context/AuthContext';
import {
  AuthSessionController,
  CACHED_SUPABASE_PROFILE_KEY,
  type AuthSessionState,
  type AuthSessionStorage,
} from '../src/context/authSessionController';
import { SyncContext } from '../src/context/SyncContext';
import { ThemeContext } from '../src/context/ThemeContext';
import { redactSensitiveText, toApiErrorPayload } from '../src/lib/databaseErrors';
import {
  extractBearerToken,
  requireAuth,
  requireCoordinator,
  type AuthenticatedRequest,
} from '../src/server/middleware/auth';
import type { UserProfile } from '../src/types';

function createMemoryStorage(initial: Record<string, string> = {}): AuthSessionStorage & {
  dump: () => Record<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    dump: () => Object.fromEntries(store.entries()),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-a-uuid',
    email: 'worker.a@fieldops.org',
    full_name: 'Worker Alpha',
    role: 'field_worker',
    organization: 'Rural Water Board',
    is_active: true,
    ...overrides,
  };
}

async function runTests() {
  const results: string[] = [];

  // 1. Unexpected DB errors never expose raw message, details, or hint & redact secrets in server logs
  {
    const logged: unknown[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    try {
      const payload = toApiErrorPayload({
        code: '42703',
        message: 'column profiles.internal_secret_col does not exist; password=supersecretvalue',
        details: 'Failing row contains (uuid-1, Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.sig1234567890)',
        hint: 'Perhaps you meant to reference table internal_audit_keys',
      });

      assert.equal(payload.status, 500);
      assert.equal(payload.body.success, false);
      assert.equal(payload.body.error.code, 'UNKNOWN_DB_ERROR');
      assert.equal(payload.body.error.message, 'An unexpected database error occurred.');
      assert.deepEqual(payload.body.error.details, []);

      const serialized = JSON.stringify(payload.body);
      assert.equal(serialized.includes('internal_secret_col'), false);
      assert.equal(serialized.includes('Failing row'), false);
      assert.equal(serialized.includes('internal_audit_keys'), false);
      assert.equal(serialized.includes('supersecretvalue'), false);
      assert.equal(serialized.includes('eyJhbGciOi'), false);

      // Verify server diagnostic logs exist and redacted secrets
      assert.equal(logged.length, 1);
      const logStr = JSON.stringify(logged[0]);
      assert.equal(logStr.includes('supersecretvalue'), false);
      assert.equal(logStr.includes('sig1234567890'), false);
      assert.match(redactSensitiveText('token=abc12345 Bearer xyz.123.456'), /\[REDACTED\]/);
    } finally {
      console.error = origError;
    }
    results.push('PASS: Sanitized API database errors & redacted server diagnostics');
  }

  // 2. Older hydration request cannot restore a user after logout (SIGNED_OUT precedence)
  {
    const workerA = makeProfile({ id: 'user-a', full_name: 'Worker A' });
    const storage = createMemoryStorage();
    let latestState: AuthSessionState = { user: null, isSessionVerified: false, authError: null };
    const fetchDef = deferred<UserProfile | null>();

    const controller = new AuthSessionController({
      storage,
      getSession: async () => ({ session: null, error: null }),
      fetchProfileById: () => fetchDef.promise,
      signOut: async () => undefined,
      onStateChange: (s) => {
        latestState = s;
      },
    });

    const hydrationPromise = controller.hydrateUser('user-a');
    controller.handleSignedOut();
    fetchDef.resolve(workerA);

    const res = await hydrationPromise;
    assert.equal(res.success, false);
    assert.equal(latestState.user, null);
    assert.equal(latestState.isSessionVerified, false);
    assert.equal(storage.getItem(CACHED_SUPABASE_PROFILE_KEY), null);
    results.push('PASS: Older hydration cannot restore user after SIGNED_OUT');
  }

  // 3. Older hydration request cannot overwrite a newer account after account switch
  {
    const workerA = makeProfile({ id: 'user-a', full_name: 'Worker A', role: 'field_worker' });
    const coordB = makeProfile({ id: 'user-b', full_name: 'Coord B', role: 'coordinator' });
    const storage = createMemoryStorage();
    let latestState: AuthSessionState = { user: null, isSessionVerified: false, authError: null };

    const defA = deferred<UserProfile | null>();
    const defB = deferred<UserProfile | null>();

    const controller = new AuthSessionController({
      storage,
      getSession: async () => ({ session: null, error: null }),
      fetchProfileById: (id) => (id === 'user-a' ? defA.promise : defB.promise),
      signOut: async () => undefined,
      onStateChange: (s) => {
        latestState = s;
      },
    });

    const pA = controller.hydrateUser('user-a');
    const pB = controller.hydrateUser('user-b');
    defB.resolve(coordB);
    const resB = await pB;

    defA.resolve(workerA);
    const resA = await pA;

    assert.equal(resB.success, true);
    assert.equal(resA.success, false);
    assert.equal(latestState.user?.id, 'user-b');
    assert.equal(latestState.user?.role, 'coordinator');
    assert.equal(controller.readCachedProfile()?.id, 'user-b');
    results.push('PASS: Older hydration cannot overwrite newer account after switch');
  }

  // 4. Duplicate competing hydration calls for same user deduplicate cleanly
  {
    const workerA = makeProfile({ id: 'user-a' });
    const storage = createMemoryStorage();
    let fetchCount = 0;
    const def = deferred<UserProfile | null>();

    const controller = new AuthSessionController({
      storage,
      getSession: async () => ({ session: null, error: null }),
      fetchProfileById: () => {
        fetchCount += 1;
        return def.promise;
      },
      signOut: async () => undefined,
      onStateChange: () => undefined,
    });

    const p1 = controller.hydrateUser('user-a');
    const p2 = controller.hydrateUser('user-a');
    def.resolve(workerA);
    const [r1, r2] = await Promise.all([p1, p2]);

    assert.equal(fetchCount, 1);
    assert.equal(r1.success, true);
    assert.equal(r2.success, true);
    results.push('PASS: Concurrent duplicate hydration calls deduplicate to single fetch');
  }

  // 5. 401 and 403 profile verification failures clear stale cached profile and sign out
  {
    for (const pgErr of [
      { code: 'PGRST301', status: 401, message: 'JWT expired' },
      { code: '42501', status: 403, message: 'permission denied' },
    ]) {
      const cachedWorker = makeProfile({ id: 'user-a', role: 'coordinator' });
      const storage = createMemoryStorage({
        [CACHED_SUPABASE_PROFILE_KEY]: JSON.stringify(cachedWorker),
      });
      let latestState: AuthSessionState = {
        user: cachedWorker,
        isSessionVerified: true,
        authError: null,
      };
      let signOutCalls = 0;

      const controller = new AuthSessionController({
        storage,
        getSession: async () => ({ session: null, error: null }),
        fetchProfileById: async () => {
          throw pgErr;
        },
        signOut: async () => {
          signOutCalls += 1;
        },
        onStateChange: (s) => {
          latestState = s;
        },
      });

      const res = await controller.hydrateUser('user-a');
      assert.equal(res.success, false);
      assert.equal(latestState.user, null);
      assert.equal(latestState.isSessionVerified, false);
      assert.equal(storage.getItem(CACHED_SUPABASE_PROFILE_KEY), null);
      assert.equal(signOutCalls, 1);
    }
    results.push('PASS: 401/403 profile verification failures purge stale cache & sign out');
  }

  // 6. Temporary network failures preserve offline cache WITHOUT treating it as verified auth
  {
    const cachedWorker = makeProfile({ id: 'user-a', full_name: 'Offline Cached Worker' });
    const storage = createMemoryStorage({
      [CACHED_SUPABASE_PROFILE_KEY]: JSON.stringify(cachedWorker),
    });
    let latestState: AuthSessionState = { user: null, isSessionVerified: false, authError: null };

    const controller = new AuthSessionController({
      storage,
      isOnline: () => false,
      getSession: async () => ({
        session: null,
        error: Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 }),
      }),
      fetchProfileById: async () => {
        throw new TypeError('Failed to fetch');
      },
      signOut: async () => undefined,
      onStateChange: (s) => {
        latestState = s;
      },
    });

    // 6a. getSession() transient network failure preserves cache with isSessionVerified=false
    await controller.restoreInitialSession();
    assert.equal(latestState.user?.id, 'user-a');
    assert.equal(latestState.isSessionVerified, false);
    assert.ok(storage.getItem(CACHED_SUPABASE_PROFILE_KEY));

    // 6b. hydrateUser() transient TypeError preserves cache with isOfflineCache=true & isSessionVerified=false
    const hydrateRes = await controller.hydrateUser('user-a');
    assert.equal(hydrateRes.success, true);
    assert.equal(hydrateRes.isOfflineCache, true);
    assert.equal(latestState.user?.id, 'user-a');
    assert.equal(latestState.isSessionVerified, false);

    // 6c. Non-network getSession() error clears cache
    const controller2 = new AuthSessionController({
      storage,
      isOnline: () => true,
      getSession: async () => ({
        session: null,
        error: { status: 400, message: 'Invalid Refresh Token' },
      }),
      fetchProfileById: async () => null,
      signOut: async () => undefined,
      onStateChange: (s) => {
        latestState = s;
      },
    });
    await controller2.restoreInitialSession();
    assert.equal(latestState.user, null);
    assert.equal(storage.getItem(CACHED_SUPABASE_PROFILE_KEY), null);
    results.push('PASS: Network failures preserve offline cache unverified; invalid session clears cache');
  }

  // 7. Partial or invalid Supabase configuration fails closed (does NOT activate demo mode)
  {
    const emptyEnv = getFrontendEnvStatus({});
    assert.equal(emptyEnv.mode, 'demo');
    assert.equal(emptyEnv.isDemoMode, true);
    assert.equal(emptyEnv.isConfigured, false);
    assert.equal(emptyEnv.validationErrors.length, 0);

    const urlOnly = getFrontendEnvStatus({ VITE_SUPABASE_URL: 'https://proj.supabase.co' });
    assert.equal(urlOnly.mode, 'misconfigured');
    assert.equal(urlOnly.isDemoMode, false);
    assert.equal(urlOnly.isConfigured, false);
    assert.ok(urlOnly.validationErrors.length > 0);

    const keyOnly = getFrontendEnvStatus({
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validlengthplaceholder',
    });
    assert.equal(keyOnly.mode, 'misconfigured');
    assert.equal(keyOnly.isDemoMode, false);
    assert.equal(keyOnly.isConfigured, false);
    assert.ok(keyOnly.validationErrors.length > 0);

    const badUrl = getFrontendEnvStatus({
      VITE_SUPABASE_URL: 'not-a-url',
      VITE_SUPABASE_ANON_KEY: 'short',
    });
    assert.equal(badUrl.mode, 'misconfigured');
    assert.equal(badUrl.isDemoMode, false);
    assert.equal(badUrl.isConfigured, false);
    assert.ok(badUrl.validationErrors.length >= 2);

    const validEnv = getFrontendEnvStatus({
      VITE_SUPABASE_URL: 'https://proj.supabase.co/',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.validlengthplaceholder',
    });
    assert.equal(validEnv.mode, 'supabase');
    assert.equal(validEnv.isDemoMode, false);
    assert.equal(validEnv.isConfigured, true);
    assert.equal(validEnv.config?.supabaseUrl, 'https://proj.supabase.co');
    results.push('PASS: Partial or invalid Supabase env fails closed without enabling demo mode');
  }

  // 8. API client does NOT use legacy field_track_jwt fallback
  {
    const origFetch = globalThis.fetch;
    const origLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
    const capturedHeaders: Array<Record<string, string>> = [];

    (globalThis as { localStorage: AuthSessionStorage }).localStorage = createMemoryStorage({
      field_track_jwt: 'stale-legacy-jwt-token',
    });

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      capturedHeaders.push((init?.headers as Record<string, string>) || {});
      return new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const client = new ApiClient();

      // 8a. Token provider active & returns null -> NO Authorization header sent
      client.setAccessTokenProvider(async () => null);
      await client.get('/auth/me');
      assert.equal(capturedHeaders[0]['Authorization'], undefined);

      // 8b. Token provider active & returns live Supabase access token -> sends it
      client.setAccessTokenProvider(async () => 'live-supabase-jwt');
      await client.get('/auth/me');
      assert.equal(capturedHeaders[1]['Authorization'], 'Bearer live-supabase-jwt');

      // 8c. Token provider unset -> still NEVER reads legacy field_track_jwt
      client.setAccessTokenProvider(null);
      await client.get('/auth/me');
      assert.equal(capturedHeaders[2]['Authorization'], undefined);
    } finally {
      globalThis.fetch = origFetch;
      if (origLocalStorage === undefined) {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      } else {
        (globalThis as { localStorage: unknown }).localStorage = origLocalStorage;
      }
    }
    results.push('PASS: ApiClient ignores legacy field_track_jwt and uses dynamic token provider');
  }

  // 9. TopNav does not render authenticated menu while isLoading === true
  {
    const baseAuth: AuthContextType = {
      user: DEMO_WORKER,
      role: 'field_worker',
      isAuthenticated: true,
      isSupabaseAuth: true,
      isDemoMode: false,
      isConfigError: false,
      isSessionVerified: false,
      isLoading: true,
      authError: null,
      clearAuthError: () => undefined,
      login: async () => ({ success: false }),
      logout: async () => undefined,
      register: async () => ({ success: false }),
      switchRole: () => undefined,
      updateProfile: async () => ({ success: false }),
    };

    const syncVal = {
      isOnline: true,
      isSimulatedOffline: false,
      toggleSimulateOffline: () => undefined,
      isSyncing: false,
      pendingCount: 2,
      failedCount: 0,
      lastSyncTime: null,
      notifications: [],
      dismissNotification: () => undefined,
      triggerSyncNow: async () => ({ success: true, syncedCount: 0, errors: [] }),
      checkHealth: async () => true,
    };

    const themeVal = {
      theme: 'light' as const,
      toggleTheme: () => undefined,
      setTheme: () => undefined,
    };

    const renderNav = (authOverride: Partial<AuthContextType>) =>
      renderToStaticMarkup(
        React.createElement(
          ThemeContext.Provider,
          { value: themeVal },
          React.createElement(
            AuthContext.Provider,
            { value: { ...baseAuth, ...authOverride } },
            React.createElement(
              SyncContext.Provider,
              { value: syncVal },
              React.createElement(TopNav, {
                currentPage: 'landing',
                onNavigate: () => undefined,
              })
            )
          )
        )
      );

    const loadingHtml = renderNav({ isLoading: true, isAuthenticated: true, user: DEMO_WORKER });
    assert.equal(loadingHtml.includes('aria-label="Restoring session"'), true);
    assert.equal(loadingHtml.includes('Samuel'), false);
    assert.equal(loadingHtml.includes('Create Report'), false);
    assert.equal(loadingHtml.includes('Sign Out'), false);
    assert.equal(loadingHtml.includes('Sync'), false);

    const loadedHtml = renderNav({ isLoading: false, isAuthenticated: true, user: DEMO_WORKER });
    assert.equal(loadedHtml.includes('Samuel'), true);
    assert.equal(loadedHtml.includes('Create Report'), true);
    results.push('PASS: TopNav hides authenticated menu & nav links while isLoading is true');
  }

  // 10. Express JWT / RBAC middleware smoke checks
  {
    const mockRes = () => {
      const out: { statusCode: number; body: any } = { statusCode: 200, body: null };
      return {
        out,
        status(code: number) {
          out.statusCode = code;
          return this;
        },
        json(payload: any) {
          out.body = payload;
          return this;
        },
      } as any;
    };

    assert.equal(extractBearerToken({ headers: {} } as any), null);
    assert.equal(extractBearerToken({ headers: { authorization: 'Bearer tok-1' } } as any), 'tok-1');

    const prevUrl = process.env.VITE_SUPABASE_URL;
    const prevKey = process.env.VITE_SUPABASE_ANON_KEY;
    try {
      delete process.env.VITE_SUPABASE_URL;
      delete process.env.VITE_SUPABASE_ANON_KEY;
      const r503 = mockRes();
      let n503 = false;
      await requireAuth({ headers: {} } as any, r503, () => {
        n503 = true;
      });
      assert.equal(n503, false);
      assert.equal(r503.out.statusCode, 503);

      process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
      process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';
      const r401 = mockRes();
      let n401 = false;
      await requireAuth({ headers: {} } as any, r401, () => {
        n401 = true;
      });
      assert.equal(n401, false);
      assert.equal(r401.out.statusCode, 401);

      const r403 = mockRes();
      let n403 = false;
      requireCoordinator({ auth: { role: 'field_worker' } } as AuthenticatedRequest, r403, () => {
        n403 = true;
      });
      assert.equal(n403, false);
      assert.equal(r403.out.statusCode, 403);

      const r200 = mockRes();
      let n200 = false;
      requireCoordinator({ auth: { role: 'coordinator' } } as AuthenticatedRequest, r200, () => {
        n200 = true;
      });
      assert.equal(n200, true);
    } finally {
      if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
      else process.env.VITE_SUPABASE_ANON_KEY = prevKey;
    }
    results.push('PASS: Express requireAuth & requireCoordinator fail-closed RBAC checks');
  }

  for (const line of results) {
    console.log(line);
  }
  console.log(`\nAll ${results.length} Phase 3 security regression test suites passed.`);
}

runTests().catch((err) => {
  console.error('Phase 3 security regression test failed:', err);
  process.exit(1);
});
