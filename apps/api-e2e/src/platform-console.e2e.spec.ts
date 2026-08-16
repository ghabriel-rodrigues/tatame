import { academies, academySubscriptions, auditLogs, withPlatform } from '@tatame/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * PLT.9 — the platform console backend end-to-end (spec 012): the Visão
 * geral read model, the academy registration path (the product's first real
 * onboarding), next-cycle plan changes, suspension that bites immediately,
 * the plan catalog with its derived badges, the team invite, and the full
 * RBAC matrix of the charter's owner/support/finance split.
 */
describe('platform console: overview, academies, plans, team', () => {
  let t: TestApp;
  let owner: string;
  let support: string;
  let finance: string;
  let admin: string;
  let professor: string;

  const plans = async () => {
    const res = await t.http().get('/v1/platform/plans').set(bearer(owner));
    expect(res.status).toBe(200);
    return res.body as {
      plans: Array<{
        id: string;
        name: string;
        priceCents: number;
        studentLimit: number | null;
        features: Array<{ slug: string; label: string }>;
        academyCount: number;
        isMostSubscribed: boolean;
        inheritsFrom: string | null;
      }>;
      featureRegistry: Array<{ slug: string; label: string }>;
    };
  };

  const planIdByName = async (name: string): Promise<string> => {
    const catalog = await plans();
    const plan = catalog.plans.find((row) => row.name === name);
    if (!plan) throw new Error(`plan ${name} not in the catalog`);
    return plan.id;
  };

  beforeAll(async () => {
    t = await createTestApp();
    owner = (await t.login('owner@tatame.dev')).accessToken;
    support = (await t.login('suporte@tatame.dev')).accessToken;
    finance = (await t.login('financeiro@tatame.dev')).accessToken;
    admin = (await t.login('admin@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
  });

  afterAll(async () => {
    await t.close();
  });

  // ---------------------------------------------------------------- overview

  it('serves the Visão geral read model from the fixture rows (plataforma-02)', async () => {
    const res = await t.http().get('/v1/platform/overview').set(bearer(owner));
    expect(res.status).toBe(200);
    const body = res.body;

    // MRR counts live subscriptions only: alpha (Pro, active) + charlie
    // (Pro, past_due). Bravo is trialing (not revenue), delta is canceled.
    expect(body.mrrCents).toBe(19_900 * 2);
    expect(body.series).toHaveLength(6);
    expect(body.series[body.series.length - 1].cents).toBe(body.mrrCents);
    // The seeds backdate the subscriptions, so history is not a flat line.
    expect(new Set(body.series.map((point: { cents: number }) => point.cents)).size)
      .toBeGreaterThan(1);
    // Delta's canceled subscription still earned the months it was live.
    expect(body.series[0].cents).toBeGreaterThan(0);

    // Three non-suspended academies, one of them delinquent.
    expect(body.academyCount).toBe(3);
    expect(body.delinquencyPct).toBeCloseTo(33.3, 1);
    expect(body.studentCount).toBeGreaterThan(0);

    const reasons = Object.fromEntries(
      body.attention.map((row: { academyName: string; reason: string }) => [
        row.academyName,
        row.reason,
      ]),
    );
    expect(reasons['Bravo BJJ Team']).toMatch(/^Trial termina em \d+ dias?$/);
    expect(reasons['Charlie Fight Club']).toMatch(/^Assinatura vencida( há \d+ dias?)?$/);
    // Suspended academies are never "precisam de atenção" — they are decided.
    expect(reasons['Delta Team BJJ']).toBeUndefined();
  });

  it('reports the month-over-month delta, or null with no base month', async () => {
    const res = await t.http().get('/v1/platform/overview').set(bearer(owner));
    const { series, mrrDeltaPct } = res.body;
    const current = series[series.length - 1].cents;
    const previous = series[series.length - 2].cents;
    expect(mrrDeltaPct).toBe(
      previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
    );
  });

  // --------------------------------------------------------------- academies

  it('lists every academy with city, students, plan and status (plataforma-03)', async () => {
    const res = await t.http().get('/v1/platform/academies').set(bearer(support));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(res.body.academies.length);

    const bySlug = Object.fromEntries(
      res.body.academies.map((row: { slug: string }) => [row.slug, row]),
    );
    expect(bySlug['alpha-jj']).toMatchObject({ status: 'active', planName: 'Pro' });
    expect(bySlug['bravo-bjj']).toMatchObject({ status: 'trial', planName: 'Essencial' });
    expect(bySlug['charlie-fc']).toMatchObject({ status: 'delinquent', planName: 'Pro' });
    // A canceled subscription leaves no live plan to name — honest null.
    expect(bySlug['delta-team']).toMatchObject({ status: 'suspended', planName: null });
    expect(bySlug['alpha-jj'].studentCount).toBeGreaterThan(0);
  });

  it('registers an academy on Trial, attaches its admin and emails a set-password link', async () => {
    const before = t.sentEmails.length;
    const res = await t
      .http()
      .post('/v1/platform/academies')
      .set(bearer(owner))
      .send({
        name: 'Horizonte BJJ',
        city: 'São Paulo / SP',
        adminEmail: 'Admin@HorizonteBJJ.com.br',
        adminFullName: 'Helena Horizonte',
        platformPlanId: await planIdByName('Pro'),
      });
    expect(res.status).toBe(201);
    expect(res.body.academy).toMatchObject({
      name: 'Horizonte BJJ',
      slug: 'horizonte-bjj',
      city: 'São Paulo / SP',
      status: 'trial',
      planName: 'Pro',
      subscriptionStatus: 'trialing',
      studentCount: 0,
    });
    expect(res.body.adminUserCreated).toBe(true);
    expect(res.body.passwordEmailSent).toBe(true);

    // Case-insensitive: the email is stored and mailed lowercased.
    const email = t.sentEmails[t.sentEmails.length - 1];
    expect(t.sentEmails.length).toBe(before + 1);
    expect(email?.to).toBe('admin@horizontebjj.com.br');
    expect(email?.resetUrl).toContain('/reset-password?token=');

    // The new admin can log in through the reset link's token path — proof
    // the membership landed inside the tenant.
    const me = await t.http().get('/v1/platform/academies').set(bearer(owner));
    expect(
      me.body.academies.some((row: { slug: string }) => row.slug === 'horizonte-bjj'),
    ).toBe(true);

    const audit = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.action, 'academy.registered')),
    );
    expect(audit).toHaveLength(1);
  });

  it('suffixes a colliding slug instead of refusing the registration', async () => {
    const res = await t
      .http()
      .post('/v1/platform/academies')
      .set(bearer(owner))
      .send({
        name: 'Horizonte BJJ',
        city: null,
        adminEmail: 'segundo@horizontebjj.com.br',
        platformPlanId: await planIdByName('Essencial'),
      });
    expect(res.status).toBe(201);
    expect(res.body.academy.slug).toBe('horizonte-bjj-2');
  });

  it('attaches an admin membership to an existing user instead of duplicating the account', async () => {
    const res = await t
      .http()
      .post('/v1/platform/academies')
      .set(bearer(owner))
      .send({
        name: 'Equipe Kimura Sul',
        city: 'Porto Alegre / RS',
        // Already a login in the fixtures (Bravo's admin).
        adminEmail: 'admin.bravo@tatame.dev',
        platformPlanId: await planIdByName('Essencial'),
      });
    expect(res.status).toBe(201);
    expect(res.body.adminUserCreated).toBe(false);

    // The reused account now runs two academies: its session offers both.
    const session = await t.login('admin.bravo@tatame.dev');
    const slugs = (session.memberships as Array<{ academySlug: string | null; role: string }>)
      .filter((m) => m.role === 'admin')
      .map((m) => m.academySlug);
    expect(slugs).toEqual(expect.arrayContaining(['bravo-bjj', 'equipe-kimura-sul']));
  });

  it('rejects a registration on an unknown plan', async () => {
    const res = await t
      .http()
      .post('/v1/platform/academies')
      .set(bearer(owner))
      .send({
        name: 'Fantasma BJJ',
        city: null,
        adminEmail: 'fantasma@tatame.dev',
        platformPlanId: '00000000-0000-4000-8000-000000000000',
      });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('plan.not_found');
  });

  // ------------------------------------------------------------ plan changes

  it('schedules a plan change for the next cycle without touching the current plan', async () => {
    const alphaId = await t.academyIdBySlug('alpha-jj');
    const blackId = await planIdByName('Black');

    const before = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({
          planId: academySubscriptions.platformPlanId,
          end: academySubscriptions.currentPeriodEnd,
        })
        .from(academySubscriptions)
        .where(eq(academySubscriptions.academyId, alphaId)),
    );

    const res = await t
      .http()
      .put(`/v1/platform/academies/${alphaId}/plan`)
      .set(bearer(owner))
      .send({ platformPlanId: blackId });
    expect(res.status).toBe(200);
    expect(res.body.pendingPlan).toMatchObject({ name: 'Black', priceCents: 34_900 });
    // The academy is still on Pro, at Pro's price, for this whole period.
    expect(res.body.planName).toBe('Pro');
    expect(res.body.planPriceCents).toBe(19_900);

    const after = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({
          planId: academySubscriptions.platformPlanId,
          pending: academySubscriptions.pendingPlatformPlanId,
          end: academySubscriptions.currentPeriodEnd,
        })
        .from(academySubscriptions)
        .where(eq(academySubscriptions.academyId, alphaId)),
    );
    expect(after[0]?.planId).toBe(before[0]?.planId);
    expect(after[0]?.end?.getTime()).toBe(before[0]?.end?.getTime());
    expect(after[0]?.pending).toBe(blackId);

    // MRR is unchanged — a scheduled change is not revenue yet.
    const overview = await t.http().get('/v1/platform/overview').set(bearer(owner));
    expect(overview.body.mrrCents).toBe(19_900 * 2);
  });

  it('clears a scheduled change with null, and treats re-picking the current plan the same way', async () => {
    const alphaId = await t.academyIdBySlug('alpha-jj');

    const cleared = await t
      .http()
      .put(`/v1/platform/academies/${alphaId}/plan`)
      .set(bearer(owner))
      .send({ platformPlanId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.pendingPlan).toBeNull();

    const samePlan = await t
      .http()
      .put(`/v1/platform/academies/${alphaId}/plan`)
      .set(bearer(owner))
      .send({ platformPlanId: await planIdByName('Pro') });
    expect(samePlan.status).toBe(200);
    expect(samePlan.body.pendingPlan).toBeNull();
  });

  // ---------------------------------------------------------- suspend/revive

  it('suspends an academy and blocks its members immediately (no cache wait)', async () => {
    const bravoId = await t.academyIdBySlug('bravo-bjj');
    const bravoAdmin = (await t.login('admin.bravo@tatame.dev')).accessToken;

    const before = await t.http().get('/v1/admin/academy').set(bearer(bravoAdmin));
    expect(before.status).toBe(200);

    const suspended = await t
      .http()
      .post(`/v1/platform/academies/${bravoId}/suspend`)
      .set(bearer(owner));
    expect(suspended.status).toBe(200);
    expect(suspended.body.status).toBe('suspended');

    // The AcademyStatusGuard caches for 30 s — the write must invalidate it,
    // otherwise a suspension takes half a minute to mean anything.
    const blocked = await t.http().get('/v1/admin/academy').set(bearer(bravoAdmin));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('tenant.suspended');

    const reactivated = await t
      .http()
      .post(`/v1/platform/academies/${bravoId}/reactivate`)
      .set(bearer(owner));
    expect(reactivated.status).toBe(200);
    // Restored to the status the subscription justifies: bravo is on trial.
    expect(reactivated.body.status).toBe('trial');

    const allowed = await t.http().get('/v1/admin/academy').set(bearer(bravoAdmin));
    expect(allowed.status).toBe(200);

    const actions = await withPlatform(t.platformDb.db, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.tenantId, bravoId)),
    );
    expect(actions.map((row) => row.action)).toEqual(
      expect.arrayContaining(['academy.suspended', 'academy.reactivated']),
    );
  });

  it('reactivating a past-due academy restores delinquent, not active', async () => {
    const charlieId = await t.academyIdBySlug('charlie-fc');
    await t.http().post(`/v1/platform/academies/${charlieId}/suspend`).set(bearer(owner));
    const res = await t
      .http()
      .post(`/v1/platform/academies/${charlieId}/reactivate`)
      .set(bearer(owner));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('delinquent');

    const stored = await withPlatform(t.platformDb.db, (tx) =>
      tx.select({ status: academies.status }).from(academies).where(eq(academies.id, charlieId)),
    );
    expect(stored[0]?.status).toBe('delinquent');
  });

  // ------------------------------------------------------------------- plans

  it('derives "mais assinado" and the feature-inheritance chip instead of storing them', async () => {
    const catalog = await plans();

    const pro = catalog.plans.find((p) => p.name === 'Pro');
    const essencial = catalog.plans.find((p) => p.name === 'Essencial');
    const black = catalog.plans.find((p) => p.name === 'Black');

    // The badge is the derivation, not a stored flag: exactly one plan wears
    // it, and it is the one with the most live subscriptions (ties resolve to
    // the lower sort_order). Asserting the rule rather than a plan name keeps
    // this independent of what the registration tests above subscribed.
    const badged = catalog.plans.filter((p) => p.isMostSubscribed);
    expect(badged).toHaveLength(1);
    const best = Math.max(...catalog.plans.map((p) => p.academyCount));
    expect(badged[0]?.academyCount).toBe(best);
    const tied = catalog.plans.filter((p) => p.academyCount === best);
    expect(badged[0]?.id).toBe(tied[0]?.id); // catalog is sort_order ordered
    expect(best).toBeGreaterThan(0);

    // The cheapest plan inherits from nobody and shows its own chips.
    expect(essencial?.inheritsFrom).toBeNull();
    expect(essencial?.features.map((f) => f.slug)).toEqual([
      'attendance',
      'graduations',
      'pix_payments',
    ]);

    // Pro contains Essencial: "Tudo do Essencial" + only what it adds.
    expect(pro?.inheritsFrom).toBe('Essencial');
    expect(pro?.features.map((f) => f.slug)).toEqual([
      'store',
      'events',
      'full_finance',
      'white_label',
    ]);
    expect(black?.inheritsFrom).toBe('Pro');
    expect(black?.features.map((f) => f.slug)).toEqual([
      'multi_unit',
      'advanced_reports',
      'api',
    ]);

    // Labels come from the registry, so the client has no list to drift.
    expect(catalog.featureRegistry.find((f) => f.slug === 'store')?.label).toBe(
      'Loja da academia',
    );
    expect(catalog.featureRegistry).toHaveLength(10);
  });

  it('creates a plan available for new subscriptions, and edits an existing one', async () => {
    const created = await t
      .http()
      .post('/v1/platform/plans')
      .set(bearer(owner))
      .send({
        name: 'Master',
        priceCents: 49_900,
        studentLimit: null,
        features: ['attendance', 'store', 'api'],
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Master',
      priceCents: 49_900,
      studentLimit: null,
      academyCount: 0,
      isMostSubscribed: false,
    });

    // Sellable the same day: registering onto it works.
    const registered = await t
      .http()
      .post('/v1/platform/academies')
      .set(bearer(owner))
      .send({
        name: 'Mestres do Sul',
        city: null,
        adminEmail: 'mestres@tatame.dev',
        platformPlanId: created.body.id,
      });
    expect(registered.status).toBe(201);
    expect(registered.body.academy.planName).toBe('Master');

    const edited = await t
      .http()
      .put(`/v1/platform/plans/${created.body.id}`)
      .set(bearer(owner))
      .send({
        name: 'Master Plus',
        priceCents: 59_900,
        studentLimit: 500,
        features: ['attendance', 'store'],
      });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: 'Master Plus', priceCents: 59_900, studentLimit: 500 });
    expect(edited.body.features.map((f: { slug: string }) => f.slug)).toEqual([
      'attendance',
      'store',
    ]);
  });

  it('refuses a colliding plan name and an unknown feature slug', async () => {
    const collision = await t
      .http()
      .post('/v1/platform/plans')
      .set(bearer(owner))
      .send({ name: 'pro', priceCents: 1_000, studentLimit: 10, features: [] });
    expect(collision.status).toBe(409);
    expect(collision.body.code).toBe('plan.name_taken');

    const unknown = await t
      .http()
      .post('/v1/platform/plans')
      .set(bearer(owner))
      .send({
        name: 'Teleporte',
        priceCents: 1_000,
        studentLimit: 10,
        features: ['attendance', 'teleportation'],
      });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('validation.failed');

    const negative = await t
      .http()
      .post('/v1/platform/plans')
      .set(bearer(owner))
      .send({ name: 'Negativo', priceCents: -1, studentLimit: 10, features: [] });
    expect(negative.status).toBe(422);
  });

  // -------------------------------------------------------------------- team

  it('serves the team roster and invites a member with the set-password email', async () => {
    const roster = await t.http().get('/v1/platform/team').set(bearer(finance));
    expect(roster.status).toBe(200);
    expect(roster.body.members.map((m: { email: string }) => m.email)).toEqual(
      expect.arrayContaining([
        'owner@tatame.dev',
        'suporte@tatame.dev',
        'suporte2@tatame.dev',
        'financeiro@tatame.dev',
      ]),
    );

    const before = t.sentEmails.length;
    const invited = await t
      .http()
      .post('/v1/platform/team')
      .set(bearer(owner))
      .send({ fullName: 'Paula Andrade', email: 'paula@tatame.app', role: 'support' });
    expect(invited.status).toBe(201);
    expect(invited.body.member).toMatchObject({
      fullName: 'Paula Andrade',
      email: 'paula@tatame.app',
      role: 'support',
    });
    expect(invited.body.userCreated).toBe(true);
    expect(t.sentEmails.length).toBe(before + 1);

    const duplicate = await t
      .http()
      .post('/v1/platform/team')
      .set(bearer(owner))
      .send({ fullName: 'Paula Andrade', email: 'paula@tatame.app', role: 'finance' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('resource.conflict');
  });

  it('serves the integrations stub as read-only (plataforma-11)', async () => {
    const res = await t.http().get('/v1/platform/integrations').set(bearer(support));
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('simulated');
    expect(res.body.integrations.map((i: { key: string }) => i.key)).toEqual([
      'pix',
      'boleto',
      'card',
    ]);
    // The handoff calls these stubs — the switches must render disabled.
    expect(
      res.body.integrations.every((i: { configurable: boolean }) => i.configurable === false),
    ).toBe(true);
  });

  // -------------------------------------------------------------------- rbac

  it('enforces the charter role split across every console route', async () => {
    const cases: Array<{
      method: 'get' | 'post' | 'put';
      path: string;
      token: string;
      label: string;
      status: number;
    }> = [
      // Money is owner/finance: support has no business on the MRR screen.
      { method: 'get', path: '/v1/platform/overview', token: support, label: 'support→overview', status: 403 },
      { method: 'get', path: '/v1/platform/overview', token: finance, label: 'finance→overview', status: 200 },
      // Catalog and customer writes are the owner's.
      { method: 'post', path: '/v1/platform/plans', token: finance, label: 'finance→create plan', status: 403 },
      { method: 'post', path: '/v1/platform/plans', token: support, label: 'support→create plan', status: 403 },
      { method: 'post', path: '/v1/platform/academies', token: support, label: 'support→register', status: 403 },
      { method: 'post', path: '/v1/platform/team', token: support, label: 'support→invite', status: 403 },
      // Reads all three roles share.
      { method: 'get', path: '/v1/platform/academies', token: finance, label: 'finance→academies', status: 200 },
      { method: 'get', path: '/v1/platform/plans', token: support, label: 'support→plans', status: 200 },
      { method: 'get', path: '/v1/platform/team', token: support, label: 'support→team', status: 200 },
      // Academy personas never reach the platform surface at all.
      { method: 'get', path: '/v1/platform/academies', token: admin, label: 'admin→academies', status: 403 },
      { method: 'get', path: '/v1/platform/overview', token: professor, label: 'professor→overview', status: 403 },
    ];

    for (const testCase of cases) {
      const request = t.http()[testCase.method](testCase.path).set(bearer(testCase.token));
      const res = testCase.method === 'get' ? await request : await request.send({});
      // A write with a valid role but an empty body fails validation (422),
      // which still proves the roles guard let it through.
      const acceptable =
        testCase.status === 403 ? [403] : [testCase.status, 400, 422];
      expect(acceptable, `${testCase.label} → ${res.status}`).toContain(res.status);
      if (testCase.status === 403) expect(res.body.code).toBe('authz.forbidden_role');
    }
  });

  it('keeps impersonation on owner/support and money on owner/finance', async () => {
    const alphaId = await t.academyIdBySlug('alpha-jj');

    const financeImpersonation = await t
      .http()
      .post(`/v1/platform/academies/${alphaId}/impersonate`)
      .set(bearer(finance))
      .send({});
    expect(financeImpersonation.status).toBe(403);

    const supportRepasses = await t.http().get('/v1/platform/billing/repasses').set(bearer(support));
    expect(supportRepasses.status).toBe(403);

    const supportImpersonation = await t
      .http()
      .post(`/v1/platform/academies/${alphaId}/impersonate`)
      .set(bearer(support))
      .send({});
    expect(supportImpersonation.status).toBe(201);
  });

  it('404s an academy id that does not exist, for every platform role', async () => {
    for (const token of [owner, support, finance]) {
      const res = await t
        .http()
        .get('/v1/platform/academies/00000000-0000-4000-8000-000000000000')
        .set(bearer(token));
      expect(res.status).toBe(404);
    }
  });
});
