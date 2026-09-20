import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import {
  memberships,
  notifications,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';

/** One feed card — render-ready, clients only format the relative time. */
export interface NotificationView {
  id: string;
  category: 'payment' | 'event' | 'graduation' | 'attendance' | 'store';
  chip: string | null;
  title: string;
  body: string | null;
  route: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  notifications: NotificationView[];
  /** Opaque keyset cursor; null = no further pages. */
  nextCursor: string | null;
}

/** Page size of the cursor list (spec: ~30). */
const PAGE_SIZE = 30;

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});

/**
 * Persona-neutral read side of the feed (spec 010, NOT.5). Reads additionally
 * filter `user_id = ctx.userId` in the service — the uniform tenant RLS
 * policy stays untouched; personal scoping is service-enforced, matching how
 * every persona endpoint already scopes. Foreign/cross-tenant ids behave as
 * 404 (RLS backstop), never 403.
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  /** GET /notifications — own rows, newest first, keyset-paged. */
  async list(
    ctx: AuthContext & { tenantId: string },
    cursor?: string,
  ): Promise<NotificationListResult> {
    const after = cursor === undefined ? null : decodeCursor(cursor);
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, ctx.userId),
            after
              ? or(
                  lt(notifications.createdAt, after.createdAt),
                  and(
                    eq(notifications.createdAt, after.createdAt),
                    lt(notifications.id, after.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(PAGE_SIZE + 1);

      const page = rows.slice(0, PAGE_SIZE);
      const last = page[page.length - 1];
      return {
        notifications: page.map(toView),
        nextCursor:
          rows.length > PAGE_SIZE && last
            ? encodeCursor(last.createdAt, last.id)
            : null,
      };
    });
  }

  /**
   * GET /notifications/unread-count — `{ count }`. Returns 0 while the
   * active membership is muted (rows keep accruing underneath — re-enabling
   * the switch restores the true arithmetic).
   */
  async unreadCount(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ count: number }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      if (await this.isMuted(tx, ctx)) return { count: 0 };
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, ctx.userId),
            isNull(notifications.readAt),
          ),
        );
      return { count: row?.count ?? 0 };
    });
  }

  /** POST /notifications/:id/read — idempotent; foreign/cross-tenant → 404. */
  async markRead(
    ctx: AuthContext & { tenantId: string },
    id: string,
  ): Promise<{ notification: NotificationView }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [row] = await tx
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.id, id), eq(notifications.userId, ctx.userId)),
        );
      // Cross-tenant ids are invisible under RLS; another member's row is
      // filtered by the user scope — both are the same 404 (no leak).
      if (!row)
        throw problem(404, ErrorCodes.NOT_FOUND, 'Notification not found');
      if (row.readAt) return { notification: toView(row) };

      const [updated] = await tx
        .update(notifications)
        .set({ readAt: new Date(), updatedAt: new Date() })
        .where(eq(notifications.id, row.id))
        .returning();
      return { notification: toView(updated ?? row) };
    });
  }

  /** POST /notifications/read-all — the open-screen gesture; kills the dot. */
  async markAllRead(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ updated: number }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const updated = await tx
        .update(notifications)
        .set({ readAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(notifications.userId, ctx.userId),
            isNull(notifications.readAt),
          ),
        )
        .returning({ id: notifications.id });
      return { updated: updated.length };
    });
  }

  /** GET /notifications/settings — the perfil switch state. */
  async getSettings(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ enabled: boolean }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const membership = await this.activeMembership(tx, ctx);
      return { enabled: membership.notificationsEnabled };
    });
  }

  /** PUT /notifications/settings — flip the per-membership mute. */
  async updateSettings(
    ctx: AuthContext & { tenantId: string },
    enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const membership = await this.activeMembership(tx, ctx);
      if (membership.notificationsEnabled === enabled) return { enabled };
      const [updated] = await tx
        .update(memberships)
        .set({ notificationsEnabled: enabled, updatedAt: new Date() })
        .where(eq(memberships.id, membership.id))
        .returning({ enabled: memberships.notificationsEnabled });
      return { enabled: updated?.enabled ?? enabled };
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * The session's active membership row. Impersonated sessions carry no
   * membership (`membershipId` null) — the switch has no grain to write to,
   * so settings behave as 404 there (the impersonating admin is not the
   * member).
   */
  private async activeMembership(
    tx: DbTransaction,
    ctx: AuthContext,
  ): Promise<{ id: string; notificationsEnabled: boolean }> {
    if (!ctx.membershipId) {
      throw problem(404, ErrorCodes.NOT_FOUND, 'No active academy membership');
    }
    const [row] = await tx
      .select({
        id: memberships.id,
        notificationsEnabled: memberships.notificationsEnabled,
      })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, ctx.membershipId),
          eq(memberships.userId, ctx.userId),
        ),
      );
    if (!row)
      throw problem(404, ErrorCodes.NOT_FOUND, 'No active academy membership');
    return row;
  }

  /** Muted = the active membership flipped the perfil switch off. */
  private async isMuted(tx: DbTransaction, ctx: AuthContext): Promise<boolean> {
    if (!ctx.membershipId) return false; // impersonation — no switch, no mute
    const [row] = await tx
      .select({ enabled: memberships.notificationsEnabled })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, ctx.membershipId),
          eq(memberships.userId, ctx.userId),
        ),
      );
    return row ? !row.enabled : false;
  }
}

function toView(row: typeof notifications.$inferSelect): NotificationView {
  return {
    id: row.id,
    category: row.category,
    chip: row.chip,
    title: row.title,
    body: row.body,
    route: row.route,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.lastIndexOf('|');
  const createdAt =
    separator > 0 ? new Date(decoded.slice(0, separator)) : new Date(NaN);
  const id = separator > 0 ? decoded.slice(separator + 1) : '';
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) {
    throw problem(422, ErrorCodes.VALIDATION_FAILED, 'Malformed cursor', [
      {
        field: 'cursor',
        messages: ['Must be a cursor previously returned by this endpoint'],
      },
    ]);
  }
  return { createdAt, id };
}
