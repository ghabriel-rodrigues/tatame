import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { invites, withTenant, type DbHandle } from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { AuthService, type AuthenticatedPayload, type RequestMeta } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (charter rule)

export interface InviteLanding {
  kind: 'student' | 'guardian';
  expiresAt: Date;
  classId: string | null;
  academyPlanId: string | null;
  academy: {
    name: string;
    slug: string;
    logoUrl: string | null;
    theme: unknown;
  };
}

export interface PublicAcceptInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  birthDate?: string;
  /** Guardian variant: children registered with the same flow (enrollment slice consumes). */
  dependents?: Array<{ fullName: string; birthDate: string }>;
}

interface LandingRow {
  status: 'valid' | 'not_found' | 'revoked' | 'expired' | 'exhausted';
  invite_id: string;
  tenant_id: string;
  kind: 'student' | 'guardian';
  class_id: string | null;
  academy_plan_id: string | null;
  expires_at: string | Date;
  academy_name: string;
  academy_slug: string;
  academy_logo_url: string | null;
  academy_theme: unknown;
  academy_status: string;
}

function throwInviteProblem(status: string): never {
  if (status === 'not_found') {
    throw problem(404, ErrorCodes.INVITE_INVALID_OR_EXPIRED, 'Invite not found');
  }
  throw problem(410, ErrorCodes.INVITE_INVALID_OR_EXPIRED, `Invite is ${status}`);
}

/**
 * Invite flow — the only signup (ticket 02). Landing + atomic accept run on
 * the SECURITY DEFINER seams; creation is a tenant-scoped write by
 * professor/admin (toggleable `invites.create` for professors).
 */
@Injectable()
export class InviteService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
  ) {}

  /** Professor/admin invite-link generation; raw token returned exactly once. */
  async create(
    ctx: AuthContext,
    input: {
      kind: 'student' | 'guardian';
      classId?: string;
      academyPlanId?: string;
      maxUses?: number;
    },
  ): Promise<{ token: string; expiresAt: Date; kind: string }> {
    if (!ctx.tenantId) {
      throw problem(403, ErrorCodes.AUTHZ_FORBIDDEN_ROLE, 'Invites are created inside an academy');
    }
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await withTenant(this.appDb.db, { tenantId: ctx.tenantId, userId: ctx.userId }, (tx) =>
      tx.insert(invites).values({
        tenantId: ctx.tenantId as string,
        tokenHash: this.tokens.hashToken(raw),
        kind: input.kind,
        classId: input.classId ?? null,
        academyPlanId: input.academyPlanId ?? null,
        createdByUserId: ctx.userId,
        expiresAt,
        maxUses: input.maxUses ?? null,
      }),
    );
    return { token: raw, expiresAt, kind: input.kind };
  }

  async landing(rawToken: string): Promise<InviteLanding> {
    const result = await this.appDb.db.execute(
      sql`SELECT * FROM auth_invite_landing(${this.tokens.hashToken(rawToken)})`,
    );
    const row = result.rows[0] as unknown as LandingRow;
    if (row.status !== 'valid') throwInviteProblem(row.status);
    return {
      kind: row.kind,
      expiresAt: new Date(row.expires_at),
      classId: row.class_id,
      academyPlanId: row.academy_plan_id,
      academy: {
        name: row.academy_name,
        slug: row.academy_slug,
        logoUrl: row.academy_logo_url,
        theme: row.academy_theme,
      },
    };
  }

  /** Atomic public signup; success ends logged in (full token pair). */
  async publicAccept(
    rawToken: string,
    input: PublicAcceptInput,
    meta: RequestMeta,
  ): Promise<AuthenticatedPayload> {
    const secretHash = await this.passwords.hash(input.password);
    const result = await this.appDb.db.execute(sql`
      SELECT * FROM auth_accept_invite(
        ${this.tokens.hashToken(rawToken)},
        ${input.email},
        ${input.fullName},
        ${input.phone ?? null},
        ${input.birthDate ?? null}::date,
        ${secretHash}
      )
    `);
    const row = result.rows[0] as {
      status: string;
      user_id: string | null;
      membership_id: string | null;
    };

    switch (row.status) {
      case 'accepted':
        return this.auth.establishSession(
          { id: row.user_id as string, email: input.email.toLowerCase(), fullName: input.fullName },
          meta,
          row.membership_id ?? undefined,
        );
      case 'email_exists':
        throw problem(
          409,
          ErrorCodes.INVITE_EMAIL_EXISTS,
          'An account with this email already exists — log in and accept the invite',
        );
      case 'minor_requires_guardian':
        throw problem(
          422,
          ErrorCodes.INVITE_MINOR_REQUIRES_GUARDIAN,
          'Minors must be registered by a guardian (responsável invite)',
        );
      default:
        throwInviteProblem(row.status);
    }
  }

  /** BOSS ruling: authenticated accept attaches a membership to the caller. */
  async attachToCurrentUser(
    ctx: AuthContext,
    rawToken: string,
  ): Promise<{ membershipId: string; tenantId: string; role: string }> {
    const result = await this.appDb.db.execute(sql`
      SELECT * FROM auth_attach_invite_membership(
        ${this.tokens.hashToken(rawToken)}, ${ctx.userId}::uuid
      )
    `);
    const row = result.rows[0] as {
      status: string;
      membership_id: string | null;
      tenant_id: string | null;
      role: string | null;
    };

    switch (row.status) {
      case 'attached':
        return {
          membershipId: row.membership_id as string,
          tenantId: row.tenant_id as string,
          role: row.role as string,
        };
      case 'already_member':
        throw problem(
          409,
          ErrorCodes.INVITE_ALREADY_MEMBER,
          'This account already holds that membership',
        );
      case 'user_not_found':
        throw problem(401, ErrorCodes.AUTH_TOKEN_EXPIRED, 'Account no longer exists');
      default:
        throwInviteProblem(row.status);
    }
  }
}
