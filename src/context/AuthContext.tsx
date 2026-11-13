import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiClient } from '../api/client';
import { getFrontendEnvStatus } from '../config/env';
import { normalizeDatabaseError } from '../lib/databaseErrors';
import { getSupabaseClient } from '../lib/supabaseClient';
import { SupabaseProfileRepository } from '../repositories/supabaseProfileRepository';
import type { UserProfile, UserRole } from '../types';
import {
  AuthSessionController,
  CACHED_SUPABASE_PROFILE_KEY,
  type AuthActionResult,
} from './authSessionController';

export type { AuthActionResult };

export const DEMO_WORKER: UserProfile = {
  id: 'worker-samuel-id',
  email: 'samuel.kiprop@fieldops.org',
  full_name: 'Samuel Kiprop',
  phone_number: '+254 712 345 678',
  role: 'field_worker',
  organization: 'Rural Water & Sanitation Board',
  avatar_url: '/src/assets/images/avatar_worker_samuel_1794502060103.jpg',
};

export const DEMO_COORDINATOR: UserProfile = {
  id: 'coord-elena-id',
  email: 'elena.morales@dispatch.org',
  full_name: 'Elena Morales',
  phone_number: '+254 798 654 321',
  role: 'coordinator',
  organization: 'Central Infrastructure Dispatch Center',
  avatar_url: '/src/assets/images/avatar_coord_elena_1794502060557.jpg',
};

const DEMO_USER_STORAGE_KEY = 'field_track_user';

export interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isSupabaseAuth: boolean;
  isDemoMode: boolean;
  isConfigError: boolean;
  isSessionVerified: boolean;
  isLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  login: (email: string, password: string, demoRoleHint?: UserRole) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  register: (
    fullName: string,
    email: string,
    phone: string | undefined,
    password: string
  ) => Promise<AuthActionResult>;
  switchRole: (role: UserRole) => void;
  updateProfile: (
    updates: Partial<Pick<UserProfile, 'full_name' | 'phone_number'>>
  ) => Promise<AuthActionResult>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const envStatus = getFrontendEnvStatus();
  const isSupabaseAuth = envStatus.mode === 'supabase';
  const isDemoMode = envStatus.mode === 'demo';
  const isConfigError = envStatus.mode === 'misconfigured';
  const configErrorMessage = isConfigError
    ? `Supabase configuration is invalid: ${envStatus.validationErrors.join('; ')}`
    : null;

  const [user, setUser] = useState<UserProfile | null>(() => {
    if (!isDemoMode) {
      // Never initialize from cached profile in Supabase or misconfigured mode
      // before validating the current session.
      return null;
    }
    const saved = localStorage.getItem(DEMO_USER_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved) as UserProfile;
      } catch {
        // ignore invalid cache
      }
    }
    return DEMO_WORKER;
  });

  const [isSessionVerified, setIsSessionVerified] = useState<boolean>(isDemoMode);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseAuth);
  const [authError, setAuthError] = useState<string | null>(configErrorMessage);
  const controllerRef = useRef<AuthSessionController | null>(null);

  const clearAuthError = useCallback(() => {
    if (configErrorMessage) {
      setAuthError(configErrorMessage);
      return;
    }
    controllerRef.current?.clearError();
    setAuthError(null);
  }, [configErrorMessage]);

  // Register dynamic Supabase Bearer token provider for Express API calls
  useEffect(() => {
    if (!isSupabaseAuth) {
      apiClient.setAccessTokenProvider(null);
      return;
    }

    apiClient.setAccessTokenProvider(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    });

    return () => {
      apiClient.setAccessTokenProvider(null);
    };
  }, [isSupabaseAuth]);

  // Manage Supabase Auth session lifecycle & single-flight/cancellable hydration
  useEffect(() => {
    if (!isSupabaseAuth) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setIsLoading(false);
      if (isConfigError) {
        setUser(null);
        setIsSessionVerified(false);
        setAuthError(configErrorMessage);
      }
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsLoading(false);
      setUser(null);
      setIsSessionVerified(false);
      return;
    }

    let mounted = true;
    const controller = new AuthSessionController({
      cacheKey: CACHED_SUPABASE_PROFILE_KEY,
      storage: window.localStorage,
      isOnline: () => navigator.onLine,
      getSession: async () => {
        const { data, error } = await supabase.auth.getSession();
        return {
          session: data.session
            ? {
                user: { id: data.session.user.id },
                access_token: data.session.access_token,
              }
            : null,
          error,
        };
      },
      fetchProfileById: async (userId: string) => {
        const profileRepo = new SupabaseProfileRepository(supabase);
        return profileRepo.getById(userId);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      onStateChange: (next) => {
        if (!mounted) return;
        setUser(next.user);
        setIsSessionVerified(next.isSessionVerified);
        setAuthError(next.authError);
      },
    });
    controllerRef.current = controller;

    const init = async () => {
      try {
        await controller.restoreInitialSession();
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void init();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'INITIAL_SESSION') {
        return;
      }

      if (event === 'SIGNED_OUT' || !session?.user) {
        localStorage.removeItem('field_track_jwt');
        controller.handleSignedOut({ preserveError: true });
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void controller.hydrateUser(session.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [isSupabaseAuth, isConfigError, configErrorMessage]);

  // Persist demo user ONLY in genuine demo mode
  useEffect(() => {
    if (!isDemoMode) return;
    if (user) {
      localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    }
  }, [isDemoMode, user]);

  const login = async (
    email: string,
    password: string,
    demoRoleHint?: UserRole
  ): Promise<AuthActionResult> => {
    if (isConfigError) {
      setAuthError(configErrorMessage);
      return { success: false, error: configErrorMessage || 'Supabase configuration error.' };
    }

    setAuthError(null);
    controllerRef.current?.clearError();

    if (isDemoMode) {
      if (
        demoRoleHint === 'coordinator' ||
        email.toLowerCase().includes('coord') ||
        email.toLowerCase().includes('elena')
      ) {
        setUser(DEMO_COORDINATOR);
        setIsSessionVerified(true);
        return { success: true, user: DEMO_COORDINATOR };
      }
      const nextWorker: UserProfile = {
        ...DEMO_WORKER,
        email: email || DEMO_WORKER.email,
      };
      setUser(nextWorker);
      setIsSessionVerified(true);
      return { success: true, user: nextWorker };
    }

    const supabase = getSupabaseClient();
    const controller = controllerRef.current;
    if (!supabase || !controller) {
      return { success: false, error: 'Supabase authentication is not configured.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.user) {
      const msg = error?.message || 'Invalid email or password.';
      setAuthError(msg);
      return { success: false, error: msg };
    }

    return controller.hydrateUser(data.user.id);
  };

  const logout = async (): Promise<void> => {
    if (!isConfigError) {
      setAuthError(null);
    }
    localStorage.removeItem('field_track_jwt');

    if (isSupabaseAuth) {
      controllerRef.current?.handleSignedOut({ preserveError: false });
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
      return;
    }

    setUser(null);
    setIsSessionVerified(false);
  };

  const register = async (
    fullName: string,
    email: string,
    phone: string | undefined,
    password: string
  ): Promise<AuthActionResult> => {
    if (isConfigError) {
      setAuthError(configErrorMessage);
      return { success: false, error: configErrorMessage || 'Supabase configuration error.' };
    }

    setAuthError(null);
    controllerRef.current?.clearError();

    if (isDemoMode) {
      const newUser: UserProfile = {
        id: crypto.randomUUID(),
        email: email.trim(),
        full_name: fullName.trim(),
        phone_number: phone?.trim() || undefined,
        role: 'field_worker',
        organization: 'Rural Public Infrastructure Services',
        avatar_url: DEMO_WORKER.avatar_url,
      };
      setUser(newUser);
      setIsSessionVerified(true);
      return { success: true, user: newUser };
    }

    const supabase = getSupabaseClient();
    const controller = controllerRef.current;
    if (!supabase || !controller) {
      return { success: false, error: 'Supabase authentication is not configured.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          ...(phone?.trim() ? { phone_number: phone.trim() } : {}),
        },
      },
    });

    if (error || !data.user) {
      const msg = error?.message || 'Unable to complete registration.';
      setAuthError(msg);
      return { success: false, error: msg };
    }

    if (!data.session) {
      return {
        success: true,
        requiresEmailConfirmation: true,
      };
    }

    return controller.hydrateUser(data.user.id);
  };

  const switchRole = (newRole: UserRole) => {
    if (!isDemoMode) {
      console.warn('[FieldTrack] Client role switching is disabled outside unconfigured demo mode.');
      return;
    }
    if (newRole === 'coordinator') {
      setUser(DEMO_COORDINATOR);
    } else {
      setUser(DEMO_WORKER);
    }
  };

  const updateProfile = async (
    updates: Partial<Pick<UserProfile, 'full_name' | 'phone_number'>>
  ): Promise<AuthActionResult> => {
    if (isConfigError) {
      return { success: false, error: configErrorMessage || 'Supabase configuration error.' };
    }

    if (!user) {
      return { success: false, error: 'No active user session.' };
    }

    if (isDemoMode) {
      const updated = { ...user, ...updates };
      setUser(updated);
      return { success: true, user: updated };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Supabase client is not configured.' };
    }

    try {
      const profileRepo = new SupabaseProfileRepository(supabase);
      const updated = await profileRepo.updateOwnProfile(user.id, updates);
      controllerRef.current?.writeCachedProfile(updated);
      setUser(updated);
      setIsSessionVerified(true);
      return { success: true, user: updated };
    } catch (err) {
      const normalized = normalizeDatabaseError(err);
      if (
        normalized.code === 'UNAUTHENTICATED' ||
        normalized.code === 'RLS_POLICY_VIOLATION'
      ) {
        controllerRef.current?.handleSignedOut({ preserveError: false });
        setAuthError(normalized.message);
        await supabase.auth.signOut().catch(() => undefined);
      }
      return { success: false, error: normalized.message };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? user.role : 'field_worker',
        isAuthenticated: !!user,
        isSupabaseAuth,
        isDemoMode,
        isConfigError,
        isSessionVerified,
        isLoading,
        authError,
        clearAuthError,
        login,
        logout,
        register,
        switchRole,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
