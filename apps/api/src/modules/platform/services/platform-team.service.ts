import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { platformUsers, users, withPlatform, type DbHandle } from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import type { PlatformRole } from '../../../common/decorators.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { PLATFORM_DB } from '../../../infra/db/db.module.js';
import { AuditService } from '../../identity/services/audit.service.js';
import { PasswordResetService } from '../../identity/services/password-reset.service.js';

export interface PlatformTeamMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: PlatformRole;
  status: string;
}

export interface InviteTeamMemberInput {
  fullName: string;
  email: string;
  role: PlatformRole;
}

export interface InviteTeamMemberResult {
  member: PlatformTeamMember;
  userCreated: boolean;
  passwordEmailSent: boolean;
}

/**
 * Equipe da plataforma (spec 012, PLT.8 — plataforma-10). The roster plus an
 * owner-only invite that reuses the set-password email path (the enrollment
 * professor-registration precedent): create the login if the email is new,
 * attach the platform role, and let the person set their own password.
 * Editing or removing members is out of scope — plataforma-10 shows Convidar
 * only.
 */
@Injectable()
export class PlatformTeamService {
  constructor(
    @Inject(PLATFORM_DB) private readonly platformDb: DbHandle,
    private readonly audit: AuditService,
    private readonly passwordResets: PasswordResetService,
  ) {}

  async list(): Promise<PlatformTeamMember[]> {
    return withPlatform(this.platformDb.db, async (tx) => {
      const rows = await tx
        .select({
          id: platformUsers.id,
          userId: users.id,
          fullName: users.fullName,
          email: users.email,
          role: platformUsers.role,
          status: platformUsers.status,
        })
        .from(platformUsers)
        .innerJoin(users, eq(users.id, platformUsers.userId))
        .orderBy(asc(users.fullName));
      return rows as PlatformTeamMember[];
    });
  }

  async invite(ctx: AuthContext, input: InviteTeamMemberInput): Promise<InviteTeamMemberResult> {
    const email = input.email.trim().toLowerCase();
    const created = await withPlatform(this.platformDb.db, async (tx) => {
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);

      let userId = existingUser?.id;
      const userCreated = !userId;
      if (userId) {
        const [alreadyOnTeam] = await tx
          .select({ id: platformUsers.id })
          .from(platformUsers)
          .where(eq(platformUsers.userId, userId));
        if (alreadyOnTeam) {
          throw problem(409, ErrorCodes.CONFLICT, 'This email is already on the platform team');
        }
      } else {
        const [inserted] = await tx
          .insert(users)
          .values({ email, fullName: input.fullName.trim() })
          .returning({ id: users.id });
        if (!inserted) throw problem(500, ErrorCodes.INTERNAL, 'User insert returned no row');
        userId = inserted.id;
      }

      const [member] = await tx
        .insert(platformUsers)
        .values({ userId, role: input.role })
        .returning({ id: platformUsers.id });
      if (!member) throw problem(500, ErrorCodes.INTERNAL, 'Platform member insert returned no row');

      return { memberId: member.id, userId, userCreated };
    });

    await this.audit.append({
      tenantId: null,
      actorUserId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
      action: 'platform_user.invited',
      targetType: 'platform_user',
      targetId: created.memberId,
      metadata: { email, role: input.role },
    });

    await this.passwordResets.requestReset(email);

    const roster = await this.list();
    const member = roster.find((row) => row.id === created.memberId);
    if (!member) throw problem(500, ErrorCodes.INTERNAL, 'Invited member disappeared');

    return { member, userCreated: created.userCreated, passwordEmailSent: true };
  }
}
