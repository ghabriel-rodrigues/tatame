import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { academies, users, withTenant, type DbHandle } from '@tatame/db';
import { eq } from 'drizzle-orm';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { AuthContext } from '../../../common/auth-context.js';
import type { AnyRoleName } from '../../../common/decorators.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { themeFromColumns, type BrandTheme } from '../lib/brand.js';
import { MembershipService, type MembershipView } from './membership.service.js';
import { PasswordService } from './password.service.js';
import { PermissionsService } from './permissions.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import { TotpService } from './totp.service.js';

interface LoginLookupRow {
  user_id: string;
  email: string;
  full_name: string;
  user_status: 'active' | 'disabled';
  credential_id: string;
  secret_hash: string;
  password_changed_at: string | Date | null;
}

export interface IssuedTokens {
  accessToken: string;
  /** Seconds — mirrors the JWT exp for clients that avoid decoding. */
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthenticatedPayload {
  user: { id: string; email: string; fullName: string };
  memberships: MembershipView[];
  activeMembershipId: string;
  tokens: IssuedTokens;
}

export type LoginResult =
  | { kind: 'authenticated'; payload: AuthenticatedPayload }
  | { kind: 'mfa_required'; challengeToken: string };

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Authentication flows (ticket 02): login with membership resolution and the
 * platform TOTP challenge path, refresh rotation with family-reuse
 * revocation, membership switch, logout(-all) and the `/me` bootstrap.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly memberships: MembershipService,
    private readonly permissions: PermissionsService,
    private readonly totp: TotpService,
  ) {}

  private async issueForMembership(
    userId: string,
    membership: MembershipView,
    meta: RequestMeta,
  ): Promise<IssuedTokens> {
    const minted = await this.sessions.mint({
      userId,
      membershipId: membership.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    const accessToken = this.tokens.signAccessToken({
      userId,
      sessionId: minted.sessionId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      role: membership.role,
    });
    return {
      accessToken,
      accessExpiresIn: Math.floor(this.tokens.accessTtlMs / 1000),
      refreshToken: minted.refreshToken,
      refreshExpiresAt: minted.sessionExpiresAt,
    };
  }

  /** Shared login tail (password login, TOTP completion, invite accept). */
  async establishSession(
    user: { id: string; email: string; fullName: string },
    meta: RequestMeta,
    preferredMembershipId?: string,
  ): Promise<AuthenticatedPayload> {
    const memberships = await this.memberships.listAll(user.id);
    const active = preferredMembershipId
      ? (memberships.find((m) => m.id === preferredMembershipId) ?? null)
      : await this.memberships.resolveActive(user.id, memberships);
    if (!active) {
      throw problem(403, ErrorCodes.AUTHZ_FORBIDDEN_ROLE, 'Account has no active membership');
    }
    const tokens = await this.issueForMembership(user.id, active, meta);
    return { user, memberships, activeMembershipId: active.id, tokens };
  }

  async login(email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    const result = await this.appDb.db.execute(sql`SELECT * FROM auth_login_lookup(${email})`);
    const row = result.rows[0] as unknown as LoginLookupRow | undefined;

    if (!row) {
      // Same-shaped work whether or not the email exists (no enumeration).
      await this.passwords.verifyDummy(password);
      throw problem(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
    }
    const valid = await this.passwords.verify(row.secret_hash, password);
    if (!valid || row.user_status !== 'active') {
      throw problem(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const platformProfile = await this.memberships.getPlatformProfile(row.user_id);
    if (platformProfile?.totpEnabled) {
      return { kind: 'mfa_required', challengeToken: this.tokens.signChallengeToken(row.user_id) };
    }

    const payload = await this.establishSession(
      { id: row.user_id, email: row.email, fullName: row.full_name },
      meta,
    );
    return { kind: 'authenticated', payload };
  }

  async completeTotpLogin(
    challengeToken: string,
    code: string,
    meta: RequestMeta,
  ): Promise<AuthenticatedPayload> {
    const userId = this.tokens.verifyChallengeToken(challengeToken);
    if (!userId) {
      throw problem(401, ErrorCodes.AUTH_MFA_REQUIRED, 'Invalid or expired challenge token');
    }
    const profile = await this.memberships.getPlatformProfile(userId);
    if (!profile?.totpEnabled) {
      throw problem(401, ErrorCodes.AUTH_MFA_REQUIRED, 'No TOTP challenge pending for this account');
    }
    const ok = await this.totp.verifyLoginCode(userId, profile, code);
    if (!ok) {
      throw problem(401, ErrorCodes.AUTH_MFA_INVALID_CODE, 'Invalid TOTP code');
    }

    const userRows = await withTenant(this.appDb.db, { userId }, (tx) =>
      tx
        .select({ id: users.id, email: users.email, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, userId)),
    );
    const user = userRows[0];
    if (!user) throw problem(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Account not found');
    return this.establishSession(user, meta);
  }

  async refresh(rawRefreshToken: string): Promise<IssuedTokens> {
    const rotation = await this.sessions.rotate(rawRefreshToken);

    if (rotation.status === 'reused') {
      throw problem(
        401,
        ErrorCodes.AUTH_REFRESH_REUSED,
        'Refresh token reuse detected — session revoked',
      );
    }
    if (rotation.status !== 'rotated' || !rotation.userId || !rotation.sessionId) {
      throw problem(401, ErrorCodes.AUTH_TOKEN_EXPIRED, 'Refresh token is no longer valid');
    }

    let claims: { membershipId: string | null; tenantId: string | null; role: AnyRoleName };
    if (rotation.impersonatedTenantId) {
      claims = { membershipId: null, tenantId: rotation.impersonatedTenantId, role: 'admin' };
    } else {
      const memberships = await this.memberships.listAll(rotation.userId);
      const active = memberships.find((m) => m.id === rotation.membershipId);
      if (!active) {
        await this.sessions.revoke(rotation.userId, rotation.sessionId, 'membership_gone');
        throw problem(401, ErrorCodes.AUTH_TOKEN_EXPIRED, 'Active membership no longer exists');
      }
      claims = { membershipId: active.id, tenantId: active.tenantId, role: active.role };
    }

    const accessToken = this.tokens.signAccessToken({
      userId: rotation.userId,
      sessionId: rotation.sessionId,
      membershipId: claims.membershipId,
      tenantId: claims.tenantId,
      role: claims.role,
      impersonatorUserId: rotation.impersonatorUserId,
    });
    return {
      accessToken,
      accessExpiresIn: Math.floor(this.tokens.accessTtlMs / 1000),
      refreshToken: rotation.refreshToken as string,
      refreshExpiresAt: rotation.sessionExpiresAt ?? new Date(Date.now() + this.tokens.refreshTtlMs),
    };
  }

  /** Re-issues the access token for another owned membership, same session. */
  async switchMembership(
    ctx: AuthContext,
    membershipId: string,
  ): Promise<{ accessToken: string; accessExpiresIn: number; activeMembershipId: string }> {
    const memberships = await this.memberships.listAll(ctx.userId);
    const target = memberships.find((m) => m.id === membershipId);
    if (!target) {
      throw problem(403, ErrorCodes.AUTHZ_FORBIDDEN_ROLE, 'Membership does not belong to this account');
    }
    await this.memberships.switchSessionMembership(ctx.userId, ctx.sessionId, target.id);
    const accessToken = this.tokens.signAccessToken({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      membershipId: target.id,
      tenantId: target.tenantId,
      role: target.role,
    });
    return {
      accessToken,
      accessExpiresIn: Math.floor(this.tokens.accessTtlMs / 1000),
      activeMembershipId: target.id,
    };
  }

  async logout(ctx: AuthContext): Promise<void> {
    await this.sessions.revoke(ctx.userId, ctx.sessionId, 'logout');
  }

  async logoutAll(ctx: AuthContext): Promise<void> {
    await this.sessions.revokeAll(ctx.userId, 'logout_all');
  }

  /** Session bootstrap: clients render from this, never decode the JWT. */
  async me(ctx: AuthContext) {
    const userRows = await withTenant(this.appDb.db, { userId: ctx.userId }, (tx) =>
      tx
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          avatarUrl: users.avatarUrl,
          locale: users.locale,
        })
        .from(users)
        .where(eq(users.id, ctx.userId)),
    );
    const user = userRows[0];
    if (!user) throw problem(401, ErrorCodes.AUTH_TOKEN_EXPIRED, 'Account no longer exists');

    const memberships = await this.memberships.listAll(ctx.userId);

    let academy: {
      id: string;
      name: string;
      slug: string;
      status: string;
      logoUrl: string | null;
      /** Typed white-label brand from the three columns (spec 011, CFG.3). */
      theme: BrandTheme | null;
    } | null = null;
    if (ctx.tenantId) {
      const academyRows = await withTenant(this.appDb.db, ctx.tenantId, (tx) =>
        tx
          .select({
            id: academies.id,
            name: academies.name,
            slug: academies.slug,
            status: academies.status,
            logoUrl: academies.logoUrl,
            brandDeep: academies.brandDeep,
            brandVibrant: academies.brandVibrant,
            brandAccent: academies.brandAccent,
          })
          .from(academies)
          .where(eq(academies.id, ctx.tenantId as string)),
      );
      const row = academyRows[0];
      academy = row
        ? {
            id: row.id,
            name: row.name,
            slug: row.slug,
            status: row.status,
            logoUrl: row.logoUrl,
            theme: themeFromColumns(row.brandDeep, row.brandVibrant, row.brandAccent),
          }
        : null;
    }

    const permissions =
      ctx.tenantId && !ctx.isImpersonated
        ? await this.permissions.resolveForRole(ctx.tenantId, ctx.role)
        : ctx.tenantId
          ? await this.permissions.resolveForRole(ctx.tenantId, 'admin')
          : {};

    return {
      user,
      memberships,
      activeMembershipId: ctx.membershipId,
      activeRole: ctx.role,
      academy,
      permissions,
      impersonation: ctx.isImpersonated
        ? { isImpersonated: true as const, impersonatorUserId: ctx.impersonatorUserId }
        : { isImpersonated: false as const },
    };
  }
}
