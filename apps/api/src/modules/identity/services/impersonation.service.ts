import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { academies, withPlatform, type DbHandle } from '@tatame/db';
import { PLATFORM_DB } from '../../../infra/db/db.module.js';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import type { RequestMeta } from './auth.service.js';
import { AuditService } from './audit.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

const IMPERSONATION_TTL_MS = 60 * 60 * 1000; // 1 h absolute cap (charter)

export interface ImpersonationGrant {
  accessToken: string;
  accessExpiresIn: number;
  /** Always in the body: the platform refresh cookie must stay untouched. */
  refreshToken: string;
  expiresAt: Date;
  academy: { id: string; name: string; slug: string; status: string };
}

/**
 * "Entrar como admin" (ticket 03): owner/support mint an audited, 1-hour
 * impersonated session claiming the target tenant with the admin role and an
 * RFC 8693 actor claim. The impersonated session then runs on the regular
 * tenant-scoped pool — support sees exactly what the admin sees.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    @Inject(PLATFORM_DB) private readonly platformDb: DbHandle,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async impersonate(ctx: AuthContext, academyId: string, meta: RequestMeta): Promise<ImpersonationGrant> {
    const rows = await withPlatform(this.platformDb.db, (tx) =>
      tx
        .select({
          id: academies.id,
          name: academies.name,
          slug: academies.slug,
          status: academies.status,
        })
        .from(academies)
        .where(eq(academies.id, academyId)),
    );
    const academy = rows[0];
    if (!academy) {
      throw problem(404, ErrorCodes.NOT_FOUND, 'Academy not found');
    }

    const minted = await this.sessions.mint({
      userId: ctx.userId,
      membershipId: null,
      impersonatorUserId: ctx.userId,
      impersonatedTenantId: academyId,
      ttlMs: IMPERSONATION_TTL_MS,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await this.audit.append({
      tenantId: academyId,
      actorUserId: ctx.userId,
      impersonatorUserId: ctx.userId,
      action: 'impersonation.started',
      targetType: 'academy',
      targetId: academyId,
      metadata: { sessionId: minted.sessionId, platformRole: ctx.role },
    });

    const accessToken = this.tokens.signAccessToken({
      userId: ctx.userId,
      sessionId: minted.sessionId,
      membershipId: null,
      tenantId: academyId,
      role: 'admin',
      impersonatorUserId: ctx.userId,
    });

    return {
      accessToken,
      accessExpiresIn: Math.floor(this.tokens.accessTtlMs / 1000),
      refreshToken: minted.refreshToken,
      expiresAt: minted.sessionExpiresAt,
      academy,
    };
  }
}
