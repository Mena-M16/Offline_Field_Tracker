/**
 * Centralized Database Error Handling
 *
 * Normalizes PostgreSQL SQLSTATE errors, custom trigger exceptions from
 * `supabase/migrations/001_initial_schema.sql`, PostgREST error envelopes,
 * and configuration/network failures into consistent application errors.
 */

export type DatabaseErrorCode =
  | 'VERSION_CONFLICT'
  | 'DUPLICATE_CLIENT_ID'
  | 'UNIQUE_VIOLATION'
  | 'INVALID_STATUS_TRANSITION'
  | 'MISSING_REJECTION_REASON'
  | 'CHECK_CONSTRAINT_VIOLATION'
  | 'FOREIGN_KEY_VIOLATION'
  | 'IMMUTABLE_CLIENT_ID'
  | 'IMMUTABLE_CREATOR'
  | 'IMMUTABLE_SUBMISSION_EVIDENCE'
  | 'IMMUTABLE_AUDIT_LOG'
  | 'FORBIDDEN_PROFILE_PRIVILEGE_CHANGE'
  | 'FORBIDDEN_EMAIL_CHANGE'
  | 'RLS_POLICY_VIOLATION'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'CONFIG_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_DB_ERROR';

export interface DatabaseErrorOptions {
  code: DatabaseErrorCode;
  message: string;
  httpStatus: number;
  retryable?: boolean;
  pgCode?: string;
  details?: unknown[];
  cause?: unknown;
}

interface RawPgLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  statusCode?: number;
}

