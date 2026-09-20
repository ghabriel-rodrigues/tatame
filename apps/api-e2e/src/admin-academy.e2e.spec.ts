import { auditLogs, memberships, users, withPlatform } from '@tatame/db';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * CFG.7 — the config phase backend end-to-end (spec 011): GET/PUT
 * /v1/admin/academy (branding validation matrix, case normalization,
 * `brand: null` clear, audit trail, RBAC + cross-tenant isolation), typed
 * brand propagation into /auth/me and the public invite landing, the
 * academy-level fan-out gate driven through REAL emitting flows, and the
 * permission matrix member counts against the seeds.
 */
describe('admin academy settings: branding + toggles + permission counts', () => {
  let t: TestApp;
  let admin: string;
  let adminBravo: string;
  let aluno: string;
  let professor: string;
  let responsavel: string;
  let alphaId: string;
  let bravoId: string;

  /** Oceano preset — must match packages/design-system presets verbatim. */
  const OCEANO = { deep: '#14213D', vibrant: '#3A5FA8', accent: '#E63946' };

  const getAcademy = async (token: string) => {
    const res = await t.http().get('/v1/admin/academy').set(bearer(token));
    expect(res.status).toBe(200);
    return res.body;
  };

  const putAcademy = (token: string, body: unknown) =>
    t
      .http()
      .put('/v1/admin/academy')
      .set(bearer(token))
      .send(body as object);

  const feedTitles = async (token: string, title: string) => {
    const res = await t.http().get('/v1/notifications').set(bearer(token));
    expect(res.status).toBe(200);
    return (res.body.notifications as Array<{ title: string }>).filter(
      (n) => n.title === title,
    ).length;
  };

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
    admin = (await t.login('admin@tatame.dev')).accessToken;
    adminBravo = (await t.login('admin.bravo@tatame.dev')).accessToken;
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    responsavel = (await t.login('responsavel@tatame.dev')).accessToken;
    alphaId = await t.academyIdBySlug('alpha-jj');
    bravoId = await t.academyIdBySlug('bravo-bjj');
  });

  afterAll(async () => {
    await t.close();
  });

  // ── read + seeded state ─────────────────────────────────────────────────

  it('GET serves the seeded identity: alpha on the default NULL brand, bravo on Oceano', async () => {
    const alpha = await getAcademy(admin);
    expect(alpha).toMatchObject({
      id: alphaId,
      name: 'Alpha Jiu-Jitsu',
      slug: 'alpha-jj',
      logoUrl: null,
      brand: null,
      autoNotificationsEnabled: true,
    });

    const bravo = await getAcademy(adminBravo);
    expect(bravo).toMatchObject({
      id: bravoId,
      name: 'Bravo BJJ Team',
      slug: 'bravo-bjj',
      brand: OCEANO,
      autoNotificationsEnabled: true,
    });
  });

  // ── validation matrix ───────────────────────────────────────────────────

  it('PUT rejects invalid brands and names with 422, leaving state untouched', async () => {
    const valid = {
      name: 'Alpha Jiu-Jitsu',
      brand: { ...OCEANO },
      autoNotificationsEnabled: true,
    };
    const badBodies: Array<[string, Record<string, unknown>]> = [
      [
        'bad hex (letters out of range)',
        { ...valid, brand: { ...OCEANO, deep: '#GGGGGG' } },
      ],
      ['shorthand hex', { ...valid, brand: { ...OCEANO, vibrant: '#3af' } }],
      ['missing #', { ...valid, brand: { ...OCEANO, accent: 'E63946' } }],
      [
        'partial triplet (accent missing)',
        { ...valid, brand: { deep: '#14213D', vibrant: '#3A5FA8' } },
      ],
      ['partial triplet (only deep)', { ...valid, brand: { deep: '#14213D' } }],
      [
        'brand missing entirely',
        { name: valid.name, autoNotificationsEnabled: true },
      ],
      ['name too short', { ...valid, name: 'A' }],
      ['name too long', { ...valid, name: 'x'.repeat(81) }],
      ['name only whitespace', { ...valid, name: '   ' }],
      ['toggle not boolean', { ...valid, autoNotificationsEnabled: 'yes' }],
    ];
    for (const [label, body] of badBodies) {
      const res = await putAcademy(admin, body);
      expect(res.status, label).toBe(422);
      expect(res.body.code, label).toBe('validation.failed');
    }

    // Nothing stuck: alpha still on the default brand.
    const alpha = await getAcademy(admin);
    expect(alpha.brand).toBeNull();
    expect(alpha.name).toBe('Alpha Jiu-Jitsu');
  });

  // ── RBAC + cross-tenant ─────────────────────────────────────────────────

  it('only the academy admin reaches the settings (RolesGuard matrix)', async () => {
    const owner = (await t.login('owner@tatame.dev')).accessToken;
    for (const [label, token] of [
      ['professor', professor],
      ['aluno', aluno],
      ['responsavel', responsavel],
      ['platform owner', owner],
    ] as const) {
      const get = await t.http().get('/v1/admin/academy').set(bearer(token));
      expect(get.status, `GET as ${label}`).toBe(403);
      expect(get.body.code, `GET as ${label}`).toBe('authz.forbidden_role');

      const put = await putAcademy(token, {
        name: 'Hacked Academy',
        brand: null,
        autoNotificationsEnabled: true,
      });
      expect(put.status, `PUT as ${label}`).toBe(403);
      expect(put.body.code, `PUT as ${label}`).toBe('authz.forbidden_role');
    }
  });

  // ── happy path: save brand, propagation, audit ──────────────────────────

  it('PUT saves name + brand (lowercase normalized to uppercase) and audits the change', async () => {
    const res = await putAcademy(admin, {
      name: '  Alpha Jiu-Jitsu Renovada  ',
      // Lowercase on purpose: the API normalizes, the DB CHECK is uppercase.
      brand: { deep: '#14213d', vibrant: '#3a5fa8', accent: '#e63946' },
      autoNotificationsEnabled: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Alpha Jiu-Jitsu Renovada', // trimmed
      slug: 'alpha-jj', // immutable
      brand: OCEANO, // uppercased
      autoNotificationsEnabled: true,
    });

    // Audit: academy.updated with the admin actor and before/after.
    const [adminUser] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'admin@tatame.dev')),
    );
    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, alphaId),
            eq(auditLogs.action, 'academy.updated'),
          ),
        )
        .orderBy(asc(auditLogs.id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: adminUser!.id,
      impersonatorUserId: null,
      targetType: 'academy',
      targetId: alphaId,
    });
    expect(rows[0]!.metadata).toEqual({
      changes: {
        name: { before: 'Alpha Jiu-Jitsu', after: 'Alpha Jiu-Jitsu Renovada' },
        brand: { before: null, after: OCEANO },
      },
    });
  });

  it('the saved brand propagates typed into /auth/me and the public invite landing', async () => {
    const me = await t.http().get('/v1/auth/me').set(bearer(aluno));
    expect(me.status).toBe(200);
    expect(me.body.academy.theme).toEqual(OCEANO);
    expect(me.body.academy.name).toBe('Alpha Jiu-Jitsu Renovada');

    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin))
      .send({ kind: 'student' });
    expect(invite.status).toBe(201);
    const landing = await t
      .http()
      .get(`/v1/public/invites/${invite.body.token}`);
    expect(landing.status).toBe(200);
    expect(landing.body.academy.theme).toEqual(OCEANO);
    expect(landing.body.academy.name).toBe('Alpha Jiu-Jitsu Renovada');
  });

  it('brands never bleed across tenants: bravo repaints itself, alpha unaffected', async () => {
    const MATA = { deep: '#1B4332', vibrant: '#2D6A4F', accent: '#E8A33D' };
    const res = await putAcademy(adminBravo, {
      name: 'Bravo BJJ Team',
      brand: MATA,
      autoNotificationsEnabled: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.brand).toEqual(MATA);

    // Alpha still wears its own brand; bravo's me context wears Mata.
    expect((await getAcademy(admin)).brand).toEqual(OCEANO);
    const meBravo = await t.http().get('/v1/auth/me').set(bearer(adminBravo));
    expect(meBravo.body.academy.theme).toEqual(MATA);
  });

  it('brand: null clears back to the default (audited with the triplet as before)', async () => {
    const res = await putAcademy(admin, {
      name: 'Alpha Jiu-Jitsu',
      brand: null,
      autoNotificationsEnabled: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.brand).toBeNull();
    expect(res.body.name).toBe('Alpha Jiu-Jitsu');

    const me = await t.http().get('/v1/auth/me').set(bearer(aluno));
    expect(me.body.academy.theme).toBeNull();

    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, alphaId),
            eq(auditLogs.action, 'academy.updated'),
          ),
        )
        .orderBy(asc(auditLogs.id)),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]!.metadata).toEqual({
      changes: {
        name: { before: 'Alpha Jiu-Jitsu Renovada', after: 'Alpha Jiu-Jitsu' },
        brand: { before: OCEANO, after: null },
      },
    });
  });

  // ── fan-out gate (CFG.5) through real emitting flows ────────────────────

  it('auto-notifications off writes ZERO rows for a real paid charge; on resumes', async () => {
    // Toggle the academy gate off (audited like any settings change).
    const off = await putAcademy(admin, {
      name: 'Alpha Jiu-Jitsu',
      brand: null,
      autoNotificationsEnabled: false,
    });
    expect(off.status).toBe(200);
    expect(off.body.autoNotificationsEnabled).toBe(false);

    // Deterministic manual flow: the seeded mandate would auto-settle.
    await t.http().delete('/v1/aluno/wallet/mandate').set(bearer(aluno));
    const before = await feedTitles(aluno, 'Pagamento confirmado');

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

    // The payment settled for real — but the tenant gate held: zero rows.
    await settle();
    expect(await feedTitles(aluno, 'Pagamento confirmado')).toBe(before);

    // Flip the gate back on: the next emitting flow lands rows again.
    const on = await putAcademy(admin, {
      name: 'Alpha Jiu-Jitsu',
      brand: null,
      autoNotificationsEnabled: true,
    });
    expect(on.status).toBe(200);

    const professors = await t
      .http()
      .get('/v1/admin/professors')
      .set(bearer(admin));
    const paulo = professors.body.professors.find(
      (p: { email: string }) => p.email === 'professor@tatame.dev',
    );
    const title = 'Aulão Pós-Gate de Notificações';
    const create = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({
        name: title,
        location: 'Tatame principal',
        startsAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
        responsibleUserId: paulo.userId,
        status: 'published',
      });
    expect(create.status).toBe(201);
    await eventually(async () => {
      expect(await feedTitles(aluno, title)).toBe(1);
      expect(await feedTitles(responsavel, title)).toBe(1);
    });
  });

  // ── permission matrix member counts (CFG.6) ─────────────────────────────

  it('GET /admin/permissions carries per-role ACTIVE member counts matching the seeds', async () => {
    const alpha = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(admin));
    expect(alpha.status).toBe(200);
    // Alpha seeds: professor@ + multi@ teach; aluno@ studies; responsavel@ guards.
    expect(alpha.body.memberCounts).toEqual({
      professor: 2,
      student: 1,
      guardian: 1,
    });
    expect(alpha.body.permissions.length).toBeGreaterThan(0);

    // Bravo seeds: multi@ is the only professor; no student/guardian logins.
    const bravo = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(adminBravo));
    expect(bravo.body.memberCounts).toEqual({
      professor: 1,
      student: 0,
      guardian: 0,
    });

    // Counts are of ACTIVE memberships only: suspend bravo's professor row
    // out-of-band and the header count drops.
    await withPlatform(t.platformDb.db, (tx) =>
      tx
        .update(memberships)
        .set({ status: 'suspended' })
        .where(
          and(
            eq(memberships.tenantId, bravoId),
            eq(memberships.role, 'professor'),
          ),
        ),
    );
    try {
      const suspended = await t
        .http()
        .get('/v1/admin/permissions')
        .set(bearer(adminBravo));
      expect(suspended.body.memberCounts).toEqual({
        professor: 0,
        student: 0,
        guardian: 0,
      });
    } finally {
      await withPlatform(t.platformDb.db, (tx) =>
        tx
          .update(memberships)
          .set({ status: 'active' })
          .where(
            and(
              eq(memberships.tenantId, bravoId),
              eq(memberships.role, 'professor'),
            ),
          ),
      );
    }

    // The PUT response carries the same counts (single DTO, truthful shape).
    const put = await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin))
      .send({
        entries: [{ role: 'professor', key: 'invites.create', allowed: true }],
      });
    expect(put.status).toBe(200);
    expect(put.body.memberCounts).toEqual({
      professor: 2,
      student: 1,
      guardian: 1,
    });
  });
});
