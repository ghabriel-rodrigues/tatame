/**
 * Post-login redirect rules (web-04, BOSS-ruled priority):
 *   1. validated `?next=` (same-app path the memberships allow)
 *   2. last-used surface from localStorage, if still in memberships
 *   3. single membership → its surface
 *   4. admin + plataforma both → `/plataforma` (impersonation is the governed
 *      path into academies)
 *   5. mobile-only personas → `/baixe-o-app`
 * Pure logic — unit-tested directly (web-07 pyramid tier 2).
 */
import type { MembershipView } from '@tatame/shared';

export const LAST_SURFACE_STORAGE_KEY = 'tatame.last-surface';

export type WebSurface = '/admin' | '/plataforma';

export type PostLoginResolution =
  | { kind: 'navigate'; to: string; switchToMembershipId?: string }
  | { kind: 'choose'; options: MembershipView[] };

export interface RedirectContext {
  memberships: MembershipView[];
  activeMembershipId: string | null;
  /** Raw `?next=` value, unvalidated. */
  next?: string | null;
  /** Persisted last surface (non-sensitive pref — localStorage is fine). */
  lastSurface?: string | null;
}

export function surfaceForMembership(membership: MembershipView): string {
  if (membership.type === 'platform') return '/plataforma';
  if (membership.role === 'admin') return '/admin';
  return '/baixe-o-app';
}

function adminMembershipsOf(memberships: MembershipView[]): MembershipView[] {
  return memberships.filter((m) => m.type === 'academy' && m.role === 'admin');
}

function platformMembershipOf(memberships: MembershipView[]): MembershipView | undefined {
  return memberships.find((m) => m.type === 'platform');
}

/** `?next=` must be a same-app path under a surface the user may enter. */
export function isValidNextPath(next: string, memberships: MembershipView[]): boolean {
  if (!next.startsWith('/') || next.startsWith('//')) return false;
  if (next.startsWith('/convite/')) return true;
  if (next === '/admin' || next.startsWith('/admin/')) {
    return adminMembershipsOf(memberships).length > 0;
  }
  if (next === '/plataforma' || next.startsWith('/plataforma/')) {
    return Boolean(platformMembershipOf(memberships));
  }
  return false;
}

function resolveAdminEntry(
  to: string,
  admins: MembershipView[],
  activeMembershipId: string | null,
): PostLoginResolution {
  const active = admins.find((m) => m.id === activeMembershipId);
  if (active) return { kind: 'navigate', to };
  if (admins.length === 1) {
    const only = admins[0];
    return { kind: 'navigate', to, switchToMembershipId: only.id };
  }
  return { kind: 'choose', options: admins };
}

function resolvePlatformEntry(
  to: string,
  platform: MembershipView,
  activeMembershipId: string | null,
): PostLoginResolution {
  if (platform.id === activeMembershipId) return { kind: 'navigate', to };
  return { kind: 'navigate', to, switchToMembershipId: platform.id };
}

export function resolvePostLogin(context: RedirectContext): PostLoginResolution {
  const { memberships, activeMembershipId } = context;
  const admins = adminMembershipsOf(memberships);
  const platform = platformMembershipOf(memberships);

  // 1. Validated ?next=
  if (context.next && isValidNextPath(context.next, memberships)) {
    const next = context.next;
    if (next.startsWith('/plataforma') && platform) {
      return resolvePlatformEntry(next, platform, activeMembershipId);
    }
    if (next.startsWith('/admin')) {
      return resolveAdminEntry(next, admins, activeMembershipId);
    }
    return { kind: 'navigate', to: next };
  }

  // 2. Last-used surface, if the memberships still allow it.
  if (context.lastSurface === '/plataforma' && platform) {
    return resolvePlatformEntry('/plataforma', platform, activeMembershipId);
  }
  if (context.lastSurface === '/admin' && admins.length > 0) {
    return resolveAdminEntry('/admin', admins, activeMembershipId);
  }

  // 3. Single membership → its surface.
  if (memberships.length === 1) {
    const only = memberships[0];
    return { kind: 'navigate', to: surfaceForMembership(only) };
  }

  // 4. Plataforma priority (BOSS: platform staff reach academies via audited
  //    impersonation, never un-audited direct admin entry).
  if (platform) return resolvePlatformEntry('/plataforma', platform, activeMembershipId);

  if (admins.length > 0) return resolveAdminEntry('/admin', admins, activeMembershipId);

  // 5. Mobile-only personas: valid credentials, no web surface.
  return { kind: 'navigate', to: '/baixe-o-app' };
}

export function readLastSurface(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_SURFACE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLastSurface(surface: WebSurface): void {
  try {
    globalThis.localStorage?.setItem(LAST_SURFACE_STORAGE_KEY, surface);
  } catch {
    // Storage unavailable (private mode) — the pref is best-effort only.
  }
}
