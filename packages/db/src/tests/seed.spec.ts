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
  eventRegistrations,
  events,
  graduationRules,
  guardians,
  martialArts,
  memberships,
  notifications,
  orderItems,
  orders,
  paymentMandates,
  payments,
  platformPlans,
  platformUsers,
  productCategories,
  products,
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
  seedEventFixtures,
  seedNotificationFixtures,
  seedPlatformConsoleFixtures,
  seedPlatformPlans,
  seedReportFixtures,
  seedStoreFixtures,
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
    await seedEventFixtures({ appDb: app.db, platformDb: platform.db });
    await seedStoreFixtures({ appDb: app.db, platformDb: platform.db });
    await seedNotificationFixtures({ appDb: app.db, platformDb: platform.db });
    await seedPlatformConsoleFixtures({ platformDb: platform.db });
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

  it('seeds plan features as registry slugs, each tier a superset of the one below (PLT.1)', async () => {
    const plans = await withPlatform(platform.db, (tx) =>
      tx
        .select({ name: platformPlans.name, features: platformPlans.features })
        .from(platformPlans)
        .orderBy(asc(platformPlans.sortOrder)),
    );
    expect(plans.map((p) => p.name)).toEqual(['Essencial', 'Pro', 'Black']);
    expect(plans[0]!.features).toEqual(['attendance', 'graduations', 'pix_payments']);
    // Containment is what makes the plataforma-05 "Tudo do X" chip derivable.
    for (let i = 1; i < plans.length; i += 1) {
      const lower = new Set(plans[i - 1]!.features);
      expect(plans[i]!.features).toEqual(expect.arrayContaining([...lower]));
      expect(plans[i]!.features.length).toBeGreaterThan(lower.size);
    }
  });

  it('rejects a feature slug outside the registry at the database boundary (PLT.1)', async () => {
    // Drizzle wraps the driver error, so the constraint name rides on the
    // cause rather than the thrown message.
    const failure = await withPlatform(platform.db, (tx) =>
      tx
        .update(platformPlans)
        .set({ features: ['attendance', 'teleportation'] })
        .where(eq(platformPlans.name, 'Essencial')),
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).not.toBeNull();
    expect(String((failure as { cause?: unknown }).cause)).toMatch(
      /platform_plans_features_slug_ck/,
    );
  });

  it('seeds the plataforma-10 team: one owner, two support, one finance (PLT.2)', async () => {
    const rows = await withPlatform(platform.db, (tx) =>
      tx
        .select({ email: users.email, role: platformUsers.role })
        .from(platformUsers)
        .innerJoin(users, eq(users.id, platformUsers.userId))
        .orderBy(asc(users.email)),
    );
    expect(rows).toEqual([
      { email: 'financeiro@tatame.dev', role: 'finance' },
      { email: 'owner@tatame.dev', role: 'owner' },
      // Byte order: '2' (0x32) sorts before '@' (0x40).
      { email: 'suporte2@tatame.dev', role: 'support' },
      { email: 'suporte@tatame.dev', role: 'support' },
    ]);
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
      // PLT.2: the suspended fixture — access blocked, billing stopped, so
      // the platform console can show every academy status on first login.
      { slug: 'delta-team', status: 'suspended', subStatus: 'canceled', plan: 'Essencial' },
    ]);
  });

  it('brands only bravo (Oceano preset) — alpha and charlie stay on the default NULL triplet (CFG.2)', async () => {
    const rows = await withPlatform(platform.db, (tx) =>
      tx
        .select({
          slug: academies.slug,
          deep: academies.brandDeep,
          vibrant: academies.brandVibrant,
          accent: academies.brandAccent,
          autoNotifications: academies.autoNotificationsEnabled,
        })
        .from(academies)
        .orderBy(asc(academies.slug)),
    );
    expect(rows).toEqual([
      { slug: 'alpha-jj', deep: null, vibrant: null, accent: null, autoNotifications: true },
      // The "Oceano" ready-made palette, verbatim from the design-system
      // preset registry — cross-tenant white-label demoable on first login.
      {
        slug: 'bravo-bjj',
        deep: '#14213D',
        vibrant: '#3A5FA8',
        accent: '#E63946',
        autoNotifications: true,
      },
      { slug: 'charlie-fc', deep: null, vibrant: null, accent: null, autoNotifications: true },
      { slug: 'delta-team', deep: null, vibrant: null, accent: null, autoNotifications: true },
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

      // Event-origin money belongs to the EVT.3 fixtures — scope to plan.
      const rows = (
        await withTenant(app.db, tenantId, (tx) => tx.select().from(charges))
      ).filter((c) => c.origin === 'plan');
      // 7 plan charges: main open+paid, one overdue, 2 dependents × (open+paid).
      expect(rows).toHaveLength(7);
      expect(rows.every((c) => c.academyPlanId !== null)).toBe(true);
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
      const planChargeIds = new Set(rows.map((c) => c.id));
      const paymentRows = (
        await withTenant(app.db, tenantId, (tx) => tx.select().from(payments))
      ).filter((p) => planChargeIds.has(p.chargeId));
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
      // 7 plan charges (BIL.5) + 2 event charges (EVT.3) + 5 order charges
      // (STO.3); 3 plan + 1 event + 4 order settlements (the refunded order
      // payment was paid first) — money rows share the billing action codes.
      expect(actions.filter((a) => a === 'billing.charge.created')).toHaveLength(14);
      expect(actions.filter((a) => a === 'billing.charge.paid')).toHaveLength(8);
      // The canceled-after-paid order fixture rode the audited refund path.
      expect(actions.filter((a) => a === 'billing.charge.refunded')).toHaveLength(1);
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

  it('seeds 3 events per academy: draft without date/local, published free, published paid R$ 60 (EVT.3)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const rows = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(events).orderBy(asc(events.name)),
      );
      expect(rows.map((e) => e.name)).toEqual([
        'Exame de Faixa',
        'Open Mat de Verao',
        'Seminario de Guarda',
      ]);
      expect(rows.every((e) => e.responsibleUserId !== null && e.description !== null)).toBe(true);

      // The "Rascunho · Data a definir" card: draft may lack date and local.
      const draft = rows.find((e) => e.name === 'Seminario de Guarda')!;
      expect(draft.status).toBe('draft');
      expect(draft.startsAt).toBeNull();
      expect(draft.location).toBeNull();

      // Published free: NULL price = gratuito, date + local present (CHECK).
      const free = rows.find((e) => e.name === 'Open Mat de Verao')!;
      expect(free.status).toBe('published');
      expect(free.priceCents).toBeNull();
      expect(free.startsAt).not.toBeNull();
      expect(free.location).toBe('Tatame principal');

      // Published paid: the handoff's R$ 60 chip, in integer cents.
      const paid = rows.find((e) => e.name === 'Exame de Faixa')!;
      expect(paid.status).toBe('published');
      expect(paid.priceCents).toBe(6_000);
      expect(paid.startsAt).not.toBeNull();
      expect(paid.location).toBe('Ginasio central');

      // Lifecycle audited: 3 created, 2 published.
      const audit = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(sql`${auditLogs.action} LIKE 'events.event.%'`),
      );
      const actions = audit.map((a) => a.action);
      expect(actions.filter((a) => a === 'events.event.created')).toHaveLength(3);
      expect(actions.filter((a) => a === 'events.event.published')).toHaveLength(2);
    }
  });

  it('seeds mixed registrations with their event-origin charges (EVT.3)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const eventRows = await withTenant(app.db, tenantId, (tx) => tx.select().from(events));
      const free = eventRows.find((e) => e.name === 'Open Mat de Verao')!;
      const paid = eventRows.find((e) => e.name === 'Exame de Faixa')!;

      const regs = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(eventRegistrations),
      );
      expect(regs).toHaveLength(4);
      expect(regs.every((r) => r.confirmedByUserId !== null)).toBe(true);

      // Free event: aluno + one dependent, both confirmed direto (no money).
      const freeRegs = regs.filter((r) => r.eventId === free.id);
      expect(freeRegs).toHaveLength(2);
      expect(freeRegs.every((r) => r.status === 'confirmed')).toBe(true);
      const [guardian] = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(guardians),
      );
      const dependents = await withTenant(app.db, tenantId, (tx) =>
        tx.select({ id: students.id }).from(students).where(eq(students.guardianId, guardian!.id)),
      );
      const dependentIds = new Set(dependents.map((d) => d.id));
      const freeDependent = freeRegs.find((r) => dependentIds.has(r.studentId));
      expect(freeDependent).toBeDefined();
      if (guardian!.userId) {
        // Per-dependent confirmation acted by the responsável (charter rule).
        expect(freeDependent!.confirmedByUserId).toBe(guardian!.userId);
      }

      // Paid event: one settled (confirmed + paid charge + Pix payment), one
      // pending_payment with its open charge billed to the guardian.
      const paidRegs = regs.filter((r) => r.eventId === paid.id);
      expect(paidRegs.map((r) => r.status).sort()).toEqual(['confirmed', 'pending_payment']);

      const eventCharges = (
        await withTenant(app.db, tenantId, (tx) => tx.select().from(charges))
      ).filter((c) => c.origin === 'event');
      expect(eventCharges).toHaveLength(2);
      expect(eventCharges.every((c) => c.amountCents === 6_000)).toBe(true);
      expect(eventCharges.every((c) => c.eventRegistrationId !== null)).toBe(true);
      expect(
        eventCharges.every((c) => c.academyPlanId === null && c.orderId === null),
      ).toBe(true);

      const settledReg = paidRegs.find((r) => r.status === 'confirmed')!;
      const settledCharge = eventCharges.find(
        (c) => c.eventRegistrationId === settledReg.id,
      )!;
      expect(settledCharge.status).toBe('paid');
      const [settlement] = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(payments).where(eq(payments.chargeId, settledCharge.id)),
      );
      expect(settlement!.status).toBe('succeeded');
      expect(settlement!.method).toBe('pix');
      expect(settlement!.provider).toBe('simulated');
      expect(settlement!.receiptUrl).not.toBeNull();

      const pendingReg = paidRegs.find((r) => r.status === 'pending_payment')!;
      const pendingCharge = eventCharges.find(
        (c) => c.eventRegistrationId === pendingReg.id,
      )!;
      expect(pendingCharge.status).toBe('open');
      // The dependent's inscription is billed to the responsável.
      expect(pendingReg.studentId && dependentIds.has(pendingReg.studentId)).toBe(true);
      expect(pendingCharge.guardianId).toBe(guardian!.id);

      // Confirmed transitions audited (pending awaits the handler).
      const audit = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(sql`${auditLogs.action} = 'events.registration.confirmed'`),
      );
      expect(audit).toHaveLength(3);
    }
  });

  it('seeds the prototype store catalog: 4 categories, 6 monogram products, one low-stock (STO.3)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const categoryRows = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(productCategories).orderBy(asc(productCategories.name)),
      );
      expect(categoryRows.map((c) => c.name)).toEqual([
        'Acessorios',
        'Faixas',
        'Kimonos',
        'Vestuario',
      ]);

      const rows = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(products).orderBy(asc(products.name)),
      );
      // The prototype's six tiles, all active with a real category and price.
      expect(rows.map((p) => p.monogram).sort()).toEqual(['FX', 'GI', 'MC', 'PB', 'RG', 'TS']);
      expect(rows.every((p) => p.status === 'active' && p.archivedAt === null)).toBe(true);
      expect(rows.every((p) => p.categoryId !== null && p.priceCents > 0)).toBe(true);
      expect(rows.every((p) => p.tags.length > 0 && p.gradientPreset.length > 0)).toBe(true);

      // Sized apparel carries pills; mochila and protetor are sizeless.
      const kimono = rows.find((p) => p.monogram === 'GI')!;
      expect(kimono.sizes).toEqual(['A1', 'A2', 'A3', 'A4']);
      const camiseta = rows.find((p) => p.monogram === 'TS')!;
      expect(camiseta.sizes).toEqual(['P', 'M', 'G', 'GG']);
      const mochila = rows.find((p) => p.monogram === 'MC')!;
      expect(mochila.sizes).toEqual([]);

      // Exactly one "estoque baixo" fixture: active AND stock <= threshold.
      const lowStock = rows.filter((p) => p.stockQty <= p.lowStockThreshold);
      expect(lowStock.map((p) => p.monogram)).toEqual(['PB']);

      // Catalog mutations audited with the store action codes.
      const audit = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(sql`${auditLogs.action} LIKE 'store.%'`),
      );
      const actions = audit.map((a) => a.action);
      expect(actions.filter((a) => a === 'store.category.created')).toHaveLength(4);
      expect(actions.filter((a) => a === 'store.product.created')).toHaveLength(6);
    }
  });

  it('seeds mixed lifecycle orders with their order-origin charges (STO.3)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const orderRows = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(orders).orderBy(asc(orders.number)),
      );
      // The whole lifecycle, numbers ending at the prototype's #2431.
      expect(orderRows.map((o) => [o.number, o.status])).toEqual([
        [2427, 'delivered'],
        [2428, 'canceled'],
        [2429, 'ready'],
        [2430, 'paid'],
        [2431, 'pending'],
      ]);
      expect(orderRows.every((o) => o.pickupNote === 'Retirada na recepção')).toBe(true);
      const canceled = orderRows.find((o) => o.status === 'canceled')!;
      expect(canceled.canceledAt).not.toBeNull();

      // Exactly one item per order (v1 single-product purchase) whose price
      // snapshot derives the order total.
      const items = await withTenant(app.db, tenantId, (tx) => tx.select().from(orderItems));
      expect(items).toHaveLength(5);
      const productRows = await withTenant(app.db, tenantId, (tx) => tx.select().from(products));
      for (const order of orderRows) {
        const item = items.find((i) => i.orderId === order.id)!;
        expect(item).toBeDefined();
        expect(order.totalCents).toBe(item.unitPriceCents * item.quantity);
        const product = productRows.find((p) => p.id === item.productId)!;
        expect(item.unitPriceCents).toBe(product.priceCents);
        // Sized products carry a pill value on the item; sizeless stay NULL.
        if (product.sizes.length === 0) {
          expect(item.size).toBeNull();
        } else {
          expect(product.sizes).toContain(item.size);
        }
      }

      // One order-origin charge per order, hardened linkage, no guardian.
      const orderCharges = (
        await withTenant(app.db, tenantId, (tx) => tx.select().from(charges))
      ).filter((c) => c.origin === 'order');
      expect(orderCharges).toHaveLength(5);
      expect(orderCharges.every((c) => c.orderId !== null && c.guardianId === null)).toBe(true);
      const chargeByOrder = new Map(orderCharges.map((c) => [c.orderId, c]));

      // pending → open charge; paid/ready/delivered → paid + succeeded Pix;
      // canceled-after-paid → refunded charge + refunded payment.
      const paymentRows = await withTenant(app.db, tenantId, (tx) => tx.select().from(payments));
      for (const order of orderRows) {
        const charge = chargeByOrder.get(order.id)!;
        expect(charge.amountCents).toBe(order.totalCents);
        const settlement = paymentRows.find((p) => p.chargeId === charge.id);
        if (order.status === 'pending') {
          expect(charge.status).toBe('open');
          expect(settlement).toBeUndefined();
        } else if (order.status === 'canceled') {
          expect(charge.status).toBe('refunded');
          expect(settlement!.status).toBe('refunded');
          expect(settlement!.refundedAt).not.toBeNull();
          expect(settlement!.providerRefundId).toBe(`SIM-REFUND-${charge.id}`);
        } else {
          expect(charge.status).toBe('paid');
          expect(settlement!.status).toBe('succeeded');
          expect(settlement!.method).toBe('pix');
          expect(settlement!.provider).toBe('simulated');
          expect(settlement!.receiptUrl).not.toBeNull();
        }
      }

      // The STO.2 relaxation in data: alpha mixes buyers — the professor's
      // order charge (the 'ready' kimono) has no student row, the student
      // buyer's charges keep the Carteira linkage. Bravo has no student
      // login, so every charge is professor-addressed (student_id NULL).
      const readyCharge = chargeByOrder.get(orderRows.find((o) => o.status === 'ready')!.id)!;
      expect(readyCharge.studentId).toBeNull();
      if (slug === 'alpha-jj') {
        expect(orderCharges.filter((c) => c.studentId !== null)).toHaveLength(4);
      } else {
        expect(orderCharges.every((c) => c.studentId === null)).toBe(true);
      }

      // Order lifecycle audited: created ×5, the admin two-step transitions
      // (paid→ready, ready→delivered ×1 each via the delivered fixture plus
      // paid→ready via the ready fixture) and the refund-variant cancel.
      const audit = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(sql`${auditLogs.action} LIKE 'store.order.%'`),
      );
      const actions = audit.map((a) => a.action);
      expect(actions.filter((a) => a === 'store.order.created')).toHaveLength(5);
      expect(actions.filter((a) => a === 'store.order.status_changed')).toHaveLength(3);
      expect(actions.filter((a) => a === 'store.order.canceled')).toHaveLength(1);
    }
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
        const [ev] = await tx.select({ n: sql<number>`count(*)::int` }).from(events);
        const [er] = await tx.select({ n: sql<number>`count(*)::int` }).from(eventRegistrations);
        const [pc] = await tx.select({ n: sql<number>`count(*)::int` }).from(productCategories);
        const [pr] = await tx.select({ n: sql<number>`count(*)::int` }).from(products);
        const [or] = await tx.select({ n: sql<number>`count(*)::int` }).from(orders);
        const [oi] = await tx.select({ n: sql<number>`count(*)::int` }).from(orderItems);
        const [nt] = await tx.select({ n: sql<number>`count(*)::int` }).from(notifications);
        return [
          u!.n, m!.n, p!.n, s!.n, c!.n, cs!.n, st!.n, g!.n, e!.n, se!.n, at!.n, al!.n,
          b!.n, gr!.n, sg!.n, sn!.n, ap!.n, ch!.n, pay!.n, pm!.n, bc!.n, ac!.n, ev!.n, er!.n,
          pc!.n, pr!.n, or!.n, oi!.n, nt!.n,
        ];
      });

    const before = await count();
    await seedPlatformPlans(platform.db);
    await seedBeltCatalog(platform.db);
    await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
    await seedBillingFixtures({ appDb: app.db, platformDb: platform.db });
    await seedEventFixtures({ appDb: app.db, platformDb: platform.db });
    await seedStoreFixtures({ appDb: app.db, platformDb: platform.db });
    await seedNotificationFixtures({ appDb: app.db, platformDb: platform.db });
    await seedPlatformConsoleFixtures({ platformDb: platform.db });
    const after = await count();
    expect(after).toEqual(before);
  });

  it('report & ranking fixtures: locked aluno profile + non-empty spread, idempotent (REP.2)', async () => {
    await seedReportFixtures({ appDb: app.db, platformDb: platform.db });

    // The fixture aluno's profile is full with CPF/RG set (locked demoable).
    const [ana] = await withPlatform(platform.db, (tx) =>
      tx
        .select({ cpf: users.cpf, rg: users.rg, gender: users.gender, uf: users.addressState, zip: users.addressZip })
        .from(users)
        .where(sql`lower(${users.email}) = 'aluno@tatame.dev'`),
    );
    expect(ana).toMatchObject({ cpf: '39053344705', gender: 'female', uf: 'SP', zip: '01310100' });
    expect(ana!.rg).not.toBeNull();

    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;
      await withTenant(app.db, tenantId, async (tx) => {
        // The graded ranking cast exists, unenrolled, with attendances.
        const cast = await tx
          .select({ id: students.id, name: students.fullName })
          .from(students)
          .where(sql`${students.fullName} LIKE '%Ranking'`);
        expect(cast.map((s) => s.name).sort()).toEqual([
          'Renan Ranking',
          'Rita Ranking',
          'Rodrigo Ranking',
        ]);
        const [enrolledCast] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(enrollments)
          .where(sql`${enrollments.studentId} IN (SELECT id FROM students WHERE full_name LIKE '%Ranking')`);
        expect(enrolledCast!.n).toBe(0);

        // Both ranking windows are fed: semester events with confirmed
        // registrations, and an in-semester belt award for the report.
        const semesterEvents = await tx
          .select({ id: events.id, name: events.name })
          .from(events)
          .where(sql`${events.name} IN ('Copa Interna', 'Festival de Verao', 'Desafio Interno')`);
        expect(semesterEvents).toHaveLength(3);
        const [confirmed] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(eventRegistrations)
          .where(sql`${eventRegistrations.status} = 'confirmed'`);
        expect(confirmed!.n).toBeGreaterThanOrEqual(4);
        const rita = cast.find((s) => s.name === 'Rita Ranking')!;
        const award = await tx
          .select({ kind: studentGraduations.kind })
          .from(studentGraduations)
          .where(eq(studentGraduations.studentId, rita.id));
        expect(award).toEqual([{ kind: 'belt' }]);
      });
    }

    // Idempotent: a re-run inserts nothing anywhere.
    const count = () =>
      withPlatform(platform.db, async (tx) => {
        const tables = [users, students, classSessions, attendances, events, eventRegistrations, studentGraduations, auditLogs];
        const out: number[] = [];
        for (const table of tables) {
          const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(table);
          out.push(row!.n);
        }
        return out;
      });
    const before = await count();
    await seedReportFixtures({ appDb: app.db, platformDb: platform.db });
    expect(await count()).toEqual(before);
  });
});
