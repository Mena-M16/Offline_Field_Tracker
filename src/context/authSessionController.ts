import { normalizeDatabaseError } from '../lib/databaseErrors';
import type { UserProfile } from '../types';

export interface AuthActionResult {
  success: boolean;
  user?: UserProfile;
  error?: string;
  requiresEmailConfirmation?: boolean;
  isOfflineCache?: boolean;
}

export interface SessionCheckResult {
  session: {
    user: { id: string };
    access_token?: string;
  } | null;
  error: unknown;
}

export interface AuthSessionState {
  user: UserProfile | null;
  isSessionVerified: boolean;
  authError: string | null;
}

export interface AuthSessionStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface AuthSessionDeps {
  getSession: () => Promise<SessionCheckResult>;
  fetchProfileById: (userId: string) => Promise<UserProfile | null>;
  signOut: () => Promise<void>;
  storage: AuthSessionStorage;
  onStateChange: (state: AuthSessionState) => void;
  cacheKey?: string;
  isOnline?: () => boolean;
}

export const CACHED_SUPABASE_PROFILE_KEY = 'field_track_cached_profile';

export function isTransientAuthNetworkError(
  error: unknown,
  isOnlineFn?: () => boolean
): boolean {
  if (!error) return false;

  if (typeof error === 'object' && error !== null) {
    const record = error as { name?: unknown; status?: unknown; message?: unknown };
    if (record.name === 'AuthRetryableFetchError') {
      return true;
    }
    if (record.status === 0) {
      return true;
    }
  }

  if (normalizeDatabaseError(error).code === 'NETWORK_ERROR') {
    return true;
  }

  if (isOnlineFn && !isOnlineFn()) {
    const msg =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message || '').toLowerCase()
        : '';
    if (
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('offline') ||
      msg.includes('timeout')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Coordinates Supabase session restoration, profile hydration, offline continuity
 * caching, and cancellation ordering so stale async responses can never override
 * newer sign-outs, account switches, or 401/403 revocations.
 */
export class AuthSessionController {
  private seq = 0;
  private disposed = false;
  private inFlightHydration: {
    userId: string;
    seq: number;
    promise: Promise<AuthActionResult>;
  } | null = null;
  private state: AuthSessionState = {
    user: null,
    isSessionVerified: false,
    authError: null,
  };
  private readonly cacheKey: string;

  constructor(private readonly deps: AuthSessionDeps) {
    this.cacheKey = deps.cacheKey ?? CACHED_SUPABASE_PROFILE_KEY;
  }

  getState(): AuthSessionState {
    return this.state;
  }

  dispose(): void {
    this.disposed = true;
    this.seq += 1;
    this.inFlightHydration = null;
  }

  readCachedProfile(expectedUserId?: string): UserProfile | null {
    try {
      const raw = this.deps.storage.getItem(this.cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as UserProfile;
      if (!parsed || typeof parsed.id !== 'string') return null;
      if (expectedUserId && parsed.id !== expectedUserId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  writeCachedProfile(profile: UserProfile | null): void {
    try {
      if (profile) {
        this.deps.storage.setItem(this.cacheKey, JSON.stringify(profile));
      } else {
        this.deps.storage.removeItem(this.cacheKey);
      }
    } catch {
      // Ignore storage quota / private-browsing failures
    }
  }

  private commitState(next: AuthSessionState): void {
    if (this.disposed) return;
    this.state = next;
    this.deps.onStateChange(next);
  }

  clearError(): void {
    if (this.state.authError !== null) {
      this.commitState({ ...this.state, authError: null });
    }
  }

  /**
   * Immediately cancels any pending hydration and clears authenticated & cached state.
   */
  handleSignedOut(options?: { preserveError?: boolean }): void {
    this.seq += 1;
    this.inFlightHydration = null;
    this.writeCachedProfile(null);
    this.commitState({
      user: null,
      isSessionVerified: false,
      authError: options?.preserveError ? this.state.authError : null,
    });
  }

  async restoreInitialSession(): Promise<void> {
    const bootSeq = ++this.seq;
    this.inFlightHydration = null;

    let sessionResult: SessionCheckResult;
    try {
      sessionResult = await this.deps.getSession();
    } catch (err) {
      if (this.disposed || bootSeq !== this.seq) return;
      if (isTransientAuthNetworkError(err, this.deps.isOnline)) {
        const cached = this.readCachedProfile();
        if (cached && cached.is_active !== false) {
          this.commitState({
            user: cached,
            isSessionVerified: false,
            authError: null,
          });
          return;
        }
      } else {
        this.writeCachedProfile(null);
      }
      this.commitState({
        user: null,
        isSessionVerified: false,
        authError: null,
      });
      return;
    }

    if (this.disposed || bootSeq !== this.seq) return;

    if (sessionResult.error) {
      if (isTransientAuthNetworkError(sessionResult.error, this.deps.isOnline)) {
        const cached = this.readCachedProfile();
        if (cached && cached.is_active !== false) {
          this.commitState({
            user: cached,
            isSessionVerified: false,
            authError: null,
          });
          return;
        }
      } else {
        // Non-network auth/refresh error: clear stale offline profile
        this.writeCachedProfile(null);
      }

      this.commitState({
        user: null,
        isSessionVerified: false,
        authError: null,
      });
      return;
    }

    if (!sessionResult.session?.user) {
      this.writeCachedProfile(null);
      this.commitState({
        user: null,
        isSessionVerified: false,
        authError: null,
      });
      return;
    }

    await this.hydrateUser(sessionResult.session.user.id);
  }

  /**
   * Deduplicates concurrent hydration for the same user while ensuring
   * any account switch or sign-out invalidates older in-flight requests.
   */
  hydrateUser(userId: string): Promise<AuthActionResult> {
    if (
      this.inFlightHydration &&
      this.inFlightHydration.userId === userId &&
      this.inFlightHydration.seq === this.seq
    ) {
      return this.inFlightHydration.promise;
    }

    const requestSeq = ++this.seq;
    const isStale = () => this.disposed || requestSeq !== this.seq;

    const promise = (async (): Promise<AuthActionResult> => {
      try {
        const profile = await this.deps.fetchProfileById(userId);
        if (isStale()) {
          return { success: false, error: 'Authentication state superseded.' };
        }

        if (!profile) {
          this.writeCachedProfile(null);
          const msg = 'No application profile found for this account.';
          this.commitState({
            user: null,
            isSessionVerified: false,
            authError: msg,
          });
          await this.deps.signOut().catch(() => undefined);
          return { success: false, error: msg };
        }

        if (profile.is_active === false) {
          this.writeCachedProfile(null);
          const msg =
            'This account has been deactivated. Contact a system administrator.';
          this.commitState({
            user: null,
            isSessionVerified: false,
            authError: msg,
          });
          await this.deps.signOut().catch(() => undefined);
          return { success: false, error: msg };
        }

        this.writeCachedProfile(profile);
        this.commitState({
          user: profile,
          isSessionVerified: true,
          authError: null,
        });
        return { success: true, user: profile, isOfflineCache: false };
      } catch (err) {
        if (isStale()) {
          return { success: false, error: 'Authentication state superseded.' };
        }

        const normalized = normalizeDatabaseError(err);

        // Preserve offline cache ONLY for genuine network failures, and explicitly
        // mark it as unverified offline continuity (`isSessionVerified: false`).
        if (normalized.code === 'NETWORK_ERROR') {
          const cached = this.readCachedProfile(userId);
          if (cached && cached.is_active !== false) {
            this.commitState({
              user: cached,
              isSessionVerified: false,
              authError: null,
            });
            return { success: true, user: cached, isOfflineCache: true };
          }
          this.commitState({
            user: null,
            isSessionVerified: false,
            authError: normalized.message,
          });
          return { success: false, error: normalized.message };
        }

        // Invalid/expired JWT (401) or RLS authorization denial (403) MUST purge stale cache
        if (
          normalized.code === 'UNAUTHENTICATED' ||
          normalized.code === 'RLS_POLICY_VIOLATION'
        ) {
          this.writeCachedProfile(null);
          this.commitState({
            user: null,
            isSessionVerified: false,
            authError: normalized.message,
          });
          await this.deps.signOut().catch(() => undefined);
          return { success: false, error: normalized.message };
        }

        // Any other unexpected failure fails closed without trusting stale cache
        this.commitState({
          user: null,
          isSessionVerified: false,
          authError: normalized.message,
        });
        return { success: false, error: normalized.message };
      } finally {
        if (this.inFlightHydration?.seq === requestSeq) {
          this.inFlightHydration = null;
        }
      }
    })();

    this.inFlightHydration = { userId, seq: requestSeq, promise };
    return promise;
  }
}
