import { randomBytes, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import {
  attendances,
  checkinCodes,
  classSessions,
  classes,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import {
  addMinutes,
  CODE_FALLBACK_TTL_MINUTES,
  CODE_GRACE_MINUTES,
} from '../lib/time.js';
import { SessionService, type MaterializedSession } from './session.service.js';

export interface LiveCodeView {
  id: string;
  code: string;
  qrToken: string;
  expiresAt: Date;
  revokedAt: Date | null;
  session: {
    id: string;
    classId: string;
    className: string;
    sessionDate: string;
    startsAt: Date | null;
    status: string;
  };
  presentCount: number;
}

export interface SnapshotView {
  presentCount: number;
  code: { id: string; expiresAt: Date; revokedAt: Date | null };
  attendances: Array<{
    id: string;
    studentId: string;
    studentName: string;
    method: 'qr' | 'code' | 'manual';
    checkedInAt: Date;
  }>;
}

const MINT_ATTEMPTS = 25;

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});

/**
 * The professor-opened live window (spec 004, ATT.6): open chamada mints a
 * 4-digit code + opaque QR token for today's (idempotently materialized)
 * session; "Encerrar" revokes the code and marks the session done; reopening
 * is simply opening again — a fresh code for the same session.
 *
 * Mint path invariants (DB slice note): the active-code partial uniques are
 * keyed on `revoked_at` only — expiry is not in the index predicate — so the
 * mint path must revoke stale expired codes (own session AND a tenant-wide
 * digit collision holder) or retry with fresh digits before inserting.
 */