const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[JWT_REDACTED]'],
  [/(password|passwd|secret|token|apikey|api_key|service_role_key|authorization)\s*[:=]\s*(['"]?)[^\s,'";}]+\2/gi, '$1=[REDACTED]'],
];

export function redactSensitiveText(input: string): string {
  let sanitized = input;
  for (const [pattern, replacement] of SENSITIVE_TEXT_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

export class AppDatabaseError extends Error {
  readonly code: DatabaseErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly pgCode?: string;
  readonly details: unknown[];

  constructor(options: DatabaseErrorOptions) {
    super(options.message);
    this.name = 'AppDatabaseError';
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.retryable = options.retryable ?? false;
    this.pgCode = options.pgCode;
    this.details = options.details ?? [];
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function isRawPgLikeError(value: unknown): value is RawPgLikeError {
  return typeof value === 'object' && value !== null;
}

function extractMessage(err: RawPgLikeError): string {
  return typeof err.message === 'string' && err.message.trim().length > 0
    ? err.message.trim()
    : 'An unexpected database error occurred.';
}

/**
 * Maps PostgreSQL / PostgREST / Supabase exceptions to `AppDatabaseError`.
 * Preserves existing `AppDatabaseError` instances idempotently.
 *
 * Security invariant: Raw database `details`, `hint`, and arbitrary engine
 * `message` strings are NEVER forwarded into client-facing `message` or `details`.
 */
export function normalizeDatabaseError(error: unknown): AppDatabaseError {
  if (error instanceof AppDatabaseError) {
    return error;
  }

  if (!isRawPgLikeError(error)) {
    return new AppDatabaseError({
      code: 'UNKNOWN_DB_ERROR',
      message: 'An unexpected database error occurred.',
      httpStatus: 500,
      retryable: false,
      details: [],
      cause: error,
    });
  }

  const rawCode = typeof error.code === 'string' ? error.code.trim() : '';
  const msg = extractMessage(error);

  // 1. Custom trigger codes raised in supabase/migrations/001_initial_schema.sql
  if (msg.includes('VERSION_CONFLICT') || rawCode === '40001') {
    return new AppDatabaseError({
      code: 'VERSION_CONFLICT',
      message:
        'This report was updated by another user. Refresh the latest version before saving changes.',
      httpStatus: 409,
      retryable: false,
      pgCode: rawCode || '40001',
      details: [],
      cause: error,
    });
  }

  if (msg.includes('INVALID_STATUS_TRANSITION')) {
    return new AppDatabaseError({
      code: 'INVALID_STATUS_TRANSITION',
      message: 'Report status transition is not permitted from the current state.',
      httpStatus: 400,
      retryable: false,
      pgCode: rawCode || '23514',
      details: [],
      cause: error,
    });
  }

  if (msg.includes('MISSING_REJECTION_REASON')) {
    return new AppDatabaseError({
      code: 'MISSING_REJECTION_REASON',
      message: 'Rejecting a report requires a reason of at least 10 characters.',
      httpStatus: 400,
      retryable: false,
      pgCode: rawCode || '23514',
      details: [],
      cause: error,
    });
  }

  if (msg.includes('FORBIDDEN_PROFILE_PRIVILEGE_CHANGE')) {
    return new AppDatabaseError({
      code: 'FORBIDDEN_PROFILE_PRIVILEGE_CHANGE',
      message: 'Only administrators may change user role or account activation status.',
      httpStatus: 403,
      retryable: false,
      pgCode: rawCode || '42501',
      details: [],
      cause: error,
    });
  }

  if (msg.includes('FORBIDDEN_EMAIL_CHANGE')) {
    return new AppDatabaseError({
      code: 'FORBIDDEN_EMAIL_CHANGE',
      message: 'Profile email is managed by Supabase Auth and cannot be edited directly.',
      httpStatus: 403,
      retryable: false,
      pgCode: rawCode || '42501',
      details: [],
      cause: error,
    });
  }

  if (msg.includes('IMMUTABLE_AUDIT_LOG')) {
    return new AppDatabaseError({
      code: 'IMMUTABLE_AUDIT_LOG',
      message: 'Activity audit logs are append-only and cannot be modified or deleted.',
      httpStatus: 403,
      retryable: false,
      pgCode: rawCode || '42501',
      details: [],
      cause: error,
    });
  }

  if (msg.includes('IMMUTABLE_SUBMISSION_EVIDENCE')) {
    return new AppDatabaseError({
      code: 'IMMUTABLE_SUBMISSION_EVIDENCE',
      message: 'Submitted field report evidence cannot be modified after submission.',
      httpStatus: 403,
      retryable: false,
      pgCode: rawCode || '42501',
      details: [],
      cause: error,
    });
  }

  if (msg.includes('IMMUTABLE_CLIENT_ID')) {
    return new AppDatabaseError({
      code: 'IMMUTABLE_CLIENT_ID',
      message: 'Report client_id is immutable after creation.',
      httpStatus: 400,
      retryable: false,
      pgCode: rawCode || '22000',
      details: [],
      cause: error,
    });
  }

  if (msg.includes('IMMUTABLE_CREATOR')) {
    return new AppDatabaseError({
      code: 'IMMUTABLE_CREATOR',
      message: 'Report created_by cannot be reassigned after creation.',
      httpStatus: 400,
      retryable: false,
      pgCode: rawCode || '22000',
      details: [],
      cause: error,
    });
  }

  // 2. Standard PostgreSQL SQLSTATE codes
  if (rawCode === '23505') {
    const isClientIdDuplicate =
      msg.includes('client_id') ||
      String(error.details || '').includes('client_id');
    return new AppDatabaseError({
      code: isClientIdDuplicate ? 'DUPLICATE_CLIENT_ID' : 'UNIQUE_VIOLATION',
      message: isClientIdDuplicate
        ? 'A report with this client_id has already been synchronized.'
        : 'Record violates a unique constraint.',
      httpStatus: 409,
      retryable: false,
      pgCode: rawCode,
      details: [],
      cause: error,
    });
  }

  if (rawCode === '23503') {
    return new AppDatabaseError({
      code: 'FOREIGN_KEY_VIOLATION',
      message: 'Referenced record does not exist or cannot be removed while referenced.',
      httpStatus: 400,
      retryable: false,
      pgCode: rawCode,
      details: [],
      cause: error,
    });
  }

  if (rawCode === '23514' || rawCode === '23502') {
    return new AppDatabaseError({
      code: 'CHECK_CONSTRAINT_VIOLATION',
      message: 'Submitted data failed database integrity validation.',
      httpStatus: 400,
      retryable: false,
      pgCode: rawCode,
      details: [],
      cause: error,
    });
  }

  if (rawCode === '22P02' || rawCode === '22000') {
    return new AppDatabaseError({
      code: 'INVALID_INPUT',
      message: 'Invalid identifier or input format provided.',
      httpStatus: 400,
      retryable: false,
      pgCode: rawCode,
      details: [],
      cause: error,
    });
  }

  if (rawCode === '42501') {
    return new AppDatabaseError({
      code: 'RLS_POLICY_VIOLATION',
      message: 'Permission denied by row-level security policy.',
      httpStatus: 403,
      retryable: false,
      pgCode: rawCode,
      details: [],
      cause: error,
    });
  }

  // 3. PostgREST & HTTP error codes
  if (rawCode === 'PGRST116') {
    return new AppDatabaseError({
      code: 'NOT_FOUND',
      message: 'Requested record was not found or is not accessible.',
      httpStatus: 404,
      retryable: false,
      pgCode: rawCode,
      details: [],
      cause: error,
    });
  }

  if (rawCode === 'PGRST301' || error.status === 401 || error.statusCode === 401) {
    return new AppDatabaseError({
      code: 'UNAUTHENTICATED',
      message: 'Authentication session is missing or expired.',
      httpStatus: 401,
      retryable: false,
      pgCode: rawCode || undefined,
      details: [],
      cause: error,
    });
  }

  // 4. Transient network failures
  if (
    error instanceof TypeError ||
    msg.toLowerCase().includes('fetch') ||
    msg.toLowerCase().includes('network') ||
    msg.toLowerCase().includes('timeout')
  ) {
    return new AppDatabaseError({
      code: 'NETWORK_ERROR',
      message: 'Database service is currently unreachable. Local data remains preserved.',
      httpStatus: 503,
      retryable: true,
      details: [],
      cause: error,
    });
  }

  const fallbackStatus =
    typeof error.status === 'number' && error.status >= 400 && error.status < 600
      ? error.status
      : typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500;

  return new AppDatabaseError({
    code: 'UNKNOWN_DB_ERROR',
    message: 'An unexpected database error occurred.',
    httpStatus: fallbackStatus,
    retryable: false,
    pgCode: rawCode || undefined,
    details: [],
    cause: error,
  });
}

function logServerDatabaseDiagnostics(rawError: unknown, normalized: AppDatabaseError): void {
  if (typeof window !== 'undefined') {
    return;
  }

  const rootCause =
    rawError instanceof AppDatabaseError &&
    'cause' in rawError &&
    (rawError as Error & { cause?: unknown }).cause !== undefined
      ? (rawError as Error & { cause?: unknown }).cause
      : rawError;

  const diagnostic: Record<string, unknown> = {
    code: normalized.code,
    httpStatus: normalized.httpStatus,
    pgCode: normalized.pgCode,
  };

  if (isRawPgLikeError(rootCause)) {
    if (typeof rootCause.message === 'string' && rootCause.message.trim()) {
      diagnostic.internalMessage = redactSensitiveText(rootCause.message.trim());
    }
    if (typeof rootCause.details === 'string' && rootCause.details.trim()) {
      diagnostic.internalDetails = redactSensitiveText(rootCause.details.trim());
    }
    if (typeof rootCause.hint === 'string' && rootCause.hint.trim()) {
      diagnostic.internalHint = redactSensitiveText(rootCause.hint.trim());
    }
  } else if (typeof rootCause === 'string' && rootCause.trim()) {
    diagnostic.internalMessage = redactSensitiveText(rootCause.trim());
  }

  console.error('[FieldTrack][DB_ERROR]', diagnostic);
}

export function isVersionConflictError(error: unknown): boolean {
  return normalizeDatabaseError(error).code === 'VERSION_CONFLICT';
}

export function isDuplicateClientIdError(error: unknown): boolean {
  return normalizeDatabaseError(error).code === 'DUPLICATE_CLIENT_ID';
}

export function toApiErrorPayload(error: unknown): {
  status: number;
  body: {
    success: false;
    error: {
      code: DatabaseErrorCode;
      message: string;
      details: unknown[];
    };
  };
} {
  const normalized = normalizeDatabaseError(error);
  logServerDatabaseDiagnostics(error, normalized);

  return {
    status: normalized.httpStatus,
    body: {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    },
  };
}
