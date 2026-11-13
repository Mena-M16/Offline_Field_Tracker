import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertFrontendSupabaseEnv, getFrontendEnvStatus } from '../config/env';
import { AppDatabaseError } from './databaseErrors';
import type { Database } from '../types/supabase';

/**
 * Frontend Reusable Supabase Client
 *
 * Uses ONLY the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
 * All queries executed through this client are subject to PostgreSQL RLS.
 * When Supabase environment variables are not configured yet, `getSupabaseClient()`
 * safely returns `null` so offline-first Dexie workflows continue uninterrupted.
 */

let browserClient: SupabaseClient<Database> | null = null;
let cachedConfigKey: string | null = null;

export function isSupabaseClientConfigured(): boolean {
  return getFrontendEnvStatus().isConfigured;
}

export function getSupabaseClient(): SupabaseClient<Database> | null {
  const status = getFrontendEnvStatus();
  if (!status.isConfigured || !status.config) {
    return null;
  }

  const nextKey = `${status.config.supabaseUrl}::${status.config.supabaseAnonKey}`;
  if (!browserClient || cachedConfigKey !== nextKey) {
    browserClient = createClient<Database>(
      status.config.supabaseUrl,
      status.config.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'fieldtrack_supabase_auth',
        },
        global: {
          headers: {
            'X-Client-Info': 'fieldtrack-web',
          },
        },
      }
    );
    cachedConfigKey = nextKey;
  }

  return browserClient;
}

export function requireSupabaseClient(): SupabaseClient<Database> {
  const client = getSupabaseClient();
  if (!client) {
    try {
      assertFrontendSupabaseEnv();
    } catch (err) {
      throw new AppDatabaseError({
        code: 'CONFIG_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Supabase frontend client is not configured.',
        httpStatus: 500,
        retryable: false,
        cause: err,
      });
    }
  }
  return client!;
}

export function resetSupabaseClientForTests(): void {
  browserClient = null;
  cachedConfigKey = null;
}
