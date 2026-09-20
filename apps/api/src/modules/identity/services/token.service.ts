import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  APP_CONFIG,
  type AppConfig,
} from '../../../infra/config/app-config.js';
import type { AnyRoleName } from '../../../common/decorators.js';

export const JWT_ISSUER = 'tatame';
export const JWT_AUDIENCE = 'tatame-clients';
const CHALLENGE_AUDIENCE = 'tatame-totp-challenge';
const CHALLENGE_TTL_SECONDS = 5 * 60;

/** Access-token claims (ticket 02) — minimal by design, RFC 8693 actor style. */
export interface AccessTokenClaims {
  sub: string;
  sid: string;
  mem: string | null;
  ten: string | null;
  rol: AnyRoleName;
  imp?: true;
  act?: { sub: string };
}

export interface SessionClaimsInput {
  userId: string;
  sessionId: string;
  membershipId: string | null;
  tenantId: string | null;
  role: AnyRoleName;
  impersonatorUserId?: string | null;
}

/**
 * Token minting/verification. Access: HS256 JWT, 15 min, in-memory on clients.
 * Refresh: opaque 256-bit random, sha256 hex hash stored server-side (the
 * exact contract of the `auth_create_session_v2` / `auth_rotate_*` seams).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get accessTtlMs(): number {
    return this.config.jwtAccessTtlMs;
  }

  get refreshTtlMs(): number {
    return this.config.refreshTtlMs;
  }

  signAccessToken(input: SessionClaimsInput): string {
    const claims: AccessTokenClaims = {
      sub: input.userId,
      sid: input.sessionId,
      mem: input.membershipId,
      ten: input.tenantId,
      rol: input.role,
      ...(input.impersonatorUserId
        ? { imp: true as const, act: { sub: input.impersonatorUserId } }
        : {}),
    };
    return this.jwt.sign(claims, {
      expiresIn: Math.floor(this.config.jwtAccessTtlMs / 1000),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    return this.jwt.verify<AccessTokenClaims>(token, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  /** Raw opaque refresh token — returned to the client, never stored. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** sha256 hex — the only form persisted (high entropy, fast hash is fine). */
  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Short-lived TOTP challenge (login step-up for platform staff). */
  signChallengeToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId, purpose: 'totp' },
      {
        expiresIn: CHALLENGE_TTL_SECONDS,
        issuer: JWT_ISSUER,
        audience: CHALLENGE_AUDIENCE,
      },
    );
  }

  /** Returns the userId or null when invalid/expired/wrong-purpose. */
  verifyChallengeToken(token: string): string | null {
    try {
      const claims = this.jwt.verify<{ sub: string; purpose?: string }>(token, {
        issuer: JWT_ISSUER,
        audience: CHALLENGE_AUDIENCE,
      });
      return claims.purpose === 'totp' ? claims.sub : null;
    } catch {
      return null;
    }
  }
}