@Injectable()
export class LiveCodeService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly sessions: SessionService,
  ) {}

  /** POST /professor/classes/:id/live-codes — idempotent open (stories 19/24/25). */
  async open(
    ctx: AuthContext & { tenantId: string },
    classId: string,
  ): Promise<LiveCodeView> {
    const now = new Date();
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const klass = await this.sessions.ownedClass(tx, classId, ctx.userId);
      if (!klass || klass.status !== 'active') {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
      }

      const session = await this.sessions.materializeToday(
        tx,
        ctx.tenantId,
        classId,
        now,
      );

      // Chamada already open → benign: return the active, unexpired code.
      const active = await this.activeCodeOf(tx, session.id);
      if (active) {
        if (active.expiresAt > now) {
          return this.view(tx, active, klass.name, session);
        }
        // Stale (expired but never explicitly closed): revoke before minting —
        // the one-active-per-session partial unique demands it.
        await tx
          .update(checkinCodes)
          .set({ revokedAt: now, updatedAt: now })
          .where(eq(checkinCodes.id, active.id));
      }

      // Reopen semantics: a fresh code resurrects a session closed by mistake.
      if (session.status === 'done') {
        await tx
          .update(classSessions)
          .set({ status: 'scheduled', updatedAt: now })
          .where(eq(classSessions.id, session.id));
        session.status = 'scheduled';
      }

      const expiresAt = session.slot
        ? addMinutes(session.slot.endsAt, CODE_GRACE_MINUTES)
        : addMinutes(now, CODE_FALLBACK_TTL_MINUTES);

      const minted = await this.mint(
        tx,
        ctx.tenantId,
        session.id,
        ctx.userId,
        expiresAt,
        now,
      );
      return this.view(tx, minted, klass.name, session);
    });
  }

  /** POST /professor/live-codes/:id/close — encerrar chamada (story 23). */
  async close(
    ctx: AuthContext & { tenantId: string },
    liveCodeId: string,
  ): Promise<LiveCodeView> {
    const now = new Date();
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const found = await this.ownedLiveCode(tx, liveCodeId, ctx.userId);
      if (!found)
        throw problem(404, ErrorCodes.NOT_FOUND, 'Live code not found');
      const { code, session, klass } = found;

      if (!code.revokedAt) {
        await tx
          .update(checkinCodes)
          .set({ revokedAt: now, updatedAt: now })
          .where(eq(checkinCodes.id, code.id));
        code.revokedAt = now;
      }
      if (session.status !== 'done') {
        await tx
          .update(classSessions)
          .set({ status: 'done', updatedAt: now })
          .where(eq(classSessions.id, session.id));
        session.status = 'done';
      }
      return this.view(tx, code, klass.name, {
        id: session.id,
        classId: session.classId,
        sessionDate: session.sessionDate,
        startsAt: session.startsAt,
        status: session.status,
        slot: null,
      });
    });
  }

  /** GET /professor/live-codes/:id/attendances — snapshot + polling fallback. */
  async snapshot(
    ctx: AuthContext & { tenantId: string },
    liveCodeId: string,
  ): Promise<SnapshotView> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const found = await this.ownedLiveCode(tx, liveCodeId, ctx.userId);
      if (!found)
        throw problem(404, ErrorCodes.NOT_FOUND, 'Live code not found');
      return this.snapshotOf(tx, found.code, found.session.id);
    });
  }

  /** Professor-scoped existence check — the stream-ticket mint gate. */
  async ownedRef(
    ctx: AuthContext & { tenantId: string },
    liveCodeId: string,
  ): Promise<{ liveCodeId: string; classSessionId: string }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const found = await this.ownedLiveCode(tx, liveCodeId, ctx.userId);
      if (!found)
        throw problem(404, ErrorCodes.NOT_FOUND, 'Live code not found');
      return { liveCodeId, classSessionId: found.session.id };
    });
  }

  /** Room resolution for an already-ticket-authorized stream attach. */
  async roomForTicket(tenantId: string, userId: string, liveCodeId: string) {
    return withTenant(this.appDb.db, { tenantId, userId }, async (tx) => {
      const found = await this.ownedLiveCode(tx, liveCodeId);
      if (!found)
        throw problem(404, ErrorCodes.NOT_FOUND, 'Live code not found');
      return { classSessionId: found.session.id };
    });
  }

  /** Live code joined to session + class; professor-scoped when given. */
  private async ownedLiveCode(
    tx: DbTransaction,
    liveCodeId: string,
    professorUserId?: string,
  ) {
    const [row] = await tx
      .select({ code: checkinCodes, session: classSessions, klass: classes })
      .from(checkinCodes)
      .innerJoin(
        classSessions,
        and(
          eq(classSessions.tenantId, checkinCodes.tenantId),
          eq(classSessions.id, checkinCodes.classSessionId),
        ),
      )
      .innerJoin(
        classes,
        and(
          eq(classes.tenantId, classSessions.tenantId),
          eq(classes.id, classSessions.classId),
        ),
      )
      .where(eq(checkinCodes.id, liveCodeId));
    if (!row) return null;
    if (professorUserId && row.klass.professorUserId !== professorUserId)
      return null;
    return row;
  }

  private async activeCodeOf(tx: DbTransaction, sessionId: string) {
    const [row] = await tx
      .select()
      .from(checkinCodes)
      .where(
        and(
          eq(checkinCodes.classSessionId, sessionId),
          isNull(checkinCodes.revokedAt),
        ),
      );
    return row ?? null;
  }

  /**
   * Insert with digit-collision handling: an active code's digits are unique
   * per tenant, and "active" includes expired-but-unclosed codes of OTHER
   * sessions. On a digit conflict the expired holder is revoked (stale) or
   * fresh digits are drawn; on a session conflict (concurrent open) the
   * winner's row is returned.
   */
  private async mint(
    tx: DbTransaction,
    tenantId: string,
    sessionId: string,
    openedByUserId: string,
    expiresAt: Date,
    now: Date,
  ): Promise<typeof checkinCodes.$inferSelect> {
    for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
      const code = String(randomInt(0, 10_000)).padStart(4, '0');

      // Proactively clear a stale expired holder of these digits (tenant-wide).
      const [holder] = await tx
        .select({ id: checkinCodes.id })
        .from(checkinCodes)
        .where(
          and(
            eq(checkinCodes.code, code),
            isNull(checkinCodes.revokedAt),
            lte(checkinCodes.expiresAt, now),
          ),
        )
        .orderBy(asc(checkinCodes.createdAt));
      if (holder) {
        await tx
          .update(checkinCodes)
          .set({ revokedAt: now, updatedAt: now })
          .where(eq(checkinCodes.id, holder.id));
      }

      try {
        // Nested transaction = SAVEPOINT: a unique-violation rollback must not
        // abort the outer tenant transaction (the retry keeps using it).
        const minted = await tx.transaction(async (stx) => {
          const [row] = await stx
            .insert(checkinCodes)
            .values({
              tenantId,
              classSessionId: sessionId,
              code,
              qrToken: randomBytes(16).toString('base64url'),
              openedByUserId,
              expiresAt,
            })
            .returning();
          return row;
        });
        if (!minted)
          throw problem(500, ErrorCodes.INTERNAL, 'Code mint returned no row');
        return minted;
      } catch (error) {
        const conflict = SessionService.isCodeConflict(error);
        if (conflict === 'digits') continue; // live holder — draw fresh digits
        if (conflict === 'session') {
          // Concurrent open won the race — return its code (idempotent open).
          const winner = await this.activeCodeOf(tx, sessionId);
          if (winner) return winner;
        }
        throw error;
      }
    }
    throw problem(
      500,
      ErrorCodes.INTERNAL,
      'Unable to mint a unique check-in code',
    );
  }

  private async view(
    tx: DbTransaction,
    code: typeof checkinCodes.$inferSelect,
    className: string,
    session: MaterializedSession,
  ): Promise<LiveCodeView> {
    return {
      id: code.id,
      code: code.code,
      qrToken: code.qrToken,
      expiresAt: code.expiresAt,
      revokedAt: code.revokedAt,
      session: {
        id: session.id,
        classId: session.classId,
        className,
        sessionDate: session.sessionDate,
        startsAt: session.startsAt,
        status: session.status,
      },
      presentCount: await this.sessions.presentCount(tx, session.id),
    };
  }

  private async snapshotOf(
    tx: DbTransaction,
    code: typeof checkinCodes.$inferSelect,
    sessionId: string,
  ): Promise<SnapshotView> {
    const rows = await tx
      .select({
        id: attendances.id,
        studentId: attendances.studentId,
        studentName: students.fullName,
        method: attendances.method,
        checkedInAt: attendances.checkedInAt,
      })
      .from(attendances)
      .innerJoin(
        students,
        and(
          eq(students.tenantId, attendances.tenantId),
          eq(students.id, attendances.studentId),
        ),
      )
      .where(
        and(
          eq(attendances.classSessionId, sessionId),
          isNull(attendances.revokedAt),
        ),
      )
      .orderBy(asc(attendances.checkedInAt));
    return {
      presentCount: rows.length,
      code: {
        id: code.id,
        expiresAt: code.expiresAt,
        revokedAt: code.revokedAt,
      },
      attendances: rows,
    };
  }
}
