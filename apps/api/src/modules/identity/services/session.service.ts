import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { sessions, withTenant, type DbHandle } from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';
import { TokenService } from './token.service.js';

export interface MintedSession {
  sessionId: string;
  refreshToken: string;
  sessionExpiresAt: Date;
}

export interface RotationResult {
  status: 'rotated' | 'reused' | 'expired' | 'session_revoked' | 'not_found';
  sessionId: string | null;
  userId: string | null;
  membershipId: string | null;
  impersonatorUserId: string | null;
  impersonatedTenantId: string | null;
  sessionExpiresAt: Date | null;
  refreshToken: string | null;
}

/**
 * Session lifecycle over the SECURITY DEFINER seams: mint (login / invite
 * accept / impersonation), refresh rotation with mandatory family-reuse
 * revocation, and RLS-scoped self-revocation (logout / logout-all).
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly tokens: TokenService,
  ) {}

  async mint(input: {
    userId: string;
    membershipId: string | null;
    impersonatorUserId?: string | null;
    impersonatedTenantId?: string | null;
    /** Absolute cap override (impersonation: 1 h). Default: refresh TTL (30 d). */
    ttlMs?: number;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<MintedSession> {
    const refreshToken = this.tokens.generateRefreshToken();
    const ttl = input.ttlMs ?? this.tokens.refreshTtlMs;
    const expiresAt = new Date(Date.now() + ttl);

    const result = await this.appDb.db.execute(sql`
      SELECT * FROM auth_create_session_v2(
        ${input.userId}::uuid,
        ${input.membershipId}::uuid,
        ${input.impersonatorUserId ?? null}::uuid,
        ${input.impersonatedTenantId ?? null}::uuid,
        ${expiresAt.toISOString()}::timestamptz,
        ${input.ip ?? null}::inet,
        ${input.userAgent ?? null},
        ${this.tokens.hashToken(refreshToken)},
        ${expiresAt.toISOString()}::timestamptz
      )
    `);
    const row = result.rows[0] as { session_id: string } | undefined;
    if (!row) throw new Error('auth_create_session_v2 returned no row');
    return {
      sessionId: row.session_id,
      refreshToken,
      sessionExpiresAt: expiresAt,
    };
  }

  async rotate(rawRefreshToken: string): Promise<RotationResult> {
    const newToken = this.tokens.generateRefreshToken();
    const newExpires = new Date(Date.now() + this.tokens.refreshTtlMs);
    const result = await this.appDb.db.execute(sql`
      SELECT * FROM auth_rotate_refresh_token_v2(
        ${this.tokens.hashToken(rawRefreshToken)},
        ${this.tokens.hashToken(newToken)},
        ${newExpires.toISOString()}::timestamptz
      )
    `);
    const row = result.rows[0] as {
      status: RotationResult['status'];
      session_id: string | null;
      user_id: string | null;
      membership_id: string | null;
      impersonator_user_id: string | null;
      impersonated_tenant_id: string | null;
      session_expires_at: string | Date | null;
    };
    return {
      status: row.status,
      sessionId: row.session_id,
      userId: row.user_id,
      membershipId: row.membership_id,
      impersonatorUserId: row.impersonator_user_id,
      impersonatedTenantId: row.impersonated_tenant_id,
      sessionExpiresAt: row.session_expires_at
        ? new Date(row.session_expires_at)
        : null,
      refreshToken: row.status === 'rotated' ? newToken : null,
    };
  }

  /** Self-revocation via the sessions self-update RLS policy. */
  async revoke(
    userId: string,
    sessionId: string,
    reason: string,
  ): Promise<void> {
    await withTenant(this.appDb.db, { userId }, (tx) =>
      tx
        .update(sessions)
        .set({
          revokedAt: new Date(),
          revokedReason: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt))),
    );
  }

  /** Revokes ALL of the user's sessions (logout-all / stolen device). */
  async revokeAll(userId: string, reason: string): Promise<void> {
    await withTenant(this.appDb.db, { userId }, (tx) =>
      tx
        .update(sessions)
        .set({
          revokedAt: new Date(),
          revokedReason: reason,
          updatedAt: new Date(),
        })
        .where(isNull(sessions.revokedAt)),
    );
  }
}
