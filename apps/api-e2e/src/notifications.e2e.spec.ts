import { NotificationsFanoutListener } from '@org/api';
import {
  belts,
  guardians,
  memberships,
  notifications,
  students,
  users,
  withPlatform,
} from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * NOT.6 — the notifications phase end-to-end (spec 010): fan-out asserted by
 * driving the REAL emitting flows (materialization, simulate payment, award
 * endpoint, publish/announce/cancel, roll-call check-in, order lifecycle) and
 * reading GET /v1/notifications — never by poking the listener directly. Plus
 * the read API (cursor, unread arithmetic, mark-read semantics), the mute
 * contract (rows insert, count 0), RBAC/RLS isolation, the read-only bypass
 * and the listener-failure isolation story (20).
 *
 * Fan-out is post-commit and asynchronous relative to the HTTP response, so
 * assertions on new rows go through the `eventually` poll helper.
 */
describe('notifications: fan-out through real flows + read API', () => {
  let t: TestApp;
  let aluno: string;
  let professor: string;
  let responsavel: string;
  let admin: string;
  let adminBravo: string;
  let alphaId: string;
  let bravoId: string;

  const feed = async (token: string, cursor?: string) => {
    const res = await t
      .http()
      .get(
        `/v1/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      )
      .set(bearer(token));
    expect(res.status).toBe(200);
    return res.body as { notifications: any[]; nextCursor: string | null };
  };

  const countTitled = async (token: string, title: string) =>
    (await feed(token)).notifications.filter((n) => n.title === title).length;

  /** Fan-out runs post-commit off the request path — poll until it lands. */
  const eventually = async (
    assert: () => Promise<void>,
    timeoutMs = 5_000,
  ): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await assert();
        return;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  };

  /** A short settle window for negative assertions (nothing should land). */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

  beforeAll(async () => {
    t = await createTestApp();
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    responsavel = (await t.login('responsavel@tatame.dev')).accessToken;
    admin = (await t.login('admin@tatame.dev')).accessToken;
    adminBravo = (await t.login('admin.bravo@tatame.dev')).accessToken;
    alphaId = await t.academyIdBySlug('alpha-jj');
    bravoId = await t.academyIdBySlug('bravo-bjj');
  });

  afterAll(async () => {
    await t.setAcademyStatus('alpha-jj', 'active');
    await t.close();
  });

  // ── seeded feed + cursor pagination ─────────────────────────────────────

  it('serves the seeded feed newest-first with render-ready rows', async () => {
    const body = await feed(aluno);
    expect(body.notifications.length).toBeGreaterThanOrEqual(5);
    const stamps = body.notifications.map((n: any) =>
      new Date(n.createdAt).getTime(),
    );
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);

    const categories = new Set(body.notifications.map((n: any) => n.category));
    for (const category of ['payment', 'event', 'graduation', 'store']) {
      expect(categories).toContain(category);
    }
    const paid = body.notifications.find(
      (n: any) => n.title === 'Pagamento confirmado',
    );
    expect(paid).toMatchObject({
      category: 'payment',
      chip: 'R$',
      route: 'wallet',
    });
    expect(paid.readAt).toBeTruthy();
  });

  it('pages with a keyset cursor: no overlap, stable order, null at the end', async () => {
    // Grow bravo admin's feed past one page (out-of-band setup rows).
    const [bruno] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'admin.bravo@tatame.dev')),
    );
    await withPlatform(t.platformDb.db, (tx) =>
      tx.insert(notifications).values(
        Array.from({ length: 32 }, (_, i) => ({
          tenantId: bravoId,
          userId: bruno!.id,
          category: 'store' as const,
          chip: null,
          title: `Página ${i}`,
          body: null,
          route: null,
          createdAt: new Date(Date.now() - (i + 100) * 60_000),
        })),
      ),
    );

    const page1 = await feed(adminBravo);
    expect(page1.notifications).toHaveLength(30);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await feed(adminBravo, page1.nextCursor!);
    expect(page2.notifications.length).toBeGreaterThanOrEqual(5); // 32 synthetic + 3 seeded
    expect(page2.nextCursor).toBeNull();

    const ids1 = new Set(page1.notifications.map((n: any) => n.id));
    for (const row of page2.notifications) expect(ids1.has(row.id)).toBe(false);

    const malformed = await t
      .http()
      .get('/v1/notifications?cursor=not-a-cursor')
      .set(bearer(adminBravo));
    expect(malformed.status).toBe(422);
  });

  // ── billing fan-out (plan origin) ───────────────────────────────────────

  it('paying a plan charge notifies the payer (real Pix + simulate flow)', async () => {
    // Deterministic manual flow: the seeded mandate would auto-settle.
    await t.http().delete('/v1/aluno/wallet/mandate').set(bearer(aluno));
    const before = await countTitled(aluno, 'Pagamento confirmado');

    const wallet = await t.http().get('/v1/aluno/wallet').set(bearer(aluno));
    expect(wallet.status).toBe(200);
    const chargeId = wallet.body.currentCharge.id;

    const pay = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${chargeId}/payments`)
      .set(bearer(aluno))
      .send({ method: 'pix' });
    expect(pay.status).toBe(201);
    const simulate = await t
      .http()
      .post(`/v1/billing/payments/${pay.body.payment.id}/simulate`)
      .set(bearer(aluno));
    expect(simulate.status).toBe(200);

    await eventually(async () => {
      expect(await countTitled(aluno, 'Pagamento confirmado')).toBe(before + 1);
    });
    const row = (await feed(aluno)).notifications.find(
      (n: any) => n.title === 'Pagamento confirmado' && n.readAt === null,
    );
    expect(row).toMatchObject({
      category: 'payment',
      chip: 'R$',
      route: 'wallet',
    });
    expect(row.body).toMatch(/^Mensalidade de .+ · R\$ 180,00$/);
  });

  it("materializing a fresh student's first charge notifies them (invite + wallet open)", async () => {
    const plans = await t
      .http()
      .get('/v1/admin/billing/plans')
      .set(bearer(admin));
    const mensal = plans.body.plans.find((p: any) => p.name === 'Mensal');

    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin))
      .send({ kind: 'student', academyPlanId: mensal.id });
    expect(invite.status).toBe(201);
    const accept = await t
      .http()
      .post(`/v1/public/invites/${invite.body.token}/accept`)
      .send({
        email: 'notifee@tatame.dev',
        password: 'notifee-pass-123',
        fullName: 'Nina Notificada',
        birthDate: '1998-05-05',
      });
    expect(accept.status).toBe(201);

    const nina = (await t.login('notifee@tatame.dev', 'notifee-pass-123'))
      .accessToken;
    const wallet = await t.http().get('/v1/aluno/wallet').set(bearer(nina));
    expect(wallet.status).toBe(200);

    await eventually(async () => {
      const rows = (await feed(nina)).notifications;
      const created = rows.find((n: any) =>
        /^Mensalidade de .+ disponível$/.test(n.title),
      );
      expect(created).toBeTruthy();
      expect(created).toMatchObject({
        category: 'payment',
        chip: 'R$',
        route: 'wallet',
      });
      expect(created.body).toMatch(/^Vence em \d{2}\/\d{2} · R\$ 180,00$/);
    });
  });

  // ── events fan-out ──────────────────────────────────────────────────────

  let professorUserId: string;

  it('publishing an event notifies every member once (dedup) and no admin', async () => {
    const professors = await t
      .http()
      .get('/v1/admin/professors')
      .set(bearer(admin));
    professorUserId = professors.body.professors.find(
      (p: any) => p.email === 'professor@tatame.dev',
    ).userId;

    // Out-of-band: make the professor dual-role (professor + student) so the
    // dedup-by-user contract is actually exercised.
    await withPlatform(t.platformDb.db, (tx) =>
      tx
        .insert(memberships)
        .values({ tenantId: alphaId, userId: professorUserId, role: 'student' })
        .onConflictDoNothing(),
    );

    const title = 'Treino Beneficente de Notificações';
    const create = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({
        name: title,
        location: 'Tatame principal',
        startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        priceCents: 2_500,
        responsibleUserId: professorUserId,
      });
    expect(create.status).toBe(201);
    const publish = await t
      .http()
      .post(`/v1/admin/events/${create.body.id}/publish`)
      .set(bearer(admin));
    expect(publish.status).toBe(200);

    await eventually(async () => {
      expect(await countTitled(aluno, title)).toBe(1);
      expect(await countTitled(professor, title)).toBe(1); // dedup: 2 roles, 1 row
      expect(await countTitled(responsavel, title)).toBe(1);
    });
    await settle();
    expect(await countTitled(admin, title)).toBe(0); // admins are excluded

    const row = (await feed(aluno)).notifications.find(
      (n: any) => n.title === title,
    );
    expect(row.category).toBe('event');
    expect(row.route).toMatch(/^event\//);
    expect(row.chip).toMatch(/^\d{1,2}$/);
    expect(row.body).toMatch(
      /^\d{2}\/\d{2} às \d{2}:\d{2} — confirme sua presença · R\$ 25,00$/,
    );
  });

  it('an event-origin payment confirms the inscription and does NOT double-notify as a mensalidade', async () => {
    const title = 'Seminário Pago de Notificações';
    const create = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({
        name: title,
        location: 'Tatame principal',
        startsAt: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
        priceCents: 6_000,
        responsibleUserId: professorUserId,
        status: 'published',
      });
    expect(create.status).toBe(201);
    const eventId = create.body.id;

    const paidBefore = await countTitled(aluno, 'Pagamento confirmado');

    const register = await t
      .http()
      .post(`/v1/aluno/events/${eventId}/registration`)
      .set(bearer(aluno))
      .send({});
    expect(register.status).toBe(201);
    const pay = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${register.body.chargeId}/payments`)
      .set(bearer(aluno))
      .send({ method: 'pix' });
    expect(pay.status).toBe(201);
    const simulate = await t
      .http()
      .post(`/v1/billing/payments/${pay.body.payment.id}/simulate`)
      .set(bearer(aluno));
    expect(simulate.status).toBe(200);

    await eventually(async () => {
      expect(await countTitled(aluno, `Presença confirmada — ${title}`)).toBe(
        1,
      );
    });
    await settle();
    // The origin filter pinned: event money never renders as a mensalidade.
    expect(await countTitled(aluno, 'Pagamento confirmado')).toBe(paidBefore);
  });

  it('Comunicar reaches exactly the inscritos', async () => {
    const list = await t.http().get('/v1/admin/events').set(bearer(admin));
    const openMat = list.body.events.find(
      (e: any) => e.name === 'Open Mat de Verao',
    );

    const announce = await t
      .http()
      .post(`/v1/admin/events/${openMat.id}/announce`)
      .set(bearer(admin));
    expect(announce.status).toBe(202);
    expect(announce.body.recipients).toBeGreaterThanOrEqual(2);

    const title = 'Lembrete: Open Mat de Verao';
    await eventually(async () => {
      // Seeded inscritos: Ana (self) + the guardian-confirmed dependent.
      expect(await countTitled(aluno, title)).toBe(1);
      expect(await countTitled(responsavel, title)).toBe(1);
    });
    await settle();
    expect(await countTitled(professor, title)).toBe(0); // not registered
  });

  it('canceling an event notifies its registered audience with the refund copy', async () => {
    const list = await t.http().get('/v1/admin/events').set(bearer(admin));
    const exame = list.body.events.find(
      (e: any) => e.name === 'Exame de Faixa',
    );

    const cancel = await t
      .http()
      .post(`/v1/admin/events/${exame.id}/cancel`)
      .set(bearer(admin));
    expect(cancel.status).toBe(200);

    const title = 'Exame de Faixa foi cancelado';
    await eventually(async () => {
      expect(await countTitled(aluno, title)).toBe(1); // settled inscrito
      expect(await countTitled(responsavel, title)).toBe(1); // pending dependent
    });
    const row = (await feed(aluno)).notifications.find(
      (n: any) => n.title === title,
    );
    expect(row.body).toBe(
      'Inscrições canceladas — pagamentos serão estornados',
    );
  });

  // ── attendance fan-out (guardian of minors only) ────────────────────────

  /** Roll-call mark that tolerates the seeded already-checked-in state. */
  const markPresent = async (classId: string, studentId: string) => {
    const open = await t
      .http()
      .post(`/v1/professor/classes/${classId}/roll-call`)
      .set(bearer(professor));
    expect(open.status).toBe(200);
    const sessionId = open.body.session.id;

    let mark = await t
      .http()
      .post(`/v1/professor/sessions/${sessionId}/attendances`)
      .set(bearer(professor))
      .send({ studentId });
    expect(mark.status).toBe(200);
    if (mark.body.status === 'already_checked_in') {
      // Same-day professor revoke, then a fresh (event-emitting) re-mark.
      const revoke = await t
        .http()
        .post(`/v1/professor/attendances/${mark.body.attendance.id}/revoke`)
        .set(bearer(professor))
        .send({});
      expect(revoke.status).toBe(200);
      mark = await t
        .http()
        .post(`/v1/professor/sessions/${sessionId}/attendances`)
        .set(bearer(professor))
        .send({ studentId });
      expect(mark.body.status).toBe('checked_in');
    }
  };

  it("a minor's check-in notifies the guardian; an adult's notifies nobody", async () => {
    const roster = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({
          id: students.id,
          fullName: students.fullName,
          guardianId: students.guardianId,
        })
        .from(students)
        .where(eq(students.tenantId, alphaId)),
    );
    const kiko = roster.find((s) => s.fullName === 'Kiko Kids')!;
    const ana = roster.find((s) => s.fullName === 'Ana Aluna')!;

    const classes = await t.http().get('/v1/admin/classes').set(bearer(admin));
    const kidsClassId = classes.body.classes.find(
      (c: any) => c.name === 'Kids',
    ).id;
    const adultoClassId = classes.body.classes.find(
      (c: any) => c.name === 'Adulto Gi',
    ).id;

    const attendanceRowsOf = async (token: string) =>
      (await feed(token)).notifications.filter(
        (n: any) => n.category === 'attendance',
      ).length;
    const guardianBefore = await attendanceRowsOf(responsavel);

    await markPresent(kidsClassId, kiko.id);
    await eventually(async () => {
      expect(await attendanceRowsOf(responsavel)).toBe(guardianBefore + 1);
    });
    const row = (await feed(responsavel)).notifications.find(
      (n: any) =>
        n.category === 'attendance' &&
        n.readAt === null &&
        n.title === 'Kiko Kids fez check-in',
    );
    expect(row).toMatchObject({ chip: 'KK', route: null });
    expect(row.body).toMatch(/^Presença registrada às \d{2}:\d{2}$/);

    // Ana is an adult with no guardian — her manual mark fans out to nobody.
    const anaBefore = await attendanceRowsOf(aluno);
    await markPresent(adultoClassId, ana.id);
    await settle();
    expect(await attendanceRowsOf(aluno)).toBe(anaBefore);
  });

  // ── store fan-out ───────────────────────────────────────────────────────

  const buyAndSettle = async (
    productName: string,
    quantity: number,
    size: string | null,
  ) => {
    const vitrine = await t.http().get('/v1/store/products').set(bearer(aluno));
    const product = vitrine.body.products.find(
      (p: any) => p.name === productName,
    );
    expect(product).toBeTruthy();

    const order = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: product.id, quantity, ...(size ? { size } : {}) });
    expect(order.status).toBe(201);
    const pay = await t
      .http()
      .post(`/v1/store/charges/${order.body.chargeId}/payments`)
      .set(bearer(aluno))
      .send({ method: 'pix' });
    expect(pay.status).toBe(201);
    const simulate = await t
      .http()
      .post(`/v1/billing/payments/${pay.body.payment.id}/simulate`)
      .set(bearer(aluno));
    expect(simulate.status).toBe(200);
    return order.body.order.number as number;
  };

  let mochilaOrderId: string;
  let mochilaNumber: number;

  it('a paid order notifies the buyer; the threshold crossing alerts the admins', async () => {
    // Mochila: stock 8, threshold 5 — qty 4 crosses on settlement (8 → 4).
    mochilaNumber = await buyAndSettle('Mochila de Treino', 4, null);

    await eventually(async () => {
      expect(await countTitled(aluno, `Pedido #${mochilaNumber} pago`)).toBe(1);
      expect(await countTitled(admin, 'Estoque baixo: Mochila de Treino')).toBe(
        1,
      );
    });
    const paidRow = (await feed(aluno)).notifications.find(
      (n: any) => n.title === `Pedido #${mochilaNumber} pago`,
    );
    expect(paidRow).toMatchObject({
      category: 'store',
      chip: 'R$',
      route: 'orders',
    });
    expect(paidRow.body).toBe(
      'Mochila de Treino — retire na recepção da academia',
    );

    const lowStock = (await feed(admin)).notifications.find(
      (n: any) => n.title === 'Estoque baixo: Mochila de Treino',
    );
    expect(lowStock).toMatchObject({
      category: 'store',
      chip: '!',
      route: 'store',
    });
    expect(lowStock.body).toBe('4 unidades restantes (alerta em 5)');
    await settle();
    expect(await countTitled(aluno, 'Estoque baixo: Mochila de Treino')).toBe(
      0,
    ); // admins only

    const board = await t
      .http()
      .get('/v1/admin/store/orders')
      .set(bearer(admin));
    mochilaOrderId = board.body.orders.find(
      (o: any) => o.number === mochilaNumber,
    ).id;
  });

  it('ready and delivered transitions notify the buyer with the board copy', async () => {
    const ready = await t
      .http()
      .post(`/v1/admin/store/orders/${mochilaOrderId}/status`)
      .set(bearer(admin))
      .send({ status: 'ready' });
    expect(ready.status).toBe(200);
    await eventually(async () => {
      expect(
        await countTitled(
          aluno,
          `Pedido #${mochilaNumber} pronto para retirada`,
        ),
      ).toBe(1);
    });

    const delivered = await t
      .http()
      .post(`/v1/admin/store/orders/${mochilaOrderId}/status`)
      .set(bearer(admin))
      .send({ status: 'delivered' });
    expect(delivered.status).toBe(200);
    await eventually(async () => {
      expect(
        await countTitled(aluno, `Pedido #${mochilaNumber} entregue`),
      ).toBe(1);
    });
    const chips = (await feed(aluno)).notifications
      .filter(
        (n: any) =>
          n.title.startsWith(`Pedido #${mochilaNumber} `) &&
          n.title !== `Pedido #${mochilaNumber} pago`,
      )
      .map((n: any) => n.chip);
    expect(chips).toEqual([`#${mochilaNumber}`, `#${mochilaNumber}`]);
  });

  it('an admin refund-cancel notifies the buyer; a buyer self-cancel stays silent', async () => {
    const refundedNumber = await buyAndSettle('Camiseta da Academia', 1, 'M');
    const board = await t
      .http()
      .get('/v1/admin/store/orders')
      .set(bearer(admin));
    const orderId = board.body.orders.find(
      (o: any) => o.number === refundedNumber,
    ).id;

    const cancel = await t
      .http()
      .post(`/v1/admin/store/orders/${orderId}/status`)
      .set(bearer(admin))
      .send({ status: 'canceled' });
    expect(cancel.status).toBe(200);
    await eventually(async () => {
      expect(
        await countTitled(aluno, `Pedido #${refundedNumber} cancelado`),
      ).toBe(1);
    });
    const row = (await feed(aluno)).notifications.find(
      (n: any) => n.title === `Pedido #${refundedNumber} cancelado`,
    );
    expect(row.body).toBe('Estorno do Pix em até 1 dia útil');

    // Buyer cancel of a still-pending order: money never moved — not news.
    const vitrine = await t.http().get('/v1/store/products').set(bearer(aluno));
    const faixa = vitrine.body.products.find(
      (p: any) => p.name === 'Faixa Oficial',
    );
    const pending = await t
      .http()
      .post('/v1/store/orders')
      .set(bearer(aluno))
      .send({ productId: faixa.id, quantity: 1, size: 'A1' });
    expect(pending.status).toBe(201);
    const pendingNumber = pending.body.order.number;
    const drop = await t
      .http()
      .delete(`/v1/store/orders/${pending.body.order.id}`)
      .set(bearer(aluno));
    expect(drop.status).toBe(204);
    await settle();
    expect(await countTitled(aluno, `Pedido #${pendingNumber} cancelado`)).toBe(
      0,
    );
  });

  // ── graduation fan-out ──────────────────────────────────────────────────

  it('an award notifies the student, and the guardian for a minor; revocations and initial belts stay silent', async () => {
    // Ana: Azul with 2 valid graus (GRD.5 fixture) → the next is the 3º.
    const roster = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: students.id, fullName: students.fullName })
        .from(students)
        .where(eq(students.tenantId, alphaId)),
    );
    const ana = roster.find((s) => s.fullName === 'Ana Aluna')!;
    const kiko = roster.find((s) => s.fullName === 'Kiko Kids')!;

    const anaAward = await t
      .http()
      .post(`/v1/professor/students/${ana.id}/graduations`)
      .set(bearer(professor))
      .send({ kind: 'degree' });
    expect(anaAward.status).toBe(201);
    await eventually(async () => {
      expect(await countTitled(aluno, 'Você recebeu o 3º grau')).toBe(1);
    });
    const anaRow = (await feed(aluno)).notifications.find(
      (n: any) => n.title === 'Você recebeu o 3º grau',
    );
    expect(anaRow).toMatchObject({
      category: 'graduation',
      chip: '3º',
      route: 'graduation',
    });
    expect(anaRow.body).toBe('Registrado pelo Prof. Paulo Professor');

    // Kiko has no login — only the guardian variant lands, faixa included.
    const kikoAward = await t
      .http()
      .post(`/v1/professor/students/${kiko.id}/graduations`)
      .set(bearer(professor))
      .send({ kind: 'degree' });
    expect(kikoAward.status).toBe(201);
    await eventually(async () => {
      const rows = (await feed(responsavel)).notifications.filter(
        (n: any) =>
          n.category === 'graduation' &&
          /^Kiko Kids recebeu o 1º grau na faixa .+$/.test(n.title),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].chip).toBe('1º');
    });

    // Revocation: audit-only — a correction is not news.
    const gradRowsOf = async (token: string) =>
      (await feed(token)).notifications.filter(
        (n: any) => n.category === 'graduation',
      ).length;
    const before = await gradRowsOf(aluno);
    const revoke = await t
      .http()
      .post(`/v1/admin/graduations/${anaAward.body.graduation.id}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'Lançado em teste' });
    expect(revoke.status).toBe(200);
    await settle();
    expect(await gradRowsOf(aluno)).toBe(before);

    // Initial belt at creation: setup, not news — the guardian hears nothing.
    const guardianBefore = await gradRowsOf(responsavel);
    const [azul] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select({ id: belts.id }).from(belts).where(eq(belts.name, 'Azul')),
    );
    const [renataGuardian] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: guardians.id })
        .from(guardians)
        .where(
          and(
            eq(guardians.tenantId, alphaId),
            eq(guardians.fullName, 'Renata Responsavel'),
          ),
        ),
    );
    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({
        fullName: 'Novo Notificado',
        birthDate: '2015-02-02',
        guardianId: renataGuardian!.id,
        initialBeltId: azul!.id,
      });
    expect(created.status).toBe(201);
    await settle();
    expect(await gradRowsOf(responsavel)).toBe(guardianBefore);
  });

  // ── mute semantics ──────────────────────────────────────────────────────

  it('mute zeroes the badge while rows keep inserting; re-enabling restores the truth', async () => {
    const settings = await t
      .http()
      .get('/v1/notifications/settings')
      .set(bearer(responsavel));
    expect(settings.status).toBe(200);
    expect(settings.body).toEqual({ enabled: true });

    const mute = await t
      .http()
      .put('/v1/notifications/settings')
      .set(bearer(responsavel))
      .send({ enabled: false });
    expect(mute.status).toBe(200);
    expect(mute.body).toEqual({ enabled: false });

    const muted = await t
      .http()
      .get('/v1/notifications/unread-count')
      .set(bearer(responsavel));
    expect(muted.body).toEqual({ count: 0 });

    // Fan-out is mute-blind: drive a real flow, the row still lands.
    const classes = await t.http().get('/v1/admin/classes').set(bearer(admin));
    const kidsClassId = classes.body.classes.find(
      (c: any) => c.name === 'Kids',
    ).id;
    const [lara] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.tenantId, alphaId),
            eq(students.fullName, 'Lara Kids'),
          ),
        ),
    );
    const before = await countTitled(responsavel, 'Lara Kids fez check-in');
    await markPresent(kidsClassId, lara!.id);
    await eventually(async () => {
      expect(await countTitled(responsavel, 'Lara Kids fez check-in')).toBe(
        before + 1,
      );
    });
    const stillMuted = await t
      .http()
      .get('/v1/notifications/unread-count')
      .set(bearer(responsavel));
    expect(stillMuted.body).toEqual({ count: 0 });

    const unmute = await t
      .http()
      .put('/v1/notifications/settings')
      .set(bearer(responsavel))
      .send({ enabled: true });
    expect(unmute.status).toBe(200);
    const restored = await t
      .http()
      .get('/v1/notifications/unread-count')
      .set(bearer(responsavel));
    expect(restored.body.count).toBeGreaterThan(0);
  });

  // ── read semantics + isolation ──────────────────────────────────────────

  it('mark-read is idempotent and arithmetic; read-all clears the badge', async () => {
    const countOf = async () =>
      (await t.http().get('/v1/notifications/unread-count').set(bearer(aluno)))
        .body.count;
    const before = await countOf();
    expect(before).toBeGreaterThan(0);

    const unread = (await feed(aluno)).notifications.find(
      (n: any) => n.readAt === null,
    );
    const read = await t
      .http()
      .post(`/v1/notifications/${unread.id}/read`)
      .set(bearer(aluno));
    expect(read.status).toBe(200);
    expect(read.body.notification.readAt).toBeTruthy();
    expect(await countOf()).toBe(before - 1);

    // Idempotent: same row again, same shape, no arithmetic drift.
    const again = await t
      .http()
      .post(`/v1/notifications/${unread.id}/read`)
      .set(bearer(aluno));
    expect(again.status).toBe(200);
    expect(again.body.notification.readAt).toBe(read.body.notification.readAt);
    expect(await countOf()).toBe(before - 1);

    const all = await t
      .http()
      .post('/v1/notifications/read-all')
      .set(bearer(aluno));
    expect(all.status).toBe(200);
    expect(all.body.updated).toBe(before - 1);
    expect(await countOf()).toBe(0);
  });

  it('feeds are personal and tenant-scoped: same-tenant peers and foreign tenants both 404', async () => {
    const anaRow = (await feed(aluno)).notifications[0];

    // Another member of the same academy can never read (or flip) my rows.
    const professorIds = new Set(
      (await feed(professor)).notifications.map((n: any) => n.id),
    );
    expect(professorIds.has(anaRow.id)).toBe(false);
    const peer = await t
      .http()
      .post(`/v1/notifications/${anaRow.id}/read`)
      .set(bearer(professor));
    expect(peer.status).toBe(404);

    // Cross-tenant: alpha ids are invisible in bravo (RLS backstop, 404).
    const foreign = await t
      .http()
      .post(`/v1/notifications/${anaRow.id}/read`)
      .set(bearer(adminBravo));
    expect(foreign.status).toBe(404);

    // Platform personas carry no tenant context — no bell in v1.
    const owner = (await t.login('owner@tatame.dev')).accessToken;
    const platform = await t.http().get('/v1/notifications').set(bearer(owner));
    expect(platform.status).toBe(403);
  });

  it('mark-read and settings pass through read-only mode (@BypassReadOnly)', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');
    try {
      const list = await t.http().get('/v1/notifications').set(bearer(aluno));
      expect(list.status).toBe(200);

      const all = await t
        .http()
        .post('/v1/notifications/read-all')
        .set(bearer(aluno));
      expect(all.status).toBe(200);

      const flip = await t
        .http()
        .put('/v1/notifications/settings')
        .set(bearer(aluno))
        .send({ enabled: true });
      expect(flip.status).toBe(200);
    } finally {
      await t.setAcademyStatus('alpha-jj', 'active');
    }
  });

  // ── listener failure isolation (story 20) ───────────────────────────────

  it('a listener failure logs and never breaks the emitting flow', async () => {
    const listener = t.app.get(NotificationsFanoutListener);
    const boom = vi
      .spyOn(listener, 'write')
      .mockRejectedValue(new Error('fan-out boom'));
    try {
      const title = 'Evento do Listener Quebrado';
      const create = await t
        .http()
        .post('/v1/admin/events')
        .set(bearer(admin))
        .send({
          name: title,
          location: 'Tatame principal',
          startsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
          responsibleUserId: professorUserId,
          status: 'published',
        });
      // The emitting flow commits and answers 2xx regardless of the fan-out.
      expect(create.status).toBe(201);
      await settle();
      expect(await countTitled(aluno, title)).toBe(0);
      expect(boom).toHaveBeenCalled();
    } finally {
      boom.mockRestore();
    }
  });
});
