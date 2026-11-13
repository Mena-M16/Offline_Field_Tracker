import type { NextFunction, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toApiErrorPayload } from '../../lib/databaseErrors';
import { SupabaseProfileRepository } from '../../repositories/supabaseProfileRepository';
import type { UserProfile, UserRole } from '../../types';
import type { Database } from '../../types/supabase';
import { hasServerSupabaseConfig } from '../env';
import {
  createSupabaseUserClient,
  getSupabaseServerAnonClient,
} from '../supabase';

/**
 * Express JWT Authentication & RBAC Middleware
 *
 * Security invariants:
 * - Verifies incoming `Authorization: Bearer <jwt>` cryptographically via Supabase Auth.
 * - Loads authoritative `role` and `is_active` from PostgreSQL `public.profiles`
 *   using a request-scoped RLS client (`createSupabaseUserClient(token)`).
 * - Never trusts client-supplied roles, headers, or unverified JWT metadata.
 */

export interface VerifiedAuthContext {
  userId: string;
  email: string;
  role: UserRole;
  profile: UserProfile;
  accessToken: string;
  supabase: SupabaseClient<Database>;
}

export interface AuthenticatedRequest extends Request {
  auth?: VerifiedAuthContext;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match && match[1].trim().length > 0 ? match[1].trim() : null;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!hasServerSupabaseConfig()) {
    res.status(503).json({
      success: false,
      error: {
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Supabase authentication is not configured on the server.',
        details: [],
      },
    });
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or malformed Authorization Bearer token.',
        details: [],
      },
    });
    return;
  }

  try {
    const anonClient = getSupabaseServerAnonClient();
    const { data: userData, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !userData.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Invalid or expired authentication session.',
          details: [],
        },
      });
      return;
    }

    const userClient = createSupabaseUserClient(token);
    const profileRepo = new SupabaseProfileRepository(userClient);
    const profile = await profileRepo.getById(userData.user.id);

    if (!profile) {
      res.status(403).json({
        success: false,
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'User profile does not exist or is not accessible.',
          details: [],
        },
      });
      return;
    }

    if (profile.is_active === false) {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Your account has been deactivated. Contact a system administrator.',
          details: [],
        },
      });
      return;
    }

    req.auth = {
      userId: profile.id,
      email: profile.email,
      role: profile.role,
      profile,
      accessToken: token,
      supabase: userClient,
    };

    next();
  } catch (err) {
    const apiErr = toApiErrorPayload(err);
    res.status(apiErr.status).json(apiErr.body);
  }
}

export function requireCoordinator(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication is required.',
        details: [],
      },
    });
    return;
  }

  if (req.auth.role !== 'coordinator') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_COORDINATOR_ONLY',
        message: 'Coordinator privileges are required to perform this action.',
        details: [],
      },
    });
    return;
  }

  next();
}
