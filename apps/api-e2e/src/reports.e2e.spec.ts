import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  academyPlans,
  attendances,
  charges,
  classSessions,
  eventRegistrations,
  events,
  notifications,
  orders,
  students,
  studentGraduations,
  users,
  withPlatform,
  withTenant,
} from '@tatame/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * Spec 013 (REP.3–REP.5, REP.8): the five admin report read models, the CSV
 * serializations and the academy-wide rankings — externally observable
 * behavior against real Postgres with RLS active; expectations are computed
 * from database truth (BYPASSRLS pool), never hardcoded seed counts.
 */

const TZ = 'America/Sao_Paulo';
const spDate = (at: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);
const spMonth = () => spDate().slice(0, 7);

function monthWindow(month: string): { start: string; endExclusive: string } {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const next =
    m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
  return { start: `${month}-01`, endExclusive: `${next}-01` };
}

function prevMonth(): string {
  const [year, m] = [
    Number(spMonth().slice(0, 4)),
    Number(spMonth().slice(5, 7)),
  ];
  return m === 1
    ? `${year - 1}-12`
    : `${year}-${String(m - 1).padStart(2, '0')}`;
}

function semesterWindowOfToday(): {
  label: string;
  start: string;
  endExclusive: string;
} {
  const year = spMonth().slice(0, 4);
  const first = Number(spMonth().slice(5, 7)) <= 6;
  return first
    ? {
        label: `${year}-S1`,
        start: `${year}-01-01`,
        endExclusive: `${year}-07-01`,
      }
    : {
        label: `${year}-S2`,
        start: `${year}-07-01`,
        endExclusive: `${Number(year) + 1}-01-01`,
      };
}

