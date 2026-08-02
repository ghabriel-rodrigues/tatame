/**
 * Post-login redirect rule (web-04 priority order) — pure-logic unit tests
 * (web-07 pyramid tier 2).
 */
import { makeMembership, makePlatformMembership } from '@tatame/shared/testing';
import { isValidNextPath, resolvePostLogin } from './redirect';

const adminAlpha = () => makeMembership({ role: 'admin', academyName: 'Alpha Jiu-Jitsu' });
const adminBravo = () =>
  makeMembership({ role: 'admin', academyName: 'Bravo BJJ Team', tenantId: 'tenant-bravo' });
const student = () => makeMembership({ role: 'student' });
const platform = () => makePlatformMembership();

describe('isValidNextPath', () => {
  it('accepts /admin paths only with an admin membership', () => {
    expect(isValidNextPath('/admin/financeiro', [adminAlpha()])).toBe(true);
    expect(isValidNextPath('/admin/financeiro', [student()])).toBe(false);
  });

  it('accepts /plataforma paths only with a platform membership', () => {
    expect(isValidNextPath('/plataforma', [platform()])).toBe(true);
    expect(isValidNextPath('/plataforma', [adminAlpha()])).toBe(false);
  });

  it('accepts invite paths for any session and rejects external/absolute URLs', () => {
    expect(isValidNextPath('/convite/abc123', [student()])).toBe(true);
    expect(isValidNextPath('//evil.example', [adminAlpha()])).toBe(false);
    expect(isValidNextPath('https://evil.example', [adminAlpha()])).toBe(false);
    expect(isValidNextPath('/qualquer-coisa', [adminAlpha()])).toBe(false);
  });
});

describe('resolvePostLogin', () => {
  it('1: honors a validated ?next= above everything else', () => {
    const admin = adminAlpha();
    const resolution = resolvePostLogin({
      memberships: [admin, platform()],
      activeMembershipId: admin.id,
      next: '/admin/eventos',
      lastSurface: '/plataforma',
    });
    expect(resolution).toEqual({ kind: 'navigate', to: '/admin/eventos' });
  });

  it('1: ignores an invalid ?next= (wrong persona)', () => {
    const p = platform();
    const resolution = resolvePostLogin({
      memberships: [p],
      activeMembershipId: p.id,
      next: '/admin',
      lastSurface: null,
    });
    expect(resolution).toEqual({ kind: 'navigate', to: '/plataforma' });
  });

  it('2: last-used surface wins over plataforma priority', () => {
    const admin = adminAlpha();
    const resolution = resolvePostLogin({
      memberships: [admin, platform()],
      activeMembershipId: admin.id,
      lastSurface: '/admin',
    });
    expect(resolution).toEqual({ kind: 'navigate', to: '/admin' });
  });

  it('2: stale last-used surface no longer in memberships is ignored', () => {
    const admin = adminAlpha();
    const resolution = resolvePostLogin({
      memberships: [admin],
      activeMembershipId: admin.id,
      lastSurface: '/plataforma',
    });
    expect(resolution).toEqual({ kind: 'navigate', to: '/admin' });
  });

  it('3: single membership goes to its surface', () => {
    const admin = adminAlpha();
    expect(
      resolvePostLogin({ memberships: [admin], activeMembershipId: admin.id }),
    ).toEqual({ kind: 'navigate', to: '/admin' });

    const s = student();
    expect(resolvePostLogin({ memberships: [s], activeMembershipId: s.id })).toEqual({
      kind: 'navigate',
      to: '/baixe-o-app',
    });
  });

  it('4: admin + plataforma defaults to /plataforma (governed impersonation path)', () => {
    const admin = adminAlpha();
    const p = platform();
    const resolution = resolvePostLogin({
      memberships: [admin, p],
      activeMembershipId: admin.id,
    });
    expect(resolution).toEqual({
      kind: 'navigate',
      to: '/plataforma',
      switchToMembershipId: p.id,
    });
  });

  it('switches to the only admin membership when another membership is active', () => {
    const s = student();
    const admin = adminAlpha();
    const resolution = resolvePostLogin({
      memberships: [s, admin],
      activeMembershipId: s.id,
    });
    expect(resolution).toEqual({
      kind: 'navigate',
      to: '/admin',
      switchToMembershipId: admin.id,
    });
  });

  it('offers the chooser when several admin academies are possible', () => {
    const s = student();
    const a = adminAlpha();
    const b = adminBravo();
    const resolution = resolvePostLogin({
      memberships: [s, a, b],
      activeMembershipId: s.id,
    });
    expect(resolution).toEqual({ kind: 'choose', options: [a, b] });
  });

  it('5: mobile-only personas land on /baixe-o-app', () => {
    const s = student();
    const g = makeMembership({ role: 'guardian' });
    const resolution = resolvePostLogin({
      memberships: [s, g],
      activeMembershipId: s.id,
    });
    expect(resolution).toEqual({ kind: 'navigate', to: '/baixe-o-app' });
  });
});
