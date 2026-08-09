import 'reflect-metadata';
import { ModulesContainer } from '@nestjs/core';
import { BYPASS_READ_ONLY_KEY, ROLES_KEY } from '@org/api';
import { charges, credentials, payments, platformUsers, users, withPlatform } from '@tatame/db';
import { hashDevPassword } from '@tatame/db/testing';
import { and, eq, sql as dsql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, DEV_PASSWORD, type TestApp } from './support/test-app.js';

/**
 * BIL.11/BIL.12 — plataforma repasses read model (gross − fee_bps = net,
 * Retido on the delinquent charlie-fc fixture), platform RBAC
 * (owner/finance only), the billing CI route-metadata assertions and the
 * simulate-endpoint provider gating (env swap).
 */
describe('billing: platform repasses + CI assertions + provider gating', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    // The dev seeds ship no finance persona — create one for the RBAC matrix.
    const secretHash = await hashDevPassword(DEV_PASSWORD);
    await withPlatform(t.platformDb.db, async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: 'financeiro@tatame.dev', fullName: 'Fernanda Financeiro' })
        .returning({ id: users.id });
      await tx.insert(credentials).values({
        userId: user!.id,
        provider: 'password',
        secretHash,
      });
      await tx.insert(platformUsers).values({ userId: user!.id, role: 'finance' });
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('repasse math: gross settled − fee_bps = net, per academy per period', async () => {
    const owner = await t.login('owner@tatame.dev');
    const res = await t.http().get('/v1/platform/billing/repasses').set(bearer(owner.accessToken));
    expect(res.status).toBe(200);

    const alphaId = await t.academyIdBySlug('alpha-jj');
    const rows = res.body.repasses.filter((r: any) => r.academyId === alphaId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      // Alpha rides the Pro plan: fee_bps 400 (seeded catalog).
      expect(row.feeBps).toBe(400);
      expect(row.feeCents).toBe(Math.round((row.grossCents * row.feeBps) / 10_000));
      expect(row.netCents).toBe(row.grossCents - row.feeCents);
      expect(row.withheld).toBe(false);
    }

    // Settled previous-cycle fixtures: Ana 18000 + Kiko 15000 + Lara 15000.
    const [truth] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({
          gross: dsql<string>`COALESCE(SUM(${payments.amountCents}), 0)`,
          students: dsql<string>`COUNT(DISTINCT ${charges.studentId})`,
        })
        .from(payments)
        .innerJoin(charges, and(eq(charges.tenantId, payments.tenantId), eq(charges.id, payments.chargeId)))
        .where(and(eq(payments.tenantId, alphaId), eq(payments.status, 'succeeded'))),
    );
    const totalGross = rows.reduce((sum: number, r: any) => sum + r.grossCents, 0);
    expect(totalGross).toBe(Number(truth!.gross));
    // Plan fixtures (Ana 18000 + Kiko 15000 + Lara 15000) + Ana's settled
    // event inscription (spec 008 fixtures, 6000) — event money repasses too.
    expect(Number(truth!.gross)).toBe(54000);
    const totalStudents = rows.reduce((sum: number, r: any) => sum + r.studentCount, 0);
    expect(totalStudents).toBeGreaterThanOrEqual(Number(truth!.students));

    // Past periods → Repassado; the current period → Em trânsito.
    const currentPeriod = new Date().toISOString().slice(0, 7);
    for (const row of rows) {
      expect(row.status).toBe(row.period === currentPeriod ? 'em_transito' : 'repassado');
    }
  });

  it('the delinquent academy is always Retido (charter retention rule)', async () => {
    const owner = await t.login('owner@tatame.dev');
    const res = await t.http().get('/v1/platform/billing/repasses').set(bearer(owner.accessToken));
    const charlie = res.body.repasses.filter((r: any) => r.academyName === 'Charlie Fight Club');
    expect(charlie.length).toBeGreaterThanOrEqual(1);
    for (const row of charlie) {
      expect(row.withheld).toBe(true);
      expect(row.status).toBe('retido');
    }
    // "assinaturas · mês" counts live subscriptions (active + past_due):
    // alpha Pro (19900) + charlie Pro past_due (19900); bravo is trialing.
    expect(res.body.totals.subscriptionsMonthCents).toBe(39800);
  });

  it('platform RBAC: finance allowed, support denied, academy admin denied', async () => {
    const finance = await t.login('financeiro@tatame.dev');
    const ok = await t.http().get('/v1/platform/billing/repasses').set(bearer(finance.accessToken));
    expect(ok.status).toBe(200);

    const support = await t.login('suporte@tatame.dev');
    const denied = await t
      .http()
      .get('/v1/platform/billing/repasses')
      .set(bearer(support.accessToken));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('authz.forbidden_role');

    const admin = await t.login('admin@tatame.dev');
    const academy = await t
      .http()
      .get('/v1/platform/billing/repasses')
      .set(bearer(admin.accessToken));
    expect(academy.status).toBe(403);
  });

  it('META: no billing route admits the professor role — structurally', () => {
    const modulesContainer = t.app.get(ModulesContainer, { strict: false });
    let billingRoutes = 0;
    for (const module of modulesContainer.values()) {
      for (const wrapper of module.controllers.values()) {
        const metatype = wrapper.metatype as (new () => unknown) | undefined;
        if (!metatype) continue;
        const controllerPath: string = Reflect.getMetadata('path', metatype) ?? '';
        const prototype = metatype.prototype as Record<string, unknown>;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          if (name === 'constructor') continue;
          const handler = prototype[name];
          if (typeof handler !== 'function') continue;
          const path = Reflect.getMetadata('path', handler);
          if (path === undefined) continue;
          const fullPath = `${controllerPath}/${path}`;
          if (!/billing|wallet|repasses|responsavel\/payments/.test(fullPath)) continue;
          billingRoutes += 1;
          const roles: string[] =
            Reflect.getMetadata(ROLES_KEY, handler) ??
            Reflect.getMetadata(ROLES_KEY, metatype) ??
            [];
          expect(roles.length, `${metatype.name}.${name} must declare roles`).toBeGreaterThan(0);
          expect(roles, `${metatype.name}.${name} admits professor`).not.toContain('professor');
        }
      }
    }
    // The whole billing surface: wallet (3) + responsavel (2) + shared (2) +
    // admin billing (3) + plans (4) + platform repasses (1).
    expect(billingRoutes).toBe(15);
  });

  it('META: every payment-flow mutation carries @BypassReadOnly', () => {
    const modulesContainer = t.app.get(ModulesContainer, { strict: false });
    const expected = new Map([
      ['AlunoWalletController.pay', true],
      ['AlunoWalletController.cancelMandate', true],
      ['ResponsavelPaymentsController.pay', true],
      ['BillingSharedController.simulate', true],
    ]);
    const found = new Map<string, boolean>();
    for (const module of modulesContainer.values()) {
      for (const wrapper of module.controllers.values()) {
        const metatype = wrapper.metatype as (new () => unknown) | undefined;
        if (!metatype) continue;
        const prototype = metatype.prototype as Record<string, unknown>;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          if (name === 'constructor') continue;
          const handler = prototype[name];
          if (typeof handler !== 'function') continue;
          const key = `${metatype.name}.${name}`;
          if (!expected.has(key)) continue;
          found.set(key, Reflect.getMetadata(BYPASS_READ_ONLY_KEY, handler) === true);
        }
      }
    }
    for (const [key] of expected) {
      expect(found.get(key), `${key} must be @BypassReadOnly`).toBe(true);
    }
  });

  it('simulate is 404 when the provider is not simulated (env swap)', async () => {
    const stripeApp = await createTestApp({ env: { PAYMENTS_PROVIDER: 'stripe' } });
    try {
      const aluno = await stripeApp.login('aluno@tatame.dev');
      const alphaId = await stripeApp.academyIdBySlug('alpha-jj');

      // A genuinely pending payment exists in THIS database — the 404 below
      // is the provider gate, not a missing row.
      const [openCharge] = await withPlatform(stripeApp.platformDb.db, (tx) =>
        tx
          .select({ id: charges.id, amountCents: charges.amountCents })
          .from(charges)
          .where(and(eq(charges.tenantId, alphaId), eq(charges.status, 'open'))),
      );
      expect(openCharge).toBeTruthy();
      const [payment] = await withPlatform(stripeApp.platformDb.db, (tx) =>
        tx
          .insert(payments)
          .values({
            tenantId: alphaId,
            chargeId: openCharge!.id,
            method: 'pix',
            status: 'pending',
            amountCents: openCharge!.amountCents,
            provider: 'simulated',
            providerPaymentId: `SIM-PIX-${openCharge!.id}`,
          })
          .returning({ id: payments.id }),
      );

      const res = await stripeApp
        .http()
        .post(`/v1/billing/payments/${payment!.id}/simulate`)
        .set(bearer(aluno.accessToken));
      expect(res.status).toBe(404);
    } finally {
      await stripeApp.close();
    }
  });
});