describe('reports & rankings: read models, CSV shape, windows, RBAC (spec 013)', () => {
  let t: TestApp;
  let admin: string;
  let aluno: string;
  let professor: string;
  let tenantId: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    tenantId = await t.academyIdBySlug('alpha-jj');
  });

  afterAll(async () => {
    await t.close();
  });

  /** Tenant-scoped truth queries through the BYPASSRLS pool. */
  const truth = (fn: (tx: any) => Promise<any>): Promise<any> =>
    withPlatform(t.platformDb.db, fn);

  // ── financeiro ───────────────────────────────────────────────────────────

  it('financeiro matches the shipped overview for the current month and runs the materialization pass', async () => {
    const overview = await t
      .http()
      .get('/v1/admin/billing/overview')
      .set(bearer(admin));
    expect(overview.status).toBe(200);

    const res = await t
      .http()
      .get('/v1/admin/reports/financeiro')
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.report).toBe('financeiro');
    expect(res.body.month).toBe(spMonth());
    expect(res.body.materialization).toMatchObject({
      created: expect.any(Number),
      flippedOverdue: expect.any(Number),
      autoSettled: expect.any(Number),
    });

    // Same formulas, same month, same snapshot ⇒ same numbers.
    expect(res.body.summary.receitaCents).toBe(overview.body.receitaMesCents);
    expect(res.body.summary.inadimplenciaPct).toBe(
      overview.body.inadimplenciaPct,
    );

    const { start, endExclusive } = monthWindow(spMonth());
    const [previsto] = await truth((tx) =>
      tx
        .select({
          total: sql<string>`COALESCE(SUM(${charges.amountCents}), 0)`,
        })
        .from(charges)
        .where(
          and(
            eq(charges.tenantId, tenantId),
            inArray(charges.status, ['open', 'overdue']),
            sql`${charges.dueDate} >= ${start}::date`,
            sql`${charges.dueDate} < ${endExclusive}::date`,
          ),
        ),
    );
    expect(res.body.summary.previstoCents).toBe(Number(previsto!.total));

    // Every row touches the month: due in it, competência in it, or paid in it.
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of res.body.rows) {
      const touches =
        (row.dueDate >= start && row.dueDate < endExclusive) ||
        (row.periodStart !== null &&
          row.periodStart >= start &&
          row.periodStart < endExclusive) ||
        (row.paidAt !== null &&
          spDate(new Date(row.paidAt)).slice(0, 7) === spMonth());
      expect(touches, `row ${row.chargeId}`).toBe(true);
    }
  });

  it('financeiro windows to any past month in the tenant timezone', async () => {
    const month = prevMonth();
    const { start, endExclusive } = monthWindow(month);
    const res = await t
      .http()
      .get(`/v1/admin/reports/financeiro?month=${month}`)
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(month);

    const [receita] = await truth((tx) =>
      tx
        .execute(
          sql`
        SELECT COALESCE(SUM(p.amount_cents), 0) AS total FROM payments p
        WHERE p.tenant_id = ${tenantId} AND p.status = 'succeeded'
          AND (p.paid_at AT TIME ZONE ${TZ})::date >= ${start}::date
          AND (p.paid_at AT TIME ZONE ${TZ})::date < ${endExclusive}::date
      `,
        )
        .then((r: any) => r.rows),
    );
    expect(res.body.summary.receitaCents).toBe(Number(receita.total));
    // The seeded previous-cycle mensalidade (paid) is due inside that month.
    const planRow = res.body.rows.find(
      (r: any) =>
        r.origin === 'plan' && r.status === 'paid' && r.periodStart === start,
    );
    expect(planRow).toBeTruthy();
    expect(planRow.paidAt).not.toBeNull();
  });

  it('rejects a malformed month and an unknown report slug', async () => {
    const bad = await t
      .http()
      .get('/v1/admin/reports/financeiro?month=2026-8')
      .set(bearer(admin));
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('validation.failed');

    const unknown = await t
      .http()
      .get('/v1/admin/reports/estoque')
      .set(bearer(admin));
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('resource.not_found');
  });

  // ── frequencia ───────────────────────────────────────────────────────────

  it('frequencia: honest denominators per class; revoked attendances never count', async () => {
    const res = await t
      .http()
      .get('/v1/admin/reports/frequencia')
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.report).toBe('frequencia');
    const { start, endExclusive } = monthWindow(spMonth());

    for (const klass of res.body.classes) {
      const [sessions] = await truth((tx) =>
        tx
          .select({ total: sql<string>`COUNT(*)` })
          .from(classSessions)
          .where(
            and(
              eq(classSessions.tenantId, tenantId),
              eq(classSessions.classId, klass.classId),
              sql`${classSessions.sessionDate} >= ${start}::date`,
              sql`${classSessions.sessionDate} < ${endExclusive}::date`,
            ),
          ),
      );
      expect(klass.sessionsCount, klass.className).toBe(
        Number(sessions!.total),
      );

      for (const student of klass.students) {
        const [active] = await truth((tx) =>
          tx
            .select({ total: sql<string>`COUNT(*)` })
            .from(attendances)
            .innerJoin(
              classSessions,
              eq(classSessions.id, attendances.classSessionId),
            )
            .where(
              and(
                eq(attendances.tenantId, tenantId),
                eq(attendances.studentId, student.studentId),
                isNull(attendances.revokedAt),
                eq(classSessions.classId, klass.classId),
                sql`${classSessions.sessionDate} >= ${start}::date`,
                sql`${classSessions.sessionDate} < ${endExclusive}::date`,
              ),
            ),
        );
        expect(
          student.presencas,
          `${klass.className}/${student.studentName}`,
        ).toBe(Number(active!.total));
        expect(student.faltas).toBe(
          Math.max(klass.sessionsCount - student.presencas, 0),
        );
        expect(student.presencePct).toBe(
          klass.sessionsCount === 0
            ? 0
            : Math.round((student.presencas / klass.sessionsCount) * 100),
        );
      }
    }

    // The revoked-then-rechecked dependent (Kiko) proves the exclusion: the
    // pair carries a revoked row on top of the active one.
    const kids = res.body.classes.find((c: any) => c.className === 'Kids');
    const kiko = kids.students.find((s: any) => s.studentName === 'Kiko Kids');
    expect(kiko).toBeTruthy();
    const [revoked] = await truth((tx) =>
      tx
        .select({ total: sql<string>`COUNT(*)` })
        .from(attendances)
        .where(
          and(
            eq(attendances.tenantId, tenantId),
            eq(attendances.studentId, kiko.studentId),
            sql`${attendances.revokedAt} IS NOT NULL`,
          ),
        ),
    );
    expect(Number(revoked!.total)).toBeGreaterThanOrEqual(1);

    // Ranking fixtures are unenrolled — they never inflate the turma report.
    const adulto = res.body.classes.find(
      (c: any) => c.className === 'Adulto Gi',
    );
    expect(
      adulto.students.some((s: any) => s.studentName.endsWith('Ranking')),
    ).toBe(false);
  });

  // ── inadimplencia ────────────────────────────────────────────────────────

  it('inadimplencia: overdue-open snapshot with days overdue and payer notification counts', async () => {
    // Constructed fixture: a guardian-billed overdue charge whose payer has a
    // login, plus notification rows on both sides of the due date.
    const dueDate = spDate(new Date(Date.now() - 15 * 24 * 3600 * 1000));
    await truth(async (tx) => {
      const [kiko] = await tx
        .select({ id: students.id, guardianId: students.guardianId })
        .from(students)
        .where(
          and(
            eq(students.tenantId, tenantId),
            eq(students.fullName, 'Kiko Kids'),
          ),
        );
      const [renata] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'responsavel@tatame.dev'));
      const [kidsPlan] = await tx
        .select({ id: academyPlans.id })
        .from(academyPlans)
        .where(
          and(
            eq(academyPlans.tenantId, tenantId),
            eq(academyPlans.name, 'Kids Mensal'),
          ),
        );
      // Competência two months back — clear of the seeded cycle keys.
      const base = new Date();
      base.setMonth(base.getMonth() - 2, 1);
      const oldPeriod = `${spDate(base).slice(0, 7)}-01`;
      await tx.insert(charges).values({
        tenantId,
        studentId: kiko!.id,
        guardianId: kiko!.guardianId,
        origin: 'plan',
        academyPlanId: kidsPlan!.id,
        periodStart: oldPeriod,
        periodEnd: oldPeriod,
        amountCents: 15_000,
        dueDate,
        status: 'open',
      });
      await tx.insert(notifications).values([
        {
          tenantId,
          userId: renata!.id,
          category: 'payment',
          title: 'Mensalidade em atraso',
        },
        {
          tenantId,
          userId: renata!.id,
          category: 'payment',
          title: 'Lembrete de pagamento',
        },
        // Different category — never counted.
        {
          tenantId,
          userId: renata!.id,
          category: 'event',
          title: 'Evento novo',
        },
        // Before the due date — never counted.
        {
          tenantId,
          userId: renata!.id,
          category: 'payment',
          title: 'Aviso antigo',
          createdAt: new Date(
            Date.parse(`${dueDate}T00:00:00-03:00`) - 5 * 24 * 3600 * 1000,
          ),
        },
      ]);
    });

    const res = await t
      .http()
      .get('/v1/admin/reports/inadimplencia')
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.report).toBe('inadimplencia');
    expect(res.body.asOf).toBe(spDate());

    // The seeded overdue student (no login anywhere) — honest zero.
    const flavia = res.body.rows.find(
      (r: any) => r.studentName === 'Flavia Fila',
    );
    expect(flavia).toBeTruthy();
    expect(flavia.daysOverdue).toBeGreaterThan(0);
    expect(flavia.notificationsSent).toBe(0);

    // The constructed row: guardian is the payer of record; the count sees
    // exactly the payer's PAYMENT-category rows SINCE the due date (the
    // backdated payment row and the event-category row prove both cuts —
    // seeded notification fixtures for Renata are part of the truth).
    const kiko = res.body.rows.find(
      (r: any) => r.studentName === 'Kiko Kids' && r.dueDate === dueDate,
    );
    expect(kiko).toBeTruthy();
    expect(kiko.guardianName).toBe('Renata Responsavel');
    expect(kiko.daysOverdue).toBe(15);
    const [renataCounts] = await truth((tx) =>
      tx
        .execute(
          sql`
        SELECT
          COUNT(*) FILTER (
            WHERE n.category = 'payment'
              AND n.created_at >= (${dueDate}::date::timestamp AT TIME ZONE ${TZ})
          ) AS since_due,
          COUNT(*) FILTER (WHERE n.category = 'payment') AS all_payment
        FROM notifications n
        JOIN users u ON u.id = n.user_id
        WHERE n.tenant_id = ${tenantId} AND lower(u.email) = 'responsavel@tatame.dev'
      `,
        )
        .then((r: any) => r.rows),
    );
    expect(kiko.notificationsSent).toBe(Number(renataCounts.since_due));
    // The backdated payment row exists and stays out of the count.
    expect(Number(renataCounts.all_payment)).toBeGreaterThan(
      Number(renataCounts.since_due),
    );

    // Totals reconcile with the returned rows.
    expect(res.body.totals.count).toBe(res.body.rows.length);
    expect(res.body.totals.totalCents).toBe(
      res.body.rows.reduce((sum: number, r: any) => sum + r.amountCents, 0),
    );
    // Every row is genuinely overdue-open.
    for (const row of res.body.rows) {
      expect(row.dueDate < spDate()).toBe(true);
      expect(row.daysOverdue).toBeGreaterThan(0);
    }
  });

  // ── graduacoes ───────────────────────────────────────────────────────────

  it('graduacoes: semester window, reversed awards and revocation rows excluded', async () => {
    const res = await t
      .http()
      .get('/v1/admin/reports/graduacoes')
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.report).toBe('graduacoes');
    const semester = semesterWindowOfToday();
    expect(res.body.semester.label).toBe(semester.label);

    // The seeded in-semester belt award (REP.2) keeps the report non-empty.
    const rita = res.body.rows.find(
      (r: any) => r.studentName === 'Rita Ranking',
    );
    expect(rita).toMatchObject({
      kind: 'belt',
      beltName: 'Azul',
      awardedByName: 'Paulo Professor',
    });

    // Reversed award + its revocation row never appear, whatever the window.
    const excluded = await truth((tx) =>
      tx
        .select({
          id: studentGraduations.id,
          reverses: studentGraduations.reversesGraduationId,
        })
        .from(studentGraduations)
        .where(
          and(
            eq(studentGraduations.tenantId, tenantId),
            sql`${studentGraduations.reversesGraduationId} IS NOT NULL`,
          ),
        ),
    );
    expect(excluded.length).toBeGreaterThanOrEqual(1);
    const bannedIds = new Set(excluded.flatMap((r: any) => [r.id, r.reverses]));
    for (const row of res.body.rows) {
      expect(bannedIds.has(row.graduationId)).toBe(false);
      expect(['degree', 'belt']).toContain(row.kind);
      const awardedDay = spDate(new Date(row.awardedAt));
      expect(
        awardedDay >= semester.start && awardedDay < semester.endExclusive,
      ).toBe(true);
    }

    // A month in another (empty) semester maps to that half and returns [].
    const empty = await t
      .http()
      .get('/v1/admin/reports/graduacoes?month=2020-03')
      .set(bearer(admin));
    expect(empty.status).toBe(200);
    expect(empty.body.semester.label).toBe('2020-S1');
    expect(empty.body.rows).toEqual([]);
  });

  // ── loja ─────────────────────────────────────────────────────────────────

  it('loja: month totals exclude canceled and never-paid; pending stays listed', async () => {
    const res = await t.http().get('/v1/admin/reports/loja').set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.report).toBe('loja');

    const { start, endExclusive } = monthWindow(spMonth());
    const monthOrders = await truth((tx) =>
      tx
        .select({
          id: orders.id,
          status: orders.status,
          totalCents: orders.totalCents,
          number: orders.number,
        })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            sql`(${orders.createdAt} AT TIME ZONE ${TZ})::date >= ${start}::date`,
            sql`(${orders.createdAt} AT TIME ZONE ${TZ})::date < ${endExclusive}::date`,
          ),
        ),
    );
    const sold = monthOrders.filter((o: any) =>
      ['paid', 'ready', 'delivered'].includes(o.status),
    );
    expect(res.body.totals.pedidos).toBe(sold.length);
    expect(res.body.totals.vendasCents).toBe(
      sold.reduce((sum: number, o: any) => sum + o.totalCents, 0),
    );

    const canceled = res.body.rows.find((r: any) => r.status === 'canceled');
    expect(canceled).toBeTruthy(); // listed…
    const pending = res.body.rows.find((r: any) => r.status === 'pending');
    expect(pending).toBeTruthy(); // …and pending listed with status too
    // …but neither is in the totals (asserted structurally above).
    expect(res.body.rows.map((r: any) => r.number)).toEqual(
      [...res.body.rows.map((r: any) => r.number)].sort(
        (a: number, b: number) => a - b,
      ),
    );
  });

  // ── CSV (REP.4) ──────────────────────────────────────────────────────────

  it('CSV: BOM + semicolon + pt-BR money + ISO dates + Content-Disposition filename', async () => {
    const res = await t
      .http()
      .get('/v1/admin/reports/financeiro/csv')
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="financeiro-${spMonth()}.csv"`,
    );
    const text = res.text as string;
    expect(text.startsWith('\ufeff')).toBe(true);
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'aluno;origem;competencia;vencimento;status;valor;pago_em',
    );
    // The seeded R$ 180,00 mensalidade renders decimal-comma.
    expect(text).toContain(';180,00;');
    // ISO dates, never localized ones.
    expect(lines[1]).toMatch(/;\d{4}-\d{2}-\d{2};/);
  });

  it('CSV: every report serializes from the same read model, month in the filename', async () => {
    const month = '2020-01';
    const loja = await t
      .http()
      .get(`/v1/admin/reports/loja/csv?month=${month}`)
      .set(bearer(admin));
    expect(loja.status).toBe(200);
    expect(loja.headers['content-disposition']).toBe(
      `attachment; filename="loja-${month}.csv"`,
    );
    const lojaLines = (loja.text as string)
      .slice(1)
      .split('\r\n')
      .filter(Boolean);
    expect(lojaLines).toEqual([
      'pedido;data;comprador;produto;tamanho;quantidade;valor;status',
    ]);

    const freq = await t
      .http()
      .get('/v1/admin/reports/frequencia/csv')
      .set(bearer(admin));
    expect(freq.status).toBe(200);
    expect((freq.text as string).slice(1).split('\r\n')[0]).toBe(
      'turma;aluno;presencas;faltas;percentual',
    );

    // inadimplencia ignores month= — the filename carries the current month.
    const inad = await t
      .http()
      .get('/v1/admin/reports/inadimplencia/csv?month=2020-01')
      .set(bearer(admin));
    expect(inad.headers['content-disposition']).toBe(
      `attachment; filename="inadimplencia-${spMonth()}.csv"`,
    );
  });

  // ── rankings (REP.5) ─────────────────────────────────────────────────────

  /** DB-truth ranking: count desc, name asc (binary), positions 1-based. */
  async function expectedLessonsRanking() {
    const { start, endExclusive } = monthWindow(spMonth());
    const active = await truth((tx) =>
      tx
        .select({
          id: students.id,
          name: students.fullName,
          userId: students.userId,
        })
        .from(students)
        .where(
          and(eq(students.tenantId, tenantId), eq(students.status, 'active')),
        ),
    );
    const counts = await truth((tx) =>
      tx
        .select({
          studentId: attendances.studentId,
          total: sql<string>`COUNT(*)`,
        })
        .from(attendances)
        .innerJoin(
          classSessions,
          eq(classSessions.id, attendances.classSessionId),
        )
        .where(
          and(
            eq(attendances.tenantId, tenantId),
            isNull(attendances.revokedAt),
            sql`${classSessions.sessionDate} >= ${start}::date`,
            sql`${classSessions.sessionDate} < ${endExclusive}::date`,
          ),
        )
        .groupBy(attendances.studentId),
    );
    const byId = new Map(
      counts.map((c: any) => [c.studentId, Number(c.total)]),
    );
    return active
      .map((s: any) => ({ ...s, count: byId.get(s.id) ?? 0 }))
      .sort(
        (a: any, b: any) =>
          b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      )
      .map((row: any, i: number) => ({ ...row, position: i + 1 }));
  }

  it('rankings by=lessons: month window, count-desc + name-asc ties, top 10, me for the aluno', async () => {
    const expected = await expectedLessonsRanking();
    const res = await t
      .http()
      .get('/v1/rankings?by=lessons')
      .set(bearer(aluno));
    expect(res.status).toBe(200);
    expect(res.body.by).toBe('lessons');
    expect(res.body.window.label).toBe(spMonth());
    expect(res.body.totalRanked).toBe(expected.length);

    expect(res.body.top.map((r: any) => [r.position, r.name, r.count])).toEqual(
      expected.slice(0, 10).map((r: any) => [r.position, r.name, r.count]),
    );

    // me is the aluno's own row — position/count straight from the truth.
    const ana = expected.find((r: any) => r.name.startsWith('Ana'));
    expect(res.body.me).toEqual({ position: ana!.position, count: ana!.count });
    for (const row of res.body.top) {
      expect(row.isMe).toBe(row.position === ana!.position);
    }

    // The REP.2 spread keeps the podium distinct once the month has room.
    if (Number(spDate().slice(8, 10)) >= 5) {
      expect(res.body.top[0].count).toBeGreaterThan(res.body.top[1].count);
      expect(res.body.top[1].count).toBeGreaterThan(res.body.top[2].count);
    }
  });

  it('rankings by=events: semester window; pending and canceled-event registrations never count', async () => {
    const res = await t.http().get('/v1/rankings?by=events').set(bearer(aluno));
    expect(res.status).toBe(200);
    expect(res.body.window.label).toBe(semesterWindowOfToday().label);

    // The fixture aluno leads the semester (REP.2 spread) and is flagged você.
    expect(res.body.me!.position).toBe(1);
    expect(res.body.top[0].isMe).toBe(true);
    expect(res.body.top[0].count).toBeGreaterThanOrEqual(3);

    // A confirmed registration to a CANCELED event changes nothing.
    const before = res.body.top[0].count;
    await truth(async (tx) => {
      const [ana] = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.tenantId, tenantId),
            eq(students.fullName, 'Ana Aluna'),
          ),
        );
      const [professorUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'professor@tatame.dev'));
      const [event] = await tx
        .insert(events)
        .values({
          tenantId,
          name: 'Evento Cancelado Fixture',
          bannerPreset: 'event-purple-pink',
          location: 'Tatame',
          startsAt: new Date(Date.now() - 24 * 3600 * 1000),
          status: 'canceled',
          responsibleUserId: professorUser!.id,
          canceledAt: new Date(),
        })
        .returning({ id: events.id });
      await tx.insert(eventRegistrations).values({
        tenantId,
        eventId: event!.id,
        studentId: ana!.id,
        confirmedByUserId: professorUser!.id,
        status: 'confirmed',
      });
    });
    const after = await t
      .http()
      .get('/v1/rankings?by=events')
      .set(bearer(aluno));
    expect(after.body.top[0].count).toBe(before);
  });

  it('rankings: professor sees the same list with me always null', async () => {
    const res = await t
      .http()
      .get('/v1/rankings?by=lessons')
      .set(bearer(professor));
    expect(res.status).toBe(200);
    expect(res.body.me).toBeNull();
    expect(res.body.top.every((r: any) => r.isMe === false)).toBe(true);

    const eventsRes = await t
      .http()
      .get('/v1/rankings?by=events')
      .set(bearer(professor));
    expect(eventsRes.body.me).toBeNull();
  });

  it('rankings: an aluno pushed below the cut still gets me (position > 10, você out of top)', async () => {
    // Ten students whose month count ties-or-beats everyone, with names that
    // sort before "Ana Aluna" — deterministic tie-break pushes her out.
    // Written through the RLS-enforced tenant path (the platform role holds
    // no INSERT grant on the append-only attendances table).
    await withTenant(t.appDb.db, tenantId, async (tx) => {
      const monthSessions = await tx
        .select({ id: classSessions.id })
        .from(classSessions)
        .where(
          and(
            sql`${classSessions.sessionDate} >= ${monthWindow(spMonth()).start}::date`,
            sql`${classSessions.sessionDate} < ${monthWindow(spMonth()).endExclusive}::date`,
          ),
        );
      for (let i = 1; i <= 10; i += 1) {
        const [student] = await tx
          .insert(students)
          .values({
            tenantId,
            fullName: `Aa Rank${String(i).padStart(2, '0')}`,
            birthDate: '1990-01-01',
          })
          .returning({ id: students.id });
        for (const session of monthSessions) {
          await tx.insert(attendances).values({
            tenantId,
            classSessionId: session.id,
            studentId: student!.id,
            method: 'manual',
          });
        }
      }
    });

    const res = await t
      .http()
      .get('/v1/rankings?by=lessons')
      .set(bearer(aluno));
    expect(res.status).toBe(200);
    expect(res.body.top).toHaveLength(10);
    expect(res.body.top.every((r: any) => r.isMe === false)).toBe(true);
    expect(res.body.me).not.toBeNull();
    expect(res.body.me.position).toBeGreaterThan(10);
    // Still consistent with database truth after the mutation.
    const expected = await expectedLessonsRanking();
    const ana = expected.find((r: any) => r.name.startsWith('Ana'));
    expect(res.body.me).toEqual({ position: ana!.position, count: ana!.count });
  });

  // ── RBAC + read-only semantics + contract (REP.8) ────────────────────────

  it('reports are admin-only; rankings exclude guardians and platform roles', async () => {
    const responsavel = (await t.login('responsavel@tatame.dev')).accessToken;
    for (const token of [professor, aluno, responsavel]) {
      for (const path of [
        '/v1/admin/reports/financeiro',
        '/v1/admin/reports/loja/csv',
      ]) {
        const res = await t.http().get(path).set(bearer(token));
        expect(res.status, path).toBe(403);
        expect(res.body.code).toBe('authz.forbidden_role');
      }
    }

    const guardianRanking = await t
      .http()
      .get('/v1/rankings')
      .set(bearer(responsavel));
    expect(guardianRanking.status).toBe(403);
    expect(guardianRanking.body.code).toBe('authz.forbidden_role');

    const owner = (await t.login('owner@tatame.dev')).accessToken;
    const ownerRanking = await t.http().get('/v1/rankings').set(bearer(owner));
    expect(ownerRanking.status).toBe(403);
  });

  it('read-only (delinquent) academies still read reports and rankings', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');
    try {
      const report = await t
        .http()
        .get('/v1/admin/reports/frequencia')
        .set(bearer(admin));
      expect(report.status).toBe(200);
      const csv = await t
        .http()
        .get('/v1/admin/reports/graduacoes/csv')
        .set(bearer(admin));
      expect(csv.status).toBe(200);
      const ranking = await t
        .http()
        .get('/v1/rankings?by=events')
        .set(bearer(aluno));
      expect(ranking.status).toBe(200);
    } finally {
      await t.setAcademyStatus('alpha-jj', 'active');
    }
  });

  it('the new routes are on the OpenAPI contract', async () => {
    const res = await t.http().get('/docs-json');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/v1/admin/reports/{report}',
        '/v1/admin/reports/{report}/csv',
        '/v1/rankings',
        '/v1/aluno/profile',
      ]),
    );
  });
});
