import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import { sessions, withTenant, type DbHandle } from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';
import type {
  AcademyRole,
  AnyRoleName,
  PlatformRole,
} from '../../../common/decorators.js';

/** One entry of the client switcher: an academy membership or platform role. */
export interface MembershipView {
  id: string;
  type: 'academy' | 'platform';
  role: AnyRoleName;
  tenantId: string | null;
  academyName: string | null;
  academySlug: string | null;
  academyStatus: string | null;
  status: string;
}

export interface PlatformProfile {
  platformUserId: string;
  role: PlatformRole;
  status: string;
  totpEnabled: boolean;
  totpSecret: string | null;
  totpRecoveryCodes: string[] | null;
}

interface AcademyMembershipRow {
  membership_id: string;
  tenant_id: string;
  role: AcademyRole;
  membership_status: string;
  academy_name: string;
  academy_slug: string;
  academy_status: string;
}

/**
 * Membership resolution around the pre-auth seams: login/switch/me need the
 * full membership list before (or outside) any tenant context.
 */
@Injectable()
export class MembershipService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async listAcademyMemberships(userId: string): Promise<MembershipView[]> {
    const result = await this.appDb.db.execute(
      sql`SELECT * FROM auth_user_memberships(${userId}::uuid)`,
    );
    return (result.rows as unknown as AcademyMembershipRow[]).map((row) => ({
      id: row.membership_id,
      type: 'academy' as const,
      role: row.role,
      tenantId: row.tenant_id,
      academyName: row.academy_name,
      academySlug: row.academy_slug,
      academyStatus: row.academy_status,
      status: row.membership_status,
    }));
  }

  async getPlatformProfile(userId: string): Promise<PlatformProfile | null> {
    const result = await this.appDb.db.execute(
      sql`SELECT * FROM auth_platform_profile(${userId}::uuid)`,
    );
    const row = result.rows[0] as
      | {
          platform_user_id: string;
          role: PlatformRole;
          status: string;
          totp_enabled: boolean;
          totp_secret: string | null;
          totp_recovery_codes: string[] | null;
        }
      | undefined;
    if (!row) return null;
    return {
      platformUserId: row.platform_user_id,
      role: row.role,
      status: row.status,
      totpEnabled: row.totp_enabled,
      totpSecret: row.totp_secret,
      totpRecoveryCodes: row.totp_recovery_codes,
    };
  }

  /** Academy memberships + the platform pseudo-membership, active ones only. */
  async listAll(userId: string): Promise<MembershipView[]> {
    const [academy, platform] = await Promise.all([
      this.listAcademyMemberships(userId),
      this.getPlatformProfile(userId),
    ]);
    const list = academy.filter((m) => m.status === 'active');
    if (platform && platform.status === 'active') {
      list.push({
        id: platform.platformUserId,
        type: 'platform',
        role: platform.role,
        tenantId: null,
        academyName: null,
        academySlug: null,
        academyStatus: null,
        status: platform.status,
      });
    }
    return list;
  }

  /**
   * Active-membership pick at login (ticket 02): the only one if single, else
   * the last-used one (most recent session), else platform (story 13: platform
   * staff default to the platform console), else the first.
   */
  async resolveActive(
    userId: string,
    memberships: MembershipView[],
  ): Promise<MembershipView | null> {
    if (memberships.length === 0) return null;
    if (memberships.length === 1) return memberships[0];

    const lastUsed = await withTenant(this.appDb.db, { userId }, (tx) =>
      tx
        .select({ membershipId: sessions.membershipId })
        .from(sessions)
        .where(isNotNull(sessions.membershipId))
        .orderBy(desc(sessions.createdAt))
        .limit(1),
    );
    const lastId = lastUsed[0]?.membershipId;
    const last = lastId ? memberships.find((m) => m.id === lastId) : undefined;
    if (last) return last;

    return memberships.find((m) => m.type === 'platform') ?? memberships[0];
  }

  /** Repoints the session's active membership (`/v1/auth/switch`). */
  async switchSessionMembership(
    userId: string,
    sessionId: string,
    membershipId: string,
  ): Promise<void> {
    await withTenant(this.appDb.db, { userId }, (tx) =>
      tx
        .update(sessions)
        .set({ membershipId, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId)),
    );
  }
}
