import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  attendances,
  belts,
  charges,
  classSessions,
  classes,
  enrollments,
  guardians,
  notifications,
  orderItems,
  orders,
  payments,
  products,
  studentGraduations,
  students,
  users,
  withTenant,
  type DbHandle,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate, TENANT_TIMEZONE } from '../../attendance/lib/time.js';
import {
  MaterializationService,
  type MaterializationResult,
} from '../../billing/services/materialization.service.js';
import { monthWindow, requireMonth, semesterWindow, type DateWindow } from '../lib/windows.js';

export const REPORT_SLUGS = ['financeiro', 'frequencia', 'inadimplencia', 'graduacoes', 'loja'] as const;
export type ReportSlug = (typeof REPORT_SLUGS)[number];

export interface FinanceiroReport {
  report: 'financeiro';
  month: string;
  summary: { receitaCents: number; previstoCents: number; inadimplenciaPct: number };
  rows: Array<{
    chargeId: string;
    studentName: string | null;
    origin: 'plan' | 'event' | 'order';
    /** Competência (plan cycle start) — null for event/order charges. */
    periodStart: string | null;
    dueDate: string;
    status: string;
    amountCents: number;
    paidAt: Date | null;
  }>;
  materialization: MaterializationResult;
}

export interface FrequenciaReport {
  report: 'frequencia';
  month: string;
  classes: Array<{
    classId: string;
    className: string;
    /** Materialized sessions in the month — the honest denominator. */
    sessionsCount: number;
    students: Array<{
      studentId: string;
      studentName: string;
      presencas: number;
      faltas: number;
      presencePct: number;
    }>;
  }>;
}

export interface InadimplenciaReport {
  report: 'inadimplencia';
  /** As-of-now snapshot — "cobranças vencidas" has no history (recorded). */
  asOf: string;
  totals: { count: number; totalCents: number };
  rows: Array<{
    chargeId: string;
    studentName: string | null;
    guardianName: string | null;
    amountCents: number;
    dueDate: string;
    daysOverdue: number;
    /**
     * Payment-category notifications to the charge's payer since the due
     * date — an honest approximation (notifications carry no charge FK by
     * design; recorded in spec 013).
     */
    notificationsSent: number;
  }>;
}

export interface GraduacoesReport {
  report: 'graduacoes';
  month: string;
  semester: DateWindow;
  rows: Array<{
    graduationId: string;
    studentName: string;
    kind: 'degree' | 'belt';
    beltName: string;
    degree: number;
    awardedByName: string;
    awardedAt: Date;
  }>;
}

export interface LojaReport {
  report: 'loja';
  month: string;
  /** Canceled and never-paid orders are excluded from every total. */
  totals: { pedidos: number; itens: number; vendasCents: number };
  rows: Array<{
    orderId: string;
    number: number;
    date: string;
    buyerName: string;
    productName: string;
    size: string | null;
    quantity: number;
    amountCents: number;
    status: string;
  }>;
}

export type ReportView =
  | FinanceiroReport
  | FrequenciaReport
  | InadimplenciaReport
  | GraduacoesReport
  | LojaReport;

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/** Tenant-local date of a timestamptz column, as a SQL fragment. */
const localDay = (column: unknown) => sql`(${column} AT TIME ZONE ${TENANT_TIMEZONE})::date`;

