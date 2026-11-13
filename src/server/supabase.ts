import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertServerServiceRoleEnv,
  assertServerSupabasePublicEnv,
  getServerEnvSummary,
} from './env';
import type { Database } from '../types/supabase';

/**
 * Server-Side Reusable Supabase Clients
 *
 * Strictly for Express backend handlers (`server.ts` / `src/server/*`).
 *
 * Security rule:
 * - User-scoped API routes MUST call `createSupabaseUserClient(accessToken)`
 *   so PostgreSQL Row Level Security (RLS) enforces permissions as that user.
 * - `getSupabaseAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
 *   and must ONLY be used for explicitly privileged administrative tasks
 *   (never to service normal worker/coordinator requests).
 */

if (typeof window !== 'undefined') {
  throw new Error('SECURITY_VIOLATION: src/server/supabase.ts must never run in a browser context.');
}

let cachedAnonClient: SupabaseClient<Database> | null = null;
let cachedAdminClient: SupabaseClient<Database> | null = null;

/**
 * Creates a request-scoped Supabase client bound to the caller's Bearer JWT.
 * Enforces all PostgreSQL RLS policies for `authenticated` role.
 */
export function createSupabaseUserClient(accessToken: string): SupabaseClient<Database> {
  const token = accessToken.trim();
  if (!token) {
    throw new Error('UNAUTHENTICATED: Missing Supabase user access token.');
  }

  const { supabaseUrl, supabaseAnonKey } = assertServerSupabasePublicEnv();
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Client-Info': 'fieldtrack-server-user',
      },
    },
  });
}

/**
 * Server-side anon client for stateless token verification (`auth.getUser(jwt)`).
 */
export function getSupabaseServerAnonClient(): SupabaseClient<Database> {
  const { supabaseUrl, supabaseAnonKey } = assertServerSupabasePublicEnv();
  if (!cachedAnonClient) {
    cachedAnonClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'fieldtrack-server-anon',
        },
      },
    });
  }
  return cachedAnonClient;
}

/**
 * Administrative service-role client.
 * WARNING: Bypasses RLS. Reserve strictly for administrative seeding,
 * account lifecycle management, or server diagnostics.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  const { supabaseUrl, serviceRoleKey } = assertServerServiceRoleEnv();
  if (!cachedAdminClient) {
    cachedAdminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          'X-Client-Info': 'fieldtrack-server-admin',
        },
      },
    });
  }
  return cachedAdminClient;
}

/**
 * Lightweight Supabase REST reachability check for server health probes.
 * Never leaks secrets or relies on user tables directly.
 */
export async function checkSupabaseConnectivity(): Promise<{
  configured: boolean;
  reachable: boolean;
  latencyMs?: number;
}> {
  const summary = getServerEnvSummary();
  if (!summary.supabasePublic) {
    return { configured: false, reachable: false };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${summary.supabasePublic.supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: summary.supabasePublic.supabaseAnonKey,
      },
      signal: controller.signal,
    });
    return {
      configured: true,
      reachable: res.ok,
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      configured: true,
      reachable: false,
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
