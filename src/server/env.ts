import 'dotenv/config';
import { z } from 'zod';

/**
 * Server-Only Environment Configuration & Validation
 *
 * Strictly for Node.js / Express (`server.ts` and `src/server/*`).
 * Never import this module from frontend React components or Vite client code.
 */

if (typeof window !== 'undefined') {
  throw new Error('SECURITY_VIOLATION: src/server/env.ts must never run in a browser context.');
}

const serverSupabasePublicSchema = z.object({
  SUPABASE_URL: z
    .string()
    .trim()
    .url('SUPABASE_URL must be a valid http(s) URL.'),
  SUPABASE_ANON_KEY: z
    .string()
    .trim()
    .min(20, 'SUPABASE_ANON_KEY appears too short to be a valid Supabase anon key.'),
  SUPABASE_STORAGE_BUCKET: z
    .string()
    .trim()
    .min(1)
    .default('report-media'),
});

const serverRuntimeSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().trim().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export interface ServerSupabasePublicConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storageBucket: string;
}

export interface ServerEnvSummary {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  corsOrigins: string[] | null;
  supabasePublic: ServerSupabasePublicConfig | null;
  hasServiceRoleKey: boolean;
  validationErrors: string[];
}

function getRawServerSupabaseValues() {
  // Support server-only SUPABASE_* vars first; allow fallback to VITE_* only for URL & public anon key.
  // Service role key NEVER falls back to any VITE_* variable.
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const storageBucket =
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.VITE_SUPABASE_STORAGE_BUCKET?.trim() ||
    'report-media';

  return { url, anonKey, serviceRoleKey, storageBucket };
}

export function getServerEnvSummary(): ServerEnvSummary {
  const runtimeParsed = serverRuntimeSchema.safeParse({
    PORT: process.env.PORT,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    NODE_ENV: process.env.NODE_ENV || 'development',
  });

  const port = runtimeParsed.success ? runtimeParsed.data.PORT : 3000;
  const nodeEnv = runtimeParsed.success ? runtimeParsed.data.NODE_ENV : 'development';
  const rawCors = runtimeParsed.success ? runtimeParsed.data.CORS_ORIGIN : process.env.CORS_ORIGIN;
  const corsOrigins = rawCors
    ? rawCors
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : null;

  const { url, anonKey, serviceRoleKey, storageBucket } = getRawServerSupabaseValues();
  const errors: string[] = [];

  if (!runtimeParsed.success) {
    errors.push(
      ...runtimeParsed.error.issues.map((i) => `${i.path.join('.') || 'runtime'}: ${i.message}`)
    );
  }

  let supabasePublic: ServerSupabasePublicConfig | null = null;
  if (url || anonKey) {
    const parsedSupabase = serverSupabasePublicSchema.safeParse({
      SUPABASE_URL: url ?? '',
      SUPABASE_ANON_KEY: anonKey ?? '',
      SUPABASE_STORAGE_BUCKET: storageBucket,
    });
    if (parsedSupabase.success) {
      supabasePublic = {
        supabaseUrl: parsedSupabase.data.SUPABASE_URL.replace(/\/+$/, ''),
        supabaseAnonKey: parsedSupabase.data.SUPABASE_ANON_KEY,
        storageBucket: parsedSupabase.data.SUPABASE_STORAGE_BUCKET,
      };
    } else {
      errors.push(
        ...parsedSupabase.error.issues.map((i) => `${i.path.join('.') || 'supabase'}: ${i.message}`)
      );
    }
  }

  const hasServiceRoleKey = Boolean(serviceRoleKey && serviceRoleKey.length >= 20);
  if (serviceRoleKey && !hasServiceRoleKey) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY: appears too short to be valid.');
  }

  return {
    port,
    nodeEnv,
    corsOrigins: corsOrigins && corsOrigins.length > 0 ? corsOrigins : null,
    supabasePublic,
    hasServiceRoleKey,
    validationErrors: errors,
  };
}

export function hasServerSupabaseConfig(): boolean {
  return getServerEnvSummary().supabasePublic !== null;
}

export function assertServerSupabasePublicEnv(): ServerSupabasePublicConfig {
  const summary = getServerEnvSummary();
  if (!summary.supabasePublic) {
    const reason =
      summary.validationErrors.length > 0
        ? summary.validationErrors.join('; ')
        : 'SUPABASE_URL and SUPABASE_ANON_KEY are not configured.';
    throw new Error(`Supabase server configuration is missing or invalid: ${reason}`);
  }
  return summary.supabasePublic;
}

export function assertServerServiceRoleEnv(): ServerSupabasePublicConfig & {
  serviceRoleKey: string;
} {
  const publicConfig = assertServerSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey || serviceRoleKey.length < 20) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required on the server for administrative Supabase operations.'
    );
  }

  if (serviceRoleKey === publicConfig.supabaseAnonKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY must not match SUPABASE_ANON_KEY.'
    );
  }

  return {
    ...publicConfig,
    serviceRoleKey,
  };
}
