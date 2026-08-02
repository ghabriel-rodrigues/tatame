/**
 * Contract-typed test fixtures (web-07). Mirrors the dev seed personas
 * (`packages/db/src/seed/dev.ts`) so component tests and e2e read alike.
 */
import type {
  AuthSessionResponse,
  InviteLandingResponse,
  MeAcademy,
  MeResponse,
  MembershipView,
} from '../types.js';

export const FIXTURE_ACADEMY: MeAcademy = {
  id: '018f0000-0000-7000-8000-00000000a1fa',
  name: 'Alpha Jiu-Jitsu',
  slug: 'alpha-jj',
  status: 'active',
  logoUrl: null,
  theme: { deep: '#0B1F3A', vibrant: '#1E66F5', accent: '#F5A623' },
};

export const FIXTURE_ACADEMY_BRAVO: MeAcademy = {
  id: '018f0000-0000-7000-8000-00000000b2af',
  name: 'Bravo BJJ Team',
  slug: 'bravo-bjj',
  status: 'trial',
  logoUrl: null,
  theme: { deep: '#1A1A2E', vibrant: '#E94560', accent: '#0F3460' },
};

let membershipCounter = 0;

export function makeMembership(overrides: Partial<MembershipView> = {}): MembershipView {
  membershipCounter += 1;
  return {
    id: `018f0000-0000-7000-8000-${membershipCounter.toString(16).padStart(12, '0')}`,
    type: 'academy',
    role: 'admin',
    tenantId: FIXTURE_ACADEMY.id,
    academyName: FIXTURE_ACADEMY.name,
    academySlug: FIXTURE_ACADEMY.slug,
    academyStatus: FIXTURE_ACADEMY.status,
    status: 'active',
    ...overrides,
  };
}

export function makePlatformMembership(
  overrides: Partial<MembershipView> = {},
): MembershipView {
  return makeMembership({
    type: 'platform',
    role: 'owner',
    tenantId: null,
    academyName: null,
    academySlug: null,
    academyStatus: null,
    ...overrides,
  });
}

export interface SessionFixtureOptions {
  memberships?: MembershipView[];
  activeMembershipId?: string;
  user?: Partial<AuthSessionResponse['user']>;
}

export function makeAuthSession(options: SessionFixtureOptions = {}): AuthSessionResponse {
  const memberships = options.memberships ?? [makeMembership()];
  const first = memberships[0];
  if (!first) throw new Error('makeAuthSession needs at least one membership');
  return {
    user: {
      id: '018f0000-0000-7000-8000-0000000000ad',
      email: 'admin@tatame.dev',
      fullName: 'Amanda Admin',
      ...options.user,
    },
    memberships,
    activeMembershipId: options.activeMembershipId ?? first.id,
    accessToken: 'test-access-token',
    accessExpiresIn: 900,
  };
}

export interface MeFixtureOptions {
  memberships?: MembershipView[];
  activeMembershipId?: string | null;
  activeRole?: MeResponse['activeRole'];
  academy?: MeAcademy | null;
  impersonated?: boolean;
  user?: Partial<MeResponse['user']>;
  permissions?: Record<string, boolean>;
}

export function makeMeResponse(options: MeFixtureOptions = {}): MeResponse {
  const memberships = options.memberships ?? [makeMembership()];
  const active =
    options.activeMembershipId !== undefined
      ? options.activeMembershipId
      : (memberships[0]?.id ?? null);
  const activeMembership = memberships.find((m) => m.id === active);
  return {
    user: {
      id: '018f0000-0000-7000-8000-0000000000ad',
      email: 'admin@tatame.dev',
      fullName: 'Amanda Admin',
      phone: null,
      avatarUrl: null,
      locale: 'pt-BR',
      ...options.user,
    },
    memberships,
    activeMembershipId: options.impersonated ? null : active,
    activeRole: options.activeRole ?? activeMembership?.role ?? 'admin',
    academy:
      options.academy !== undefined
        ? options.academy
        : activeMembership?.type === 'academy' || options.impersonated
          ? FIXTURE_ACADEMY
          : null,
    permissions: options.permissions ?? {},
    impersonation: options.impersonated
      ? { isImpersonated: true, impersonatorUserId: '018f0000-0000-7000-8000-0000000000ow' }
      : { isImpersonated: false },
  };
}

export function makeInviteLanding(
  overrides: Partial<InviteLandingResponse> = {},
): InviteLandingResponse {
  return {
    kind: 'student',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    classId: '018f0000-0000-7000-8000-00000000c1a5',
    academyPlanId: null,
    academy: {
      name: FIXTURE_ACADEMY.name,
      slug: FIXTURE_ACADEMY.slug,
      logoUrl: null,
      theme: FIXTURE_ACADEMY.theme,
    },
    ...overrides,
  };
}
