import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { memberships, users, withTenant, type DbHandle } from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { PasswordResetService } from '../../identity/services/password-reset.service.js';

export interface ProfessorListItem {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  status: string;
}

export interface RegisterProfessorResult {
  userId: string;
  membershipId: string;
  userCreated: boolean;
  passwordEmailSent: boolean;
}

interface SeamRow {
  status: 'registered' | 'already_member' | 'no_tenant';
  user_id: string | null;
  membership_id: string | null;
  user_created: boolean | null;
  has_password: boolean | null;
  email: string | null;
  full_name: string | null;
}

/**
 * Professor registration (ENR.7). Professors are memberships, not a person
 * table: the SECURITY DEFINER seam reuses-or-creates the global user by email
 * (cross-tenant) and creates the professor membership atomically; the
 * set-your-password email rides the existing password-reset token seam — no
 * new credential machinery, the admin never handles passwords.
 */
@Injectable()
export class ProfessorRegistryService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly passwordResets: PasswordResetService,
  ) {}

  async list(ctx: AuthContext): Promise<ProfessorListItem[]> {
    return withTenant(this.appDb.db, { tenantId: ctx.tenantId, userId: ctx.userId }, async (tx) => {
      const rows = await tx
        .select({
          membershipId: memberships.id,
          userId: users.id,
          fullName: users.fullName,
          email: users.email,
          status: memberships.status,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.role, 'professor'), eq(memberships.status, 'active')))
        .orderBy(asc(users.fullName));
      return rows;
    });
  }

  async register(
    ctx: AuthContext,
    input: { fullName: string; email: string },
  ): Promise<RegisterProfessorResult> {
    const row = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const result = await tx.execute(
          sql`SELECT * FROM enrollment_register_professor(${input.email}, ${input.fullName})`,
        );
        return result.rows[0] as unknown as SeamRow;
      },
    );

    switch (row.status) {
      case 'registered':
        break;
      case 'already_member':
        throw problem(
          409,
          ErrorCodes.CONFLICT,
          'This email already holds a professor membership in this academy',
        );
      default:
        throw problem(500, ErrorCodes.INTERNAL, 'Professor registration seam refused the call');
    }

    // Set-your-password email only when the account has no credential yet —
    // a reused cross-tenant account keeps logging in with what it has.
    let passwordEmailSent = false;
    if (!row.has_password) {
      await this.passwordResets.requestReset(row.email as string);
      passwordEmailSent = true;
    }

    return {
      userId: row.user_id as string,
      membershipId: row.membership_id as string,
      userCreated: row.user_created === true,
      passwordEmailSent,
    };
  }
}
