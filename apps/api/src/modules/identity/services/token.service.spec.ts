import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../../infra/config/app-config.js';
import { TokenService } from './token.service.js';

const config = {
  jwtAccessSecret: 'unit-test-secret-at-least-16',
  jwtAccessTtl: '15m',
  jwtAccessTtlMs: 15 * 60 * 1000,
  refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
} as AppConfig;

function makeService(): TokenService {
  return new TokenService(new JwtService({ secret: config.jwtAccessSecret }), config);
}

describe('TokenService', () => {
  it('signs and verifies the minimal claim set (sub/sid/mem/ten/rol)', () => {
    const service = makeService();
    const token = service.signAccessToken({
      userId: 'user-1',
      sessionId: 'session-1',
      membershipId: 'membership-1',
      tenantId: 'tenant-1',
      role: 'professor',
    });
    const claims = service.verifyAccessToken(token);
    expect(claims).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
      mem: 'membership-1',
      ten: 'tenant-1',
      rol: 'professor',
    });
    expect(claims.imp).toBeUndefined();
    expect(claims.act).toBeUndefined();
    // Never in the payload: email, hashes, permission toggles.
    expect(Object.keys(claims)).not.toEqual(
      expect.arrayContaining(['email', 'permissions', 'secretHash']),
    );
  });

  it('marks impersonated tokens with imp + RFC 8693 actor claim', () => {
    const service = makeService();
    const token = service.signAccessToken({
      userId: 'support-1',
      sessionId: 'session-2',
      membershipId: null,
      tenantId: 'tenant-9',
      role: 'admin',
      impersonatorUserId: 'support-1',
    });
    const claims = service.verifyAccessToken(token);
    expect(claims.imp).toBe(true);
    expect(claims.act).toEqual({ sub: 'support-1' });
    expect(claims.ten).toBe('tenant-9');
    expect(claims.rol).toBe('admin');
  });

  it('rejects a challenge token used as an access token (audience split)', () => {
    const service = makeService();
    const challenge = service.signChallengeToken('user-1');
    expect(() => service.verifyAccessToken(challenge)).toThrow();
    expect(service.verifyChallengeToken(challenge)).toBe('user-1');
  });

  it('rejects an access token on the challenge endpoint', () => {
    const service = makeService();
    const access = service.signAccessToken({
      userId: 'user-1',
      sessionId: 's',
      membershipId: null,
      tenantId: null,
      role: 'owner',
    });
    expect(service.verifyChallengeToken(access)).toBeNull();
  });

  it('hashes refresh tokens as sha256 hex (the DB seam contract)', () => {
    const service = makeService();
    const raw = service.generateRefreshToken();
    expect(raw.length).toBeGreaterThanOrEqual(40); // 256-bit base64url
    expect(service.hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(service.hashToken(raw)).toBe(service.hashToken(raw));
  });
});
