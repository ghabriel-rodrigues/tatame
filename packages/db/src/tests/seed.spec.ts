import { verify } from '@node-rs/argon2';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppDb, createPlatformDb, withPlatform, withTenant, type DbHandle } from '../lib/client.js';
import {
  academies,
  academyPlans,
  academySubscriptions,
  attendances,
  auditLogs,
  beltLadders,
  belts,
  billingCustomers,
  charges,
  classSchedules,
  classSessions,
  classes,
  credentials,
  enrollments,
  graduationRules,
  guardians,
  martialArts,
  memberships,
  paymentMandates,
  payments,
  platformPlans,
  platformUsers,
  rolePermissions,
  studentGraduations,
  studentNotes,
  students,
  users,
} from '../schema/index.js';
import {
  DEV_PASSWORD,
  seedBeltCatalog,
  seedBillingFixtures,
  seedDevFixtures,
  seedPlatformPlans,
} from '../seed/index.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

describe('seeds', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);
    await seedPlatformPlans(platform.db);
    await seedBeltCatalog(platform.db);
    await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
    await seedBillingFixtures({ appDb: app.db, platformDb: platform.db });
  });

  afterAll(async () => {
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  it('seeds the platform plan catalog (Essencial/Pro/Black) with repasse fee_bps', async () => {
    const plans = await withPlatform(platform.db, (tx) =>
      tx.select().from(platformPlans).orderBy(asc(platformPlans.sortOrder)),
    );
    expect(plans.map((p) => [p.name, p.priceCents, p.studentLimit, p.feeBps])).toEqual([
      ['Essencial', 9_900, 80, 500],
      ['Pro', 19_900, 250, 400],
      ['Black', 34_900, null, 250],
    ]);
    // Public catalog readable by the app role with no context at all.
    const publicPlans = await app.db.select().from(platformPlans);
    expect(publicPlans).toHaveLength(3);
  });

  it('seeds the fixture academies with subscriptions, incl. the delinquent repasse fixture', async () => {
    const rows = await withPlatform(platform.db, (tx) =>
      tx
        .select({
          slug: academies.slug,
          status: academies.status,
          subStatus: academySubscriptions.status,
          plan: platformPlans.name,
        })
        .from(academies)
        .innerJoin(academySubscriptions, eq(academySubscriptions.academyId, academies.id))
        .innerJoin(platformPlans, eq(platformPlans.id, academySubscriptions.platformPlanId))
        .orderBy(asc(academies.slug)),
    );
    expect(rows).toEqual([
      { slug: 'alpha-jj', status: 'active', subStatus: 'active', plan: 'Pro' },
      { slug: 'bravo-bjj', status: 'trial', subStatus: 'trialing', plan: 'Essencial' },
      // BIL.5: academy-level delinquency comes only from its SaaS
      // subscription — repasses render this one Retido.
      { slug: 'charlie-fc', status: 'delinquent', subStatus: 'past_due', plan: 'Pro' },
    ]);
  });

  it('seeds users covering all six personas with memberships written under RLS', async () => {
    const [alpha] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'alpha-jj')),
    );
    const [bravo] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'bravo-bjj')),
    );

    // Visible through the tenant-scoped app path — proves they were written
    // (and are readable) under real RLS.
    const alphaMembers = await withTenant(app.db, alpha!.id, (tx) =>
      tx
        .select({ email: users.email, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId)),
    );
    const byEmail = new Map(alphaMembers.map((m) => [`${m.email}:${m.role}`, true]));
    expect(byEmail.has('aluno@tatame.dev:student')).toBe(true);
    expect(byEmail.has('professor@tatame.dev:professor')).toBe(true);
    expect(byEmail.has('admin@tatame.dev:admin')).toBe(true);
    expect(byEmail.has('responsavel@tatame.dev:guardian')).toBe(true);
    expect(byEmail.has('multi@tatame.dev:professor')).toBe(true);

    const bravoMembers = await withTenant(app.db, bravo!.id, (tx) =>
      tx
        .select({ email: users.email, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId)),
    );
    const bravoSet = new Set(bravoMembers.map((m) => `${m.email}:${m.role}`));
    expect(bravoSet.has('admin.bravo@tatame.dev:admin')).toBe(true);
    expect(bravoSet.has('multi@tatame.dev:admin')).toBe(true);
    // No cross-tenant bleed.
    expect(bravoSet.has('aluno@tatame.dev:student')).toBe(false);

    // Platform personas.
    const staff = await withPlatform(platform.db, (tx) =>
      tx
        .select({ email: users.email, role: platformUsers.role })
        .from(platformUsers)
        .innerJoin(users, eq(users.id, platformUsers.userId)),
    );
    const staffSet = new Set(staff.map((s) => `${s.email}:${s.role}`));
    expect(staffSet.has('owner@tatame.dev:owner')).toBe(true);
    expect(staffSet.has('suporte@tatame.dev:support')).toBe(true);
  });

  it('stores argon2id hashes verifying the known dev password', async () => {
    const rows = await withPlatform(platform.db, (tx) =>
      tx
        .select({ secretHash: credentials.secretHash })
        .from(credentials)
        .innerJoin(users, eq(users.id, credentials.userId))
        .where(sql`${users.email} = 'aluno@tatame.dev'`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.secretHash.startsWith('$argon2id$')).toBe(true);
    await expect(verify(rows[0]!.secretHash, DEV_PASSWORD)).resolves.toBe(true);
    await expect(verify(rows[0]!.secretHash, 'wrong-password')).resolves.toBe(false);
  });

  it('seeds default permission toggles per academy', async () => {
    const [alpha] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'alpha-jj')),
    );
    const toggles = await withTenant(app.db, alpha!.id, (tx) =>
      tx.select().from(rolePermissions),
    );
    expect(toggles.length).toBeGreaterThanOrEqual(3);
    expect(
      toggles.some((t) => t.role === 'professor' && t.permissionKey === 'events.create' && t.allowed),
    ).toBe(true);
  });

  it('seeds 3 turmas per academy with real recurrence and a Lotada class at capacity', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const rows = await withTenant(app.db, academy!.id, (tx) =>
        tx.select().from(classes).orderBy(asc(classes.name)),
      );
      expect(rows.map((c) => c.name)).toEqual(['Adulto Gi', 'Kids', 'Lotada']);

      // Kids carries the age range behind the "4 a 12 anos" chip.
      const kids = rows.find((c) => c.name === 'Kids')!;
      expect([kids.ageMin, kids.ageMax]).toEqual([4, 12]);

      // Weekday chips became real schedule rows.
      const schedules = await withTenant(app.db, academy!.id, (tx) =>
        tx.select().from(classSchedules),
      );
      const bySlot = (classId: string) => schedules.filter((s) => s.classId === classId);
      expect(bySlot(rows.find((c) => c.name === 'Adulto Gi')!.id)).toHaveLength(3);
      expect(bySlot(kids.id)).toHaveLength(2);

      // Lotada is seeded exactly at capacity (active enrollments == capacity).
      const lotada = rows.find((c) => c.name === 'Lotada')!;
      const active = await withTenant(app.db, academy!.id, (tx) =>
        tx
          .select()
          .from(enrollments)
          .where(sql`${enrollments.classId} = ${lotada.id} AND ${enrollments.status} = 'active'`),
      );
      expect(active).toHaveLength(lotada.capacity);
    }
  });

  it('seeds a guardian with 2 dependents enrolled in Kids per academy', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const guardianRows = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(guardians),
      );
      expect(guardianRows).toHaveLength(1);
      const guardian = guardianRows[0]!;

      const dependents = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(students).where(eq(students.guardianId, guardian.id)),
      );
      expect(dependents).toHaveLength(2);
      // Dependents are minors without logins (Pendente by derivation).
      for (const d of dependents) {
        expect(d.userId).toBeNull();
      }

      const [kids] = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(classes).where(eq(classes.name, 'Kids')),
      );
      const kidEnrollments = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(enrollments).where(eq(enrollments.classId, kids!.id)),
      );
      expect(kidEnrollments.map((e) => e.studentId).sort()).toEqual(
        dependents.map((d) => d.id).sort(),
      );
    }

    // The alpha guardian record is claimed by the responsavel login.
    const [alpha] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'alpha-jj')),
    );
    const [claimed] = await withTenant(app.db, alpha!.id, (tx) =>
      tx
        .select({ email: users.email })
        .from(guardians)
        .innerJoin(users, eq(users.id, guardians.userId)),
    );
    expect(claimed?.email).toBe('responsavel@tatame.dev');
  });

  it('seeds this week\'s materialized sessions across the 3 turmas (ATT.5)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const sessions = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({
            className: classes.name,
            sessionDate: classSessions.sessionDate,
            startsAt: classSessions.startsAt,
          })
          .from(classSessions)
          .innerJoin(classes, eq(classes.id, classSessions.classId)),
      );

      // One session per schedule slot: Adulto Gi 3 + Kids 2 + Lotada 1.
      const byClass = new Map<string, number>();
      for (const s of sessions) byClass.set(s.className, (byClass.get(s.className) ?? 0) + 1);
      expect(byClass.get('Adulto Gi')).toBe(3);
      expect(byClass.get('Kids')).toBe(2);
      expect(byClass.get('Lotada')).toBe(1);

      // Lazy semantics: only days that already happened are materialized.
      const now = Date.now();
      for (const s of sessions) {
        expect(s.startsAt).not.toBeNull();
        const age = now - new Date(`${s.sessionDate}T00:00:00`).getTime();
        expect(age).toBeGreaterThanOrEqual(0);
        expect(age).toBeLessThan(8 * 24 * 3600 * 1000);
      }
    }
  });

  it('seeds mixed-method attendances with an audited revoked + re-checked-in pair (ATT.5)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const rows = await withTenant(app.db, tenantId, (tx) => tx.select().from(attendances));

      // All three methods appear; manual rows carry the recording professor.
      const methods = new Set(rows.map((r) => r.method));
      expect(methods.has('qr')).toBe(true);
      expect(methods.has('code')).toBe(true);
      expect(methods.has('manual')).toBe(true);
      expect(rows.some((r) => r.method === 'manual' && r.recordedByUserId !== null)).toBe(true);
      expect(rows.some((r) => r.method === 'qr' && r.recordedByUserId === null)).toBe(true);

      // Exactly one revoked row — annotated, and its pair re-checked-in.
      const revoked = rows.filter((r) => r.revokedAt !== null);
      expect(revoked).toHaveLength(1);
      expect(revoked[0]!.revokedByUserId).not.toBeNull();
      expect(revoked[0]!.revokeReason).toBe('seed: roll-call correction');
      const recheck = rows.filter(
        (r) =>
          r.classSessionId === revoked[0]!.classSessionId &&
          r.studentId === revoked[0]!.studentId &&
          r.revokedAt === null,
      );
      expect(recheck).toHaveLength(1);

      // The revoke went through the seam: audited in the same transaction.
      const audit = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select()
          .from(auditLogs)
          .where(sql`${auditLogs.action} = 'attendance.revoked'`),
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]!.targetId).toBe(revoked[0]!.id);
    }
  });

  it('seeds the shared belt catalog in handoff ladder order (GRD.1)', async () => {
    const arts = await withPlatform(platform.db, (tx) => tx.select().from(martialArts));
    expect(arts.map((a) => a.key)).toEqual(['bjj']);

    const rows = await withPlatform(platform.db, (tx) =>
      tx
        .select({ kind: beltLadders.kind, name: belts.name, maxDegrees: belts.maxDegrees })
        .from(belts)
        .innerJoin(beltLadders, eq(beltLadders.id, belts.ladderId))
        .orderBy(asc(beltLadders.kind), asc(belts.position)),
    );
    expect(rows.filter((r) => r.kind === 'adult').map((r) => r.name)).toEqual([
      'Branca',
      'Azul',
      'Roxa',
      'Marrom',
      'Preta',
      'Vermelha',
    ]);
    // Kids ladder without a white row (spec 005 recorded delta).
    expect(rows.filter((r) => r.kind === 'kids').map((r) => r.name)).toEqual([
      'Cinza',
      'Amarela',
      'Laranja',
      'Verde',
    ]);
    expect(rows.find((r) => r.name === 'Preta')!.maxDegrees).toBe(6);
  });

  it('seeds graduation fixtures per academy: history, rule override, kids toggle, note (GRD.5)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      // History: belt award + 3 degrees + 1 revocation, ordered by awarded_at.
      const history = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(studentGraduations).orderBy(asc(studentGraduations.awardedAt)),
      );
      expect(history.map((g) => [g.kind, g.degree])).toEqual([
        ['belt', 0],
        ['degree', 1],
        ['degree', 2],
        ['degree', 3],
        ['revocation', 0],
      ]);
      // One student's journey, immutably attributed.
      expect(new Set(history.map((g) => g.studentId)).size).toBe(1);
      expect(history.every((g) => g.awardedByUserId !== null)).toBe(true);
      // The compensation pair: the revocation reverses exactly the 3rd degree.
      const revocation = history.find((g) => g.kind === 'revocation')!;
      const wrongDegree = history.find((g) => g.kind === 'degree' && g.degree === 3)!;
      expect(revocation.reversesGraduationId).toBe(wrongDegree.id);

      // Every seeded graduation mutation is audited in-transaction.
      const audit = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({ action: auditLogs.action, targetId: auditLogs.targetId })
          .from(auditLogs)
          .where(sql`${auditLogs.action} IN ('graduation.awarded', 'graduation.revoked')`),
      );
      expect(audit.filter((a) => a.action === 'graduation.awarded')).toHaveLength(4);
      expect(audit.filter((a) => a.action === 'graduation.revoked')).toHaveLength(1);
      expect(audit.find((a) => a.action === 'graduation.revoked')!.targetId).toBe(revocation.id);

      // Rules: Azul override (45) + Laranja kids toggle off (admin-16).
      const rules = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({ name: belts.name, lessons: graduationRules.lessonsPerDegree, enabled: graduationRules.enabled })
          .from(graduationRules)
          .innerJoin(belts, eq(belts.id, graduationRules.beltId))
          .orderBy(asc(belts.name)),
      );
      expect(rules).toEqual([
        { name: 'Azul', lessons: 45, enabled: true },
        { name: 'Laranja', lessons: 40, enabled: false },
      ]);

      // Persistent observação authored by the fixture professor.
      const notes = await withTenant(app.db, tenantId, (tx) => tx.select().from(studentNotes));
      expect(notes).toHaveLength(1);
      expect(notes[0]!.studentId).toBe(history[0]!.studentId);

      // Display-only professor rank + Adulto Gi belt range landed.
      const rankedProfessors = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select()
          .from(memberships)
          .where(sql`${memberships.role} = 'professor' AND ${memberships.beltId} IS NOT NULL`),
      );
      expect(rankedProfessors.length).toBeGreaterThanOrEqual(1);
      expect(rankedProfessors[0]!.beltDegree).toBe(2);

      const [adulto] = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(classes).where(eq(classes.name, 'Adulto Gi')),
      );
      expect(adulto!.minBeltId).not.toBeNull();
      expect(adulto!.maxBeltId).not.toBeNull();
    }
  });

  it('seeds the mensalidade plan catalog per academy (BIL.5)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const plans = await withTenant(app.db, academy!.id, (tx) =>
        tx.select().from(academyPlans).orderBy(asc(academyPlans.name)),
      );
      expect(
        plans.map((p) => [p.name, p.amountCents, p.recurrence, p.dueDay, p.isActive]),
      ).toEqual([
        ['Kids Mensal', 15_000, 'monthly', 10, true],
        ['Mensal', 18_000, 'monthly', 5, true],
        // Soft-archived plan — history stays intact, no hard delete.
        ['Trimestral', 48_000, 'quarterly', 15, false],
      ]);
    }
  });

  it('seeds charge histories: open cycle, paid-with-Pix, overdue, guardian-billed (BIL.5)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const rows = await withTenant(app.db, tenantId, (tx) => tx.select().from(charges));
      // 7 plan charges: main open+paid, one overdue, 2 dependents × (open+paid).
      expect(rows).toHaveLength(7);
      expect(rows.every((c) => c.origin === 'plan' && c.academyPlanId !== null)).toBe(true);
      expect(rows.every((c) => c.periodStart !== null && c.periodEnd !== null)).toBe(true);

      const byStatus = new Map<string, number>();
      for (const c of rows) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      expect(byStatus.get('open')).toBe(3);
      expect(byStatus.get('paid')).toBe(3);
      expect(byStatus.get('overdue')).toBe(1);

      // The overdue fixture is actually past due (derived truth holds).
      const overdue = rows.find((c) => c.status === 'overdue')!;
      expect(new Date(`${overdue.dueDate}T00:00:00`).getTime()).toBeLessThan(Date.now());

      // Guardian-billed: the dependents' charges carry the bill-to guardian.
      const guardianBilled = rows.filter((c) => c.guardianId !== null);
      expect(guardianBilled).toHaveLength(4);

      // Settled payments: simulated provider, render-ready payloads, receipt.
      const paymentRows = await withTenant(app.db, tenantId, (tx) => tx.select().from(payments));
      expect(paymentRows).toHaveLength(3);
      expect(paymentRows.every((p) => p.status === 'succeeded' && p.provider === 'simulated')).toBe(
        true,
      );
      expect(paymentRows.every((p) => p.paidAt !== null && p.receiptUrl !== null)).toBe(true);
      expect(
        paymentRows.every((p) => p.providerPaymentId === `SIM-${p.method.toUpperCase()}-${p.chargeId}`),
      ).toBe(true);

      const pix = paymentRows.filter((p) => p.method === 'pix');
      expect(pix).toHaveLength(2);
      for (const p of pix) {
        const data = p.providerData as { qrPayload?: string; copiaECola?: string };
        expect(data.qrPayload).toBe(`TATAME-SIM-PIX-${p.chargeId}`);
        expect(data.copiaECola).toBe(`TATAME-SIM-PIX-${p.chargeId}`);
      }
      // The "recorrência no cartão" settlement for a dependent (story 19).
      const card = paymentRows.find((p) => p.method === 'card')!;
      const cardCharge = rows.find((c) => c.id === card.chargeId)!;
      expect(cardCharge.guardianId).not.toBeNull();

      // Every paid charge has its settled payment.
      const paidIds = rows.filter((c) => c.status === 'paid').map((c) => c.id).sort();
      expect(paymentRows.map((p) => p.chargeId).sort()).toEqual(paidIds);

      // Audited in-transaction with the billing action codes.
      const audit = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(sql`${auditLogs.action} LIKE 'billing.%'`),
      );
      const actions = audit.map((a) => a.action);
      expect(actions.filter((a) => a === 'billing.charge.created')).toHaveLength(7);
      expect(actions.filter((a) => a === 'billing.charge.paid')).toHaveLength(3);
    }
  });

  it('seeds active card mandates where a payer login exists; billing_customers stays empty (BIL.5)', async () => {
    const [alpha] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'alpha-jj')),
    );
    const alphaMandates = await withTenant(app.db, alpha!.id, (tx) =>
      tx.select().from(paymentMandates),
    );
    // The claimed aluno (self-payer) + the responsável paying a dependent.
    expect(alphaMandates).toHaveLength(2);
    for (const m of alphaMandates) {
      expect(m.status).toBe('active');
      expect(m.method).toBe('card');
      expect(m.provider).toBe('simulated');
      expect(m.providerMandateId).toBe(`SIM-MANDATE-${m.studentId}`);
    }
    const students_ = new Set(alphaMandates.map((m) => m.studentId));
    expect(students_.size).toBe(2);

    // Bravo has no claimed payer logins — no mandates by construction.
    const [bravo] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'bravo-bjj')),
    );
    const bravoMandates = await withTenant(app.db, bravo!.id, (tx) =>
      tx.select().from(paymentMandates),
    );
    expect(bravoMandates).toHaveLength(0);

    // v1: the simulated driver never writes the Stripe Customer mapping.
    const customers = await withPlatform(platform.db, (tx) => tx.select().from(billingCustomers));
    expect(customers).toHaveLength(0);
  });

  it('assigns mensalidade plans to the fixture students, keeping one planless empty-state fixture', async () => {
    const [alpha] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'alpha-jj')),
    );
    const rows = await withTenant(app.db, alpha!.id, (tx) =>
      tx
        .select({ name: students.fullName, planName: academyPlans.name })
        .from(students)
        .leftJoin(academyPlans, eq(academyPlans.id, students.academyPlanId))
        .orderBy(asc(students.fullName)),
    );
    const byName = new Map(rows.map((r) => [r.name, r.planName]));
    expect(byName.get('Ana Aluna')).toBe('Mensal');
    expect(byName.get('Flavia Fila')).toBe('Mensal');
    expect(byName.get('Kiko Kids')).toBe('Kids Mensal');
    expect(byName.get('Lara Kids')).toBe('Kids Mensal');
    // Story 8: no plan assigned → the Carteira shows its clean empty state.
    expect(byName.get('Fabio Fila')).toBeNull();
  });

  it('is idempotent — re-running seeds changes no row counts', async () => {
    const count = async () =>
      withPlatform(platform.db, async (tx) => {
        const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
        const [m] = await tx.select({ n: sql<number>`count(*)::int` }).from(memberships);
        const [p] = await tx.select({ n: sql<number>`count(*)::int` }).from(platformPlans);
        const [s] = await tx.select({ n: sql<number>`count(*)::int` }).from(academySubscriptions);
        const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(classes);
        const [cs] = await tx.select({ n: sql<number>`count(*)::int` }).from(classSchedules);
        const [st] = await tx.select({ n: sql<number>`count(*)::int` }).from(students);
        const [g] = await tx.select({ n: sql<number>`count(*)::int` }).from(guardians);
        const [e] = await tx.select({ n: sql<number>`count(*)::int` }).from(enrollments);
        const [se] = await tx.select({ n: sql<number>`count(*)::int` }).from(classSessions);
        const [at] = await tx.select({ n: sql<number>`count(*)::int` }).from(attendances);
        const [al] = await tx.select({ n: sql<number>`count(*)::int` }).from(auditLogs);
        const [b] = await tx.select({ n: sql<number>`count(*)::int` }).from(belts);
        const [gr] = await tx.select({ n: sql<number>`count(*)::int` }).from(graduationRules);
        const [sg] = await tx.select({ n: sql<number>`count(*)::int` }).from(studentGraduations);
        const [sn] = await tx.select({ n: sql<number>`count(*)::int` }).from(studentNotes);
        const [ap] = await tx.select({ n: sql<number>`count(*)::int` }).from(academyPlans);
        const [ch] = await tx.select({ n: sql<number>`count(*)::int` }).from(charges);
        const [pay] = await tx.select({ n: sql<number>`count(*)::int` }).from(payments);
        const [pm] = await tx.select({ n: sql<number>`count(*)::int` }).from(paymentMandates);
        const [bc] = await tx.select({ n: sql<number>`count(*)::int` }).from(billingCustomers);
        const [ac] = await tx.select({ n: sql<number>`count(*)::int` }).from(academies);
        return [
          u!.n, m!.n, p!.n, s!.n, c!.n, cs!.n, st!.n, g!.n, e!.n, se!.n, at!.n, al!.n,
          b!.n, gr!.n, sg!.n, sn!.n, ap!.n, ch!.n, pay!.n, pm!.n, bc!.n, ac!.n,
        ];
      });

    const before = await count();
    await seedPlatformPlans(platform.db);
    await seedBeltCatalog(platform.db);
    await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
    await seedBillingFixtures({ appDb: app.db, platformDb: platform.db });
    const after = await count();
    expect(after).toEqual(before);
  });
});