/**
 * The five admin report read models (spec 013, REP.3) — pure derive-on-read
 * over existing rows (no snapshot tables, no schedulers), all windows on
 * tenant-local days. Money predicates never trust the lazy overdue flip.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly materialization: MaterializationService,
  ) {}

  async report(
    ctx: AuthContext & { tenantId: string },
    slug: string,
    month?: string,
  ): Promise<ReportView> {
    switch (slug as ReportSlug) {
      case 'financeiro':
        return this.financeiro(ctx, requireMonth(month));
      case 'frequencia':
        return this.frequencia(ctx, requireMonth(month));
      case 'inadimplencia':
        return this.inadimplencia(ctx);
      case 'graduacoes':
        return this.graduacoes(ctx, requireMonth(month));
      case 'loja':
        return this.loja(ctx, requireMonth(month));
      default:
        throw problem(404, ErrorCodes.NOT_FOUND, `Unknown report: ${slug}`);
    }
  }

  /**
   * Financeiro mensal — the shipped overview formulas re-windowed to the
   * chosen month: receita = succeeded payments by paid_at, previsto = open
   * charges due in the month (predicate), inadimplência % = overdue-open plan
   * amount ÷ the month's materialized plan total. The idempotent
   * materialization pass runs first (spec 006's rule: every money-displaying
   * entry point), so previsto reflects every plan.
   */
  private async financeiro(
    ctx: AuthContext & { tenantId: string },
    month: string,
  ): Promise<FinanceiroReport> {
    const materialization = await this.materialization.ensureCurrentCycleCharges({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
    });
    const window = monthWindow(month);
    const today = localDate();

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [receitaRow] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)` })
        .from(payments)
        .where(
          and(
            eq(payments.status, 'succeeded'),
            sql`${payments.paidAt} IS NOT NULL`,
            sql`${localDay(payments.paidAt)} >= ${window.start}::date`,
            sql`${localDay(payments.paidAt)} < ${window.endExclusive}::date`,
          ),
        );

      const [previstoRow] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${charges.amountCents}), 0)` })
        .from(charges)
        .where(
          and(
            inArray(charges.status, ['open', 'overdue']),
            gte(charges.dueDate, window.start),
            lt(charges.dueDate, window.endExclusive),
          ),
        );

      // Inadimplência % by value — overview formula: overdue-open plan amount
      // (predicate, as of today) ÷ the month's materialized plan total.
      const [overdueRow] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${charges.amountCents}), 0)` })
        .from(charges)
        .where(
          and(
            eq(charges.origin, 'plan'),
            inArray(charges.status, ['open', 'overdue']),
            lt(charges.dueDate, today),
          ),
        );
      const [monthPlanRow] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${charges.amountCents}), 0)` })
        .from(charges)
        .where(
          and(
            eq(charges.origin, 'plan'),
            gte(charges.periodStart, window.start),
            lt(charges.periodStart, window.endExclusive),
          ),
        );
      const overdueCents = Number(overdueRow?.total ?? 0);
      const monthPlanCents = Number(monthPlanRow?.total ?? 0);

      // Every charge touching the month: due in it, competência in it, or
      // settled in it (paid_at of a succeeded payment).
      const rows = await tx
        .select({
          chargeId: charges.id,
          studentName: students.fullName,
          origin: charges.origin,
          periodStart: charges.periodStart,
          dueDate: charges.dueDate,
          status: charges.status,
          amountCents: charges.amountCents,
          paidAt: sql<Date | null>`(
            SELECT MAX(p.paid_at) FROM payments p
            WHERE p.tenant_id = ${charges.tenantId}
              AND p.charge_id = ${charges.id}
              AND p.status = 'succeeded'
          )`.as('paid_at'),
        })
        .from(charges)
        .leftJoin(
          students,
          and(eq(students.tenantId, charges.tenantId), eq(students.id, charges.studentId)),
        )
        .where(
          or(
            and(gte(charges.dueDate, window.start), lt(charges.dueDate, window.endExclusive)),
            and(gte(charges.periodStart, window.start), lt(charges.periodStart, window.endExclusive)),
            sql`EXISTS (
              SELECT 1 FROM payments p
              WHERE p.tenant_id = ${charges.tenantId}
                AND p.charge_id = ${charges.id}
                AND p.status = 'succeeded'
                AND (p.paid_at AT TIME ZONE ${TENANT_TIMEZONE})::date >= ${window.start}::date
                AND (p.paid_at AT TIME ZONE ${TENANT_TIMEZONE})::date < ${window.endExclusive}::date
            )`,
          ),
        )
        .orderBy(asc(charges.dueDate), asc(students.fullName));

      return {
        report: 'financeiro' as const,
        month,
        summary: {
          receitaCents: Number(receitaRow?.total ?? 0),
          previstoCents: Number(previstoRow?.total ?? 0),
          inadimplenciaPct:
            monthPlanCents === 0 ? 0 : Math.round((overdueCents / monthPlanCents) * 100),
        },
        rows: rows.map((r) => ({
          chargeId: r.chargeId,
          studentName: r.studentName,
          origin: r.origin,
          periodStart: r.periodStart,
          dueDate: r.dueDate,
          status: r.status,
          amountCents: r.amountCents,
          paidAt: r.paidAt ? new Date(r.paidAt) : null,
        })),
        materialization,
      };
    });
  }

  /**
   * Frequência por turma — per active class, each actively enrolled student's
   * presenças/faltas/% for the month. Denominator = the class's materialized
   * sessions in the month (the honest-denominator rule verbatim: a day nobody
   * opened never happened); revoked attendances never count.
   */
  private async frequencia(
    ctx: AuthContext & { tenantId: string },
    month: string,
  ): Promise<FrequenciaReport> {
    const window = monthWindow(month);

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const activeClasses = await tx
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .where(eq(classes.status, 'active'))
        .orderBy(asc(classes.name));

      const result: FrequenciaReport['classes'] = [];
      for (const klass of activeClasses) {
        const [sessionsRow] = await tx
          .select({ total: sql<string>`COUNT(*)` })
          .from(classSessions)
          .where(
            and(
              eq(classSessions.classId, klass.id),
              gte(classSessions.sessionDate, window.start),
              lt(classSessions.sessionDate, window.endExclusive),
            ),
          );
        const sessionsCount = Number(sessionsRow?.total ?? 0);

        const enrolled = await tx
          .select({ studentId: students.id, studentName: students.fullName })
          .from(enrollments)
          .innerJoin(
            students,
            and(eq(students.tenantId, enrollments.tenantId), eq(students.id, enrollments.studentId)),
          )
          .where(and(eq(enrollments.classId, klass.id), eq(enrollments.status, 'active')))
          .orderBy(asc(students.fullName));

        const attended = await tx
          .select({
            studentId: attendances.studentId,
            total: sql<string>`COUNT(*)`,
          })
          .from(attendances)
          .innerJoin(
            classSessions,
            and(
              eq(classSessions.tenantId, attendances.tenantId),
              eq(classSessions.id, attendances.classSessionId),
            ),
          )
          .where(
            and(
              isNull(attendances.revokedAt),
              eq(classSessions.classId, klass.id),
              gte(classSessions.sessionDate, window.start),
              lt(classSessions.sessionDate, window.endExclusive),
            ),
          )
          .groupBy(attendances.studentId);
        const attendedByStudent = new Map(attended.map((a) => [a.studentId, Number(a.total)]));

        result.push({
          classId: klass.id,
          className: klass.name,
          sessionsCount,
          students: enrolled.map((s) => {
            const presencas = attendedByStudent.get(s.studentId) ?? 0;
            return {
              studentId: s.studentId,
              studentName: s.studentName,
              presencas,
              faltas: Math.max(sessionsCount - presencas, 0),
              presencePct:
                sessionsCount === 0 ? 0 : Math.round((presencas / sessionsCount) * 100),
            };
          }),
        });
      }

      return { report: 'frequencia' as const, month: window.label, classes: result };
    });
  }

  /**
   * Inadimplência — every open overdue charge as of now (predicate, any
   * origin), with days overdue and the payer's payment-category notification
   * count since the due date (the recorded honest approximation).
   */
  private async inadimplencia(ctx: AuthContext & { tenantId: string }): Promise<InadimplenciaReport> {
    const today = localDate();

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select({
          chargeId: charges.id,
          amountCents: charges.amountCents,
          dueDate: charges.dueDate,
          studentName: students.fullName,
          studentUserId: students.userId,
          guardianName: guardians.fullName,
          guardianUserId: guardians.userId,
        })
        .from(charges)
        .leftJoin(
          students,
          and(eq(students.tenantId, charges.tenantId), eq(students.id, charges.studentId)),
        )
        .leftJoin(
          guardians,
          and(eq(guardians.tenantId, charges.tenantId), eq(guardians.id, charges.guardianId)),
        )
        .where(and(inArray(charges.status, ['open', 'overdue']), lt(charges.dueDate, today)))
        .orderBy(asc(charges.dueDate), asc(students.fullName));

      const out: InadimplenciaReport['rows'] = [];
      let totalCents = 0;
      for (const row of rows) {
        // Payer of record: the guardian for bill-to-guardian charges, else the
        // student's own login. No login ⇒ nothing could have been delivered.
        const payerUserId = row.guardianUserId ?? row.studentUserId;
        let notificationsSent = 0;
        if (payerUserId) {
          const [count] = await tx
            .select({ total: sql<string>`COUNT(*)` })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, payerUserId),
                eq(notifications.category, 'payment'),
                sql`${notifications.createdAt} >= (${row.dueDate}::date::timestamp AT TIME ZONE ${TENANT_TIMEZONE})`,
              ),
            );
          notificationsSent = Number(count?.total ?? 0);
        }
        totalCents += row.amountCents;
        out.push({
          chargeId: row.chargeId,
          studentName: row.studentName,
          guardianName: row.guardianName,
          amountCents: row.amountCents,
          dueDate: row.dueDate,
          daysOverdue: Math.round(
            (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.dueDate}T00:00:00Z`)) / 86_400_000,
          ),
          notificationsSent,
        });
      }

      return {
        report: 'inadimplencia' as const,
        asOf: today,
        totals: { count: out.length, totalCents },
        rows: out,
      };
    });
  }

  /**
   * Graduações — award rows (degree and belt kinds) in the semester
   * containing the chosen month, excluding reversed awards and the revocation
   * compensation rows themselves.
   */
  private async graduacoes(
    ctx: AuthContext & { tenantId: string },
    month: string,
  ): Promise<GraduacoesReport> {
    const semester = semesterWindow(month);

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select({
          graduationId: studentGraduations.id,
          studentName: students.fullName,
          kind: studentGraduations.kind,
          beltName: belts.name,
          degree: studentGraduations.degree,
          awardedByName: users.fullName,
          awardedAt: studentGraduations.awardedAt,
        })
        .from(studentGraduations)
        .innerJoin(
          students,
          and(
            eq(students.tenantId, studentGraduations.tenantId),
            eq(students.id, studentGraduations.studentId),
          ),
        )
        .innerJoin(users, eq(users.id, studentGraduations.awardedByUserId))
        .innerJoin(belts, eq(belts.id, studentGraduations.beltId))
        .where(
          and(
            sql`${studentGraduations.kind} <> 'revocation'`,
            sql`${localDay(studentGraduations.awardedAt)} >= ${semester.start}::date`,
            sql`${localDay(studentGraduations.awardedAt)} < ${semester.endExclusive}::date`,
            // Reversed awards leave the report — history stays in the timeline.
            sql`NOT EXISTS (
              SELECT 1 FROM student_graduations r
              WHERE r.tenant_id = ${studentGraduations.tenantId}
                AND r.reverses_graduation_id = ${studentGraduations.id}
            )`,
          ),
        )
        .orderBy(
          sql`${studentGraduations.awardedAt} DESC`,
          asc(students.fullName),
        );

      return {
        report: 'graduacoes' as const,
        month,
        semester,
        rows: rows.map((r) => ({ ...r, kind: r.kind as 'degree' | 'belt' })),
      };
    });
  }

  /**
   * Vendas da loja — the month's orders with their item snapshot; totals
   * count only orders that reached `paid` or beyond and were not canceled
   * (pending and canceled rows stay listed with their status).
   */
  private async loja(ctx: AuthContext & { tenantId: string }, month: string): Promise<LojaReport> {
    const window = monthWindow(month);

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select({
          orderId: orders.id,
          number: orders.number,
          createdAt: orders.createdAt,
          status: orders.status,
          totalCents: orders.totalCents,
          buyerName: users.fullName,
          productName: products.name,
          size: orderItems.size,
          quantity: orderItems.quantity,
          unitPriceCents: orderItems.unitPriceCents,
        })
        .from(orders)
        .innerJoin(users, eq(users.id, orders.buyerUserId))
        .innerJoin(
          orderItems,
          and(eq(orderItems.tenantId, orders.tenantId), eq(orderItems.orderId, orders.id)),
        )
        .innerJoin(
          products,
          and(eq(products.tenantId, orders.tenantId), eq(products.id, orderItems.productId)),
        )
        .where(
          and(
            sql`${localDay(orders.createdAt)} >= ${window.start}::date`,
            sql`${localDay(orders.createdAt)} < ${window.endExclusive}::date`,
          ),
        )
        .orderBy(asc(orders.number));

      const SOLD = new Set(['paid', 'ready', 'delivered']);
      const soldOrders = new Map<string, number>();
      let itens = 0;
      for (const row of rows) {
        if (SOLD.has(row.status)) {
          soldOrders.set(row.orderId, row.totalCents);
          itens += row.quantity;
        }
      }
      let vendasCents = 0;
      for (const total of soldOrders.values()) vendasCents += total;

      return {
        report: 'loja' as const,
        month: window.label,
        totals: { pedidos: soldOrders.size, itens, vendasCents },
        rows: rows.map((r) => ({
          orderId: r.orderId,
          number: r.number,
          date: localDate(r.createdAt),
          buyerName: r.buyerName,
          productName: r.productName,
          size: r.size,
          quantity: r.quantity,
          amountCents: r.unitPriceCents * r.quantity,
          status: r.status,
        })),
      };
    });
  }
}
