import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { academies, withTenant, type DbHandle } from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { normalizeHex, themeFromColumns, type BrandTheme } from '../lib/brand.js';
import { AuditService } from './audit.service.js';

export interface AcademySettings {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  brand: BrandTheme | null;
  autoNotificationsEnabled: boolean;
}

export interface AcademySettingsUpdate {
  name: string;
  /** Complete triplet (any hex case — normalized to uppercase) or null = clear. */
  brand: BrandTheme | null;
  autoNotificationsEnabled: boolean;
}

/**
 * The admin Configurações identidade slice (spec 011, CFG.4): read + update
 * of the academy's own row through the RLS-scoped own-row policies. Slug and
 * status never change here (platform-owned); logo upload is recorded debt.
 * Every effective update is audited (`academy.updated`, before/after of the
 * changed fields only).
 */
@Injectable()
export class AcademySettingsService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly audit: AuditService,
  ) {}

  private static readonly COLUMNS = {
    id: academies.id,
    name: academies.name,
    slug: academies.slug,
    logoUrl: academies.logoUrl,
    brandDeep: academies.brandDeep,
    brandVibrant: academies.brandVibrant,
    brandAccent: academies.brandAccent,
    autoNotificationsEnabled: academies.autoNotificationsEnabled,
  };

  private static toSettings(row: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandDeep: string | null;
    brandVibrant: string | null;
    brandAccent: string | null;
    autoNotificationsEnabled: boolean;
  }): AcademySettings {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logoUrl,
      brand: themeFromColumns(row.brandDeep, row.brandVibrant, row.brandAccent),
      autoNotificationsEnabled: row.autoNotificationsEnabled,
    };
  }

  async get(tenantId: string): Promise<AcademySettings> {
    const rows = await withTenant(this.appDb.db, tenantId, (tx) =>
      tx.select(AcademySettingsService.COLUMNS).from(academies),
    );
    if (!rows[0]) throw problem(404, ErrorCodes.NOT_FOUND, 'Academy not found');
    return AcademySettingsService.toSettings(rows[0]);
  }

  async update(
    ctx: AuthContext & { tenantId: string },
    input: AcademySettingsUpdate,
  ): Promise<AcademySettings> {
    const brand: BrandTheme | null = input.brand
      ? {
          deep: normalizeHex(input.brand.deep),
          vibrant: normalizeHex(input.brand.vibrant),
          accent: normalizeHex(input.brand.accent),
        }
      : null;

    const updated = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const [before] = await tx.select(AcademySettingsService.COLUMNS).from(academies);
        if (!before) throw problem(404, ErrorCodes.NOT_FOUND, 'Academy not found');
        const previous = AcademySettingsService.toSettings(before);

        const [after] = await tx
          .update(academies)
          .set({
            name: input.name,
            brandDeep: brand?.deep ?? null,
            brandVibrant: brand?.vibrant ?? null,
            brandAccent: brand?.accent ?? null,
            autoNotificationsEnabled: input.autoNotificationsEnabled,
            updatedAt: new Date(),
          })
          .where(eq(academies.id, ctx.tenantId))
          .returning(AcademySettingsService.COLUMNS);
        if (!after) throw problem(404, ErrorCodes.NOT_FOUND, 'Academy not found');
        return { previous, next: AcademySettingsService.toSettings(after) };
      },
    );

    // Audit before/after of the changed fields only (permissions precedent).
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    if (updated.previous.name !== updated.next.name) {
      changes['name'] = { before: updated.previous.name, after: updated.next.name };
    }
    if (JSON.stringify(updated.previous.brand) !== JSON.stringify(updated.next.brand)) {
      changes['brand'] = { before: updated.previous.brand, after: updated.next.brand };
    }
    if (updated.previous.autoNotificationsEnabled !== updated.next.autoNotificationsEnabled) {
      changes['auto_notifications_enabled'] = {
        before: updated.previous.autoNotificationsEnabled,
        after: updated.next.autoNotificationsEnabled,
      };
    }
    if (Object.keys(changes).length > 0) {
      await this.audit.append({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        impersonatorUserId: ctx.impersonatorUserId,
        action: 'academy.updated',
        targetType: 'academy',
        targetId: ctx.tenantId,
        metadata: { changes },
      });
    }

    return updated.next;
  }
}
