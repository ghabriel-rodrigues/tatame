import { SetMetadata } from '@nestjs/common';

/** Academy (per-tenant) roles — English names; PT-BR labels are client copy. */
export const ACADEMY_ROLES = ['student', 'professor', 'admin', 'guardian'] as const;
/** Platform (SaaS owner) roles — memberships with `ten: null`. */
export const PLATFORM_ROLES = ['owner', 'support', 'finance'] as const;

export type AcademyRole = (typeof ACADEMY_ROLES)[number];
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type AnyRoleName = AcademyRole | PlatformRole;

export const PUBLIC_KEY = 'tatame:public';
export const ROLES_KEY = 'tatame:roles';
export const ANY_ROLE_KEY = 'tatame:anyRole';
export const PERMISSION_KEY = 'tatame:permission';
export const BYPASS_READ_ONLY_KEY = 'tatame:bypassReadOnly';
export const ALLOW_SUSPENDED_KEY = 'tatame:allowSuspended';
export const DENY_IMPERSONATED_KEY = 'tatame:denyImpersonated';

/** No authentication: login/refresh/reset/invite landing+accept, webhooks. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Explicit role allow-list. Class-level = persona surface; handler overrides. */
export const Roles = (...roles: AnyRoleName[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Open to any *authenticated* user (me/switch/logout). Default-deny demands an
 * explicit stance on every route — this is the explicit "any" stance.
 */
export const AnyRole = () => SetMetadata(ANY_ROLE_KEY, true);

/** Toggleable-permission gate (ticket 03 registry key, e.g. `invites.create`). */
export const RequiresPermission = (key: string) => SetMetadata(PERMISSION_KEY, key);

/** Delinquent (read-only) academies may still hit this mutation (payments). */
export const BypassReadOnly = () => SetMetadata(BYPASS_READ_ONLY_KEY, true);

/** Suspended academies may still hit this route (bootstrap + logout only). */
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED_KEY, true);

/**
 * Rejected for impersonated tokens (`imp: true`): switch, TOTP, logout-all,
 * impersonation chaining and authenticated invite accept.
 */
export const DenyImpersonated = () => SetMetadata(DENY_IMPERSONATED_KEY, true);
