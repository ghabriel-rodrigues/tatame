import type { ClsService } from 'nestjs-cls';
import type { AnyRoleName } from './decorators.js';

/**
 * Request-scoped identity context, populated by JwtAuthGuard from the VERIFIED
 * access token into CLS (AsyncLocalStorage). Single source for guards,
 * services and the tenant-scoped database wrapper — handlers never pass
 * `academyId` by hand.
 */
export interface AuthContext {
  userId: string;
  sessionId: string;
  /** Academy membership id, platform_users id, or null (impersonation). */
  membershipId: string | null;
  /** Active academy (tenant) — null for platform personas. */
  tenantId: string | null;
  role: AnyRoleName;
  /** Set when this is an impersonated ("entrar como admin") session. */
  impersonatorUserId: string | null;
  isImpersonated: boolean;
}

export const AUTH_CONTEXT_KEY = 'tatame:authContext';

export function setAuthContext(cls: ClsService, ctx: AuthContext): void {
  cls.set(AUTH_CONTEXT_KEY, ctx);
}

export function getAuthContext(cls: ClsService): AuthContext | undefined {
  return cls.get(AUTH_CONTEXT_KEY);
}

/** Throws if called outside an authenticated request — programmer error. */
export function requireAuthContext(cls: ClsService): AuthContext {
  const ctx = getAuthContext(cls);
  if (!ctx) {
    throw new Error(
      'AuthContext missing — handler reached without JwtAuthGuard',
    );
  }
  return ctx;
}
