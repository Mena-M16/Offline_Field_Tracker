import { z } from 'zod';

/**
 * Frontend-Safe Environment Configuration
 *
 * Reads ONLY Vite-exposed `VITE_*` variables.
 * Server-only secrets (such as SUPABASE_SERVICE_ROLE_KEY) must NEVER be
 * referenced or validated in client code.
 */

const frontendSupabaseSchema = z.object({
  VITE_SUPABASE_URL: z
    .string()
    .trim()
    .url('VITE_SUPABASE_URL must be a valid http(s) URL.'),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .trim()
    .min(20, 'VITE_SUPABASE_ANON_KEY appears too short to be a valid Supabase anon key.'),
  VITE_SUPABASE_STORAGE_BUCKET: z
    .string()
    .trim()
    .min(1)
    .default('report-media'),
  VITE_API_BASE_URL: z
    .string()
    .trim()
    .min(1)
    .default('/api/v1'),
});

export interface FrontendSupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storageBucket: string;
  apiBaseUrl: string;
}

export type FrontendAuthMode = 'supabase' | 'demo' | 'misconfigured';

export interface FrontendEnvStatus {
  mode: FrontendAuthMode;
  isConfigured: boolean;
  isDemoMode: boolean;
  config: FrontendSupabaseConfig | null;
  apiBaseUrl: string;
  storageBucket: string;
  validationErrors: string[];
}

export interface FrontendEnvOverride {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_STORAGE_BUCKET?: string;
  VITE_API_BASE_URL?: string;
}

function readRawFrontendEnv(override?: FrontendEnvOverride) {
  const metaEnv =
    (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

  const rawUrl = (override ? override.VITE_SUPABASE_URL : metaEnv.VITE_SUPABASE_URL)?.trim();
  const rawAnonKey = (
    override ? override.VITE_SUPABASE_ANON_KEY : metaEnv.VITE_SUPABASE_ANON_KEY
  )?.trim();
  const rawBucket =
    (override
      ? override.VITE_SUPABASE_STORAGE_BUCKET
      : metaEnv.VITE_SUPABASE_STORAGE_BUCKET
    )?.trim() || 'report-media';
  const rawApiBase =
    (override ? override.VITE_API_BASE_URL : metaEnv.VITE_API_BASE_URL)?.trim() || '/api/v1';

  return {
    rawUrl,
    rawAnonKey,
    rawBucket,
    rawApiBase,
  };
}

export function getFrontendEnvStatus(override?: FrontendEnvOverride): FrontendEnvStatus {
  const { rawUrl, rawAnonKey, rawBucket, rawApiBase } = readRawFrontendEnv(override);

  // Demo mode is permitted ONLY when both Supabase credentials are genuinely absent.
  if (!rawUrl && !rawAnonKey) {
    return {
      mode: 'demo',
      isConfigured: false,
      isDemoMode: true,
      config: null,
      apiBaseUrl: rawApiBase,
      storageBucket: rawBucket,
      validationErrors: [],
    };
  }

  const parsed = frontendSupabaseSchema.safeParse({
    VITE_SUPABASE_URL: rawUrl ?? '',
    VITE_SUPABASE_ANON_KEY: rawAnonKey ?? '',
    VITE_SUPABASE_STORAGE_BUCKET: rawBucket,
    VITE_API_BASE_URL: rawApiBase,
  });

  // Partial or malformed configuration MUST fail closed (never fall back to demo mode).
  if (!parsed.success) {
    return {
      mode: 'misconfigured',
      isConfigured: false,
      isDemoMode: false,
      config: null,
      apiBaseUrl: rawApiBase,
      storageBucket: rawBucket,
      validationErrors: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`
      ),
    };
  }

  return {
    mode: 'supabase',
    isConfigured: true,
    isDemoMode: false,
    config: {
      supabaseUrl: parsed.data.VITE_SUPABASE_URL.replace(/\/+$/, ''),
      supabaseAnonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
      storageBucket: parsed.data.VITE_SUPABASE_STORAGE_BUCKET,
      apiBaseUrl: parsed.data.VITE_API_BASE_URL,
    },
    apiBaseUrl: parsed.data.VITE_API_BASE_URL,
    storageBucket: parsed.data.VITE_SUPABASE_STORAGE_BUCKET,
    validationErrors: [],
  };
}

export function assertFrontendSupabaseEnv(override?: FrontendEnvOverride): FrontendSupabaseConfig {
  const status = getFrontendEnvStatus(override);
  if (!status.isConfigured || !status.config) {
    const reason =
      status.validationErrors.length > 0
        ? status.validationErrors.join('; ')
        : 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.';
    throw new Error(`Supabase frontend configuration is unavailable: ${reason}`);
  }
  return status.config;
}
