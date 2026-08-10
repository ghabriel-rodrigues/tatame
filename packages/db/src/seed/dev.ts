import { hash } from '@node-rs/argon2';
import { and, eq, sql } from 'drizzle-orm';
import type { Database, DbTransaction } from '../lib/client.js';
import { withPlatform, withTenant } from '../lib/client.js';
import {
  academies,
  academySubscriptions,
  attendances,
  classSchedules,
  classSessions,
  classes,
  credentials,
  enrollments,
  graduationRules,
  guardians,
  memberships,
  platformPlans,
  platformUsers,
  rolePermissions,
  studentGraduations,
  studentNotes,
  students,
  users,
  type checkinMethod,
  type graduationKind,
  type membershipRole,
  type platformRole,
} from '../schema/index.js';
import { findBeltId } from './belts.js';

/** Known dev password for every seeded account. Never use outside dev. */
export const DEV_PASSWORD = 'TatameDev!123';

/** OWASP-recommended argon2id parameters (19 MiB, t=2, p=1). */
export function hashDevPassword(password: string): Promise<string> {
  return hash(password, {
    // Algorithm.Argon2id — literal because @node-rs/argon2 ships an ambient
    // const enum, which isolatedModules cannot import at runtime.
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

type MembershipRole = (typeof membershipRole.enumValues)[number];
type PlatformRole = (typeof platformRole.enumValues)[number];

interface DevAcademy {
  slug: string;
  name: string;
  status: 'trial' | 'active';
  plan: string;
  subscriptionStatus: 'trialing' | 'active';
  /** White-label brand triplet — NULL = default Tatame brand (spec 011). */
  brand: { deep: string; vibrant: string; accent: string } | null;
}

const DEV_ACADEMIES: DevAcademy[] = [
  {
    slug: 'alpha-jj',
    name: 'Alpha Jiu-Jitsu',
    status: 'active',
    plan: 'Pro',
    subscriptionStatus: 'active',
    // Default brand on purpose (CFG.2): null is indistinguishable from the
    // Tatame purple, and a future default-brand change must reach it.
    brand: null,
  },
  {
    slug: 'bravo-bjj',
    name: 'Bravo BJJ Team',
    status: 'trial',
    plan: 'Essencial',
    subscriptionStatus: 'trialing',
    // "Oceano" ready-made preset, verbatim from the design-system palette
    // registry (packages/design-system/src/theme/presets.ts — CFG.2: the
    // second fixture academy makes cross-tenant white-label demoable).
    brand: { deep: '#14213D', vibrant: '#3A5FA8', accent: '#E63946' },
  },
];

interface DevUser {
  email: string;
  fullName: string;
  birthDate?: string;
  memberships: Array<{ academySlug: string; role: MembershipRole }>;
  platformRole?: PlatformRole;
}

const DEV_USERS: DevUser[] = [
  {
    email: 'aluno@tatame.dev',
    fullName: 'Ana Aluna',
    birthDate: '2000-03-15',
    memberships: [{ academySlug: 'alpha-jj', role: 'student' }],
  },
  {
    email: 'professor@tatame.dev',
    fullName: 'Paulo Professor',
    birthDate: '1988-07-02',
    memberships: [{ academySlug: 'alpha-jj', role: 'professor' }],
  },
  {
    email: 'admin@tatame.dev',
    fullName: 'Amanda Admin',
    birthDate: '1985-11-20',
    memberships: [{ academySlug: 'alpha-jj', role: 'admin' }],
  },
  {
    email: 'responsavel@tatame.dev',
    fullName: 'Renata Responsavel',
    birthDate: '1982-01-09',
    memberships: [{ academySlug: 'alpha-jj', role: 'guardian' }],
  },
  {
    // Multi-membership: professor in Alpha AND admin in Bravo (switch flows).
    email: 'multi@tatame.dev',
    fullName: 'Marcos Multi',
    birthDate: '1990-05-30',
    memberships: [
      { academySlug: 'alpha-jj', role: 'professor' },
      { academySlug: 'bravo-bjj', role: 'admin' },
      // Bravo's turmas need an in-tenant professor (ENR.5 fixtures).
      { academySlug: 'bravo-bjj', role: 'professor' },
    ],
  },
  {
    email: 'admin.bravo@tatame.dev',
    fullName: 'Bruno Bravo',
    birthDate: '1979-09-12',
    memberships: [{ academySlug: 'bravo-bjj', role: 'admin' }],
  },
  {
    email: 'owner@tatame.dev',
    fullName: 'Olivia Owner',
    memberships: [],
    platformRole: 'owner',
  },
  {
    email: 'suporte@tatame.dev',
    fullName: 'Samuel Suporte',
    memberships: [],
    platformRole: 'support',
  },
];

/** Turma fixtures per academy (ENR.5). Weekday: 0 = Sunday … 6 = Saturday. */
interface DevClassFixture {
  name: string;
  capacity: number;
  ageMin?: number;
  ageMax?: number;
  schedules: Array<{ weekday: number; startTime: string; durationMinutes: number }>;
}

const DEV_CLASSES: DevClassFixture[] = [
  {
    // "Seg · Qua · Sex 19:00" — real recurrence, one row per weekday chip.
    name: 'Adulto Gi',
    capacity: 24,
    schedules: [
      { weekday: 1, startTime: '19:00', durationMinutes: 60 },
      { weekday: 3, startTime: '19:00', durationMinutes: 60 },
      { weekday: 5, startTime: '19:00', durationMinutes: 60 },
    ],
  },
  {
    // Kids with the age range behind the "4 a 12 anos" chip + suggestion rule.
    name: 'Kids',
    capacity: 15,
    ageMin: 4,
    ageMax: 12,
    schedules: [
      { weekday: 2, startTime: '18:00', durationMinutes: 45 },
      { weekday: 4, startTime: '18:00', durationMinutes: 45 },
    ],
  },
  {
    // Seeded at capacity — exercises the "Lotada" badge and full-class paths.
    name: 'Lotada',
    capacity: 2,
    schedules: [{ weekday: 6, startTime: '10:00', durationMinutes: 60 }],
  },
];

/** Professor teaching the fixture turmas, per academy. */
const DEV_CLASS_PROFESSOR: Record<string, string> = {
  'alpha-jj': 'professor@tatame.dev',
  'bravo-bjj': 'multi@tatame.dev',
};

/** Admin actor for the seeded any-time revoke (ATT.5), per academy. */
const DEV_ACADEMY_ADMIN: Record<string, string> = {
  'alpha-jj': 'admin@tatame.dev',
  'bravo-bjj': 'admin.bravo@tatame.dev',
};

/** Record-only adult students filling `Lotada` to capacity. */
const DEV_FILLER_STUDENTS: Array<{ fullName: string; birthDate: string }> = [
  { fullName: 'Fabio Fila', birthDate: '1995-02-11' },
  { fullName: 'Flavia Fila', birthDate: '1993-08-23' },
];

/** Guardian (+2 minor dependents enrolled in Kids) per academy. */
interface DevGuardianFixture {
  fullName: string;
  /** When set, the guardian record is claimed by this seeded login. */
  userEmail?: string;
  phone: string;
  dependents: Array<{ fullName: string; birthDate: string }>;
}

const DEV_GUARDIANS: Record<string, DevGuardianFixture> = {
  'alpha-jj': {
    fullName: 'Renata Responsavel',
    userEmail: 'responsavel@tatame.dev',
    phone: '+55 11 91234-0001',
    dependents: [
      { fullName: 'Kiko Kids', birthDate: '2016-04-10' },
      { fullName: 'Lara Kids', birthDate: '2018-09-05' },
    ],
  },
  'bravo-bjj': {
    fullName: 'Gustavo Guardiao',
    phone: '+55 11 91234-0002',
    dependents: [
      { fullName: 'Bento Bravo Jr', birthDate: '2017-01-22' },
      { fullName: 'Bia Bravo', birthDate: '2019-06-30' },
    ],
  },
};

/** Default permission-toggle rows per academy (absent row = code default). */
const DEV_ROLE_PERMISSIONS: Array<{ role: MembershipRole; key: string; allowed: boolean }> = [
  { role: 'professor', key: 'events.create', allowed: true },
  { role: 'professor', key: 'invites.create', allowed: true },
  { role: 'student', key: 'store.purchase', allowed: true },
];

/** Student receiving the seeded graduation history, per academy (GRD.5). */
const DEV_GRADUATION_STUDENT: Record<string, string> = {
  'alpha-jj': 'Ana Aluna',
  'bravo-bjj': 'Fabio Fila',
};

export interface SeedDevHandles {
  /** RLS-enforced pool (`tatame_app`) — tenant-scoped rows go through it. */
  appDb: Database;
  /** BYPASSRLS pool (`tatame_platform`) — global provisioning rows. */
  platformDb: Database;
}

/**
 * Dev fixtures: 2 academies with subscriptions, users covering all six
 * personas (+ a multi-membership user), argon2id-hashed known password.
 *
 * Global rows (academies, users, credentials, platform users, subscriptions)
 * are provisioned via the platform pool; tenant-scoped rows (memberships,
 * role_permissions) are written through `withTenant` on the app pool so the
 * RLS WITH CHECK path stays honest. Idempotent.
 *
 * Requires `seedPlatformPlans` AND `seedBeltCatalog` to have run first (the
 * graduation fixtures resolve belts from the shared catalog).
 */
export async function seedDevFixtures({ appDb, platformDb }: SeedDevHandles): Promise<void> {
  const secretHash = await hashDevPassword(DEV_PASSWORD);

  const academyIdBySlug = new Map<string, string>();
  const userIdByEmail = new Map<string, string>();

  await withPlatform(platformDb, async (tx) => {
    // Academies + subscriptions.
    for (const a of DEV_ACADEMIES) {
      const [academy] = await tx
        .insert(academies)
        .values({
          name: a.name,
          slug: a.slug,
          status: a.status,
          contactEmail: `contato@${a.slug}.tatame.dev`,
          city: 'Sao Paulo',
          brandDeep: a.brand?.deep ?? null,
          brandVibrant: a.brand?.vibrant ?? null,
          brandAccent: a.brand?.accent ?? null,
        })
        .onConflictDoUpdate({
          target: academies.slug,
          set: {
            name: a.name,
            status: a.status,
            brandDeep: a.brand?.deep ?? null,
            brandVibrant: a.brand?.vibrant ?? null,
            brandAccent: a.brand?.accent ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: academies.id });
      if (!academy) throw new Error(`Failed to upsert academy ${a.slug}`);
      academyIdBySlug.set(a.slug, academy.id);

      const [plan] = await tx
        .select({ id: platformPlans.id })
        .from(platformPlans)
        .where(eq(platformPlans.name, a.plan));
      if (!plan) throw new Error(`Platform plan ${a.plan} not seeded — run seedPlatformPlans first`);

      const existing = await tx
        .select({ id: academySubscriptions.id })
        .from(academySubscriptions)
        .where(eq(academySubscriptions.academyId, academy.id));
      if (existing.length === 0) {
        await tx.insert(academySubscriptions).values({
          academyId: academy.id,
          platformPlanId: plan.id,
          status: a.subscriptionStatus,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }
    }

    // Users + credentials + platform roles.
    for (const u of DEV_USERS) {
      const found = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${u.email.toLowerCase()}`);
      let userId = found[0]?.id;
      if (!userId) {
        const [inserted] = await tx
          .insert(users)
          .values({
            email: u.email.toLowerCase(),
            fullName: u.fullName,
            birthDate: u.birthDate,
          })
          .returning({ id: users.id });
        if (!inserted) throw new Error(`Failed to insert user ${u.email}`);
        userId = inserted.id;
      }
      userIdByEmail.set(u.email, userId);

      await tx
        .insert(credentials)
        .values({ userId, provider: 'password', secretHash })
        .onConflictDoUpdate({
          target: [credentials.userId, credentials.provider],
          set: { secretHash, updatedAt: new Date() },
        });

      if (u.platformRole) {
        await tx
          .insert(platformUsers)
          .values({ userId, role: u.platformRole })
          .onConflictDoUpdate({
            target: platformUsers.userId,
            set: { role: u.platformRole, updatedAt: new Date() },
          });
      }
    }
  });

  // Tenant-scoped rows through the RLS-enforced path (WITH CHECK honest).
  for (const a of DEV_ACADEMIES) {
    const tenantId = academyIdBySlug.get(a.slug);
    if (!tenantId) throw new Error(`Missing academy id for ${a.slug}`);

    await withTenant(appDb, tenantId, async (tx) => {
      for (const u of DEV_USERS) {
        for (const m of u.memberships) {
          if (m.academySlug !== a.slug) continue;
          const userId = userIdByEmail.get(u.email);
          if (!userId) throw new Error(`Missing user id for ${u.email}`);
          await tx
            .insert(memberships)
            .values({ tenantId, userId, role: m.role })
            .onConflictDoNothing({
              target: [memberships.tenantId, memberships.userId, memberships.role],
            });
        }
      }

      for (const p of DEV_ROLE_PERMISSIONS) {
        await tx
          .insert(rolePermissions)
          .values({ tenantId, role: p.role, permissionKey: p.key, allowed: p.allowed })
          .onConflictDoUpdate({
            target: [rolePermissions.tenantId, rolePermissions.role, rolePermissions.permissionKey],
            set: { allowed: p.allowed, updatedAt: new Date() },
          });
      }

      // ENR.5 — enrollment fixtures: 3 turmas with schedules (Kids with age
      // range, Lotada at capacity), enrollments, and a guardian with 2
      // dependents. All written through the RLS-enforced tenant path.
      const professorEmail = DEV_CLASS_PROFESSOR[a.slug];
      if (!professorEmail) throw new Error(`Missing fixture professor for ${a.slug}`);
      const professorUserId = userIdByEmail.get(professorEmail);
      if (!professorUserId) throw new Error(`Missing user id for ${professorEmail}`);

      const classIdByName = new Map<string, string>();
      for (const c of DEV_CLASSES) {
        const classId = await upsertClass(tx, tenantId, professorUserId, c);
        classIdByName.set(c.name, classId);
        for (const s of c.schedules) {
          await tx
            .insert(classSchedules)
            .values({
              tenantId,
              classId,
              weekday: s.weekday,
              startTime: s.startTime,
              durationMinutes: s.durationMinutes,
            })
            .onConflictDoNothing({
              target: [
                classSchedules.tenantId,
                classSchedules.classId,
                classSchedules.weekday,
                classSchedules.startTime,
              ],
            });
        }
      }

      const lotadaId = classIdByName.get('Lotada');
      const kidsId = classIdByName.get('Kids');
      const adultoId = classIdByName.get('Adulto Gi');
      if (!lotadaId || !kidsId || !adultoId) throw new Error('Fixture classes missing');

      // Record-only adults filling Lotada to its capacity of 2.
      const studentIdByName = new Map<string, string>();
      for (const f of DEV_FILLER_STUDENTS) {
        const studentId = await upsertStudent(tx, tenantId, f);
        studentIdByName.set(f.fullName, studentId);
        await enroll(tx, tenantId, lotadaId, studentId);
      }

      // The claimed aluno login trains in Adulto Gi (alpha only — that is
      // where the student membership lives).
      if (a.slug === 'alpha-jj') {
        const alunoUserId = userIdByEmail.get('aluno@tatame.dev');
        if (!alunoUserId) throw new Error('Missing user id for aluno@tatame.dev');
        const anaId = await upsertStudent(tx, tenantId, {
          fullName: 'Ana Aluna',
          birthDate: '2000-03-15',
          userId: alunoUserId,
        });
        studentIdByName.set('Ana Aluna', anaId);
        await enroll(tx, tenantId, adultoId, anaId);
      }

      // Guardian with 2 minor dependents, both enrolled in Kids.
      const g = DEV_GUARDIANS[a.slug];
      if (!g) throw new Error(`Missing fixture guardian for ${a.slug}`);
      const guardianUserId = g.userEmail ? userIdByEmail.get(g.userEmail) : undefined;
      if (g.userEmail && !guardianUserId) throw new Error(`Missing user id for ${g.userEmail}`);
      const guardianId = await upsertGuardian(tx, tenantId, g, guardianUserId);
      for (const d of g.dependents) {
        const dependentId = await upsertStudent(tx, tenantId, { ...d, guardianId });
        studentIdByName.set(d.fullName, dependentId);
        await enroll(tx, tenantId, kidsId, dependentId);
      }

      // ATT.5 — attendance fixtures: this week's materialized sessions (the
      // most recent occurrence of every schedule slot, on or before today)
      // and mixed-method attendances, including one revoked-then-re-checked-in
      // pair voided through the audited attendance_revoke seam (admin actor,
      // any-time window). All written through the RLS-enforced tenant path.
      const adminEmail = DEV_ACADEMY_ADMIN[a.slug];
      if (!adminEmail) throw new Error(`Missing fixture admin for ${a.slug}`);
      const adminUserId = userIdByEmail.get(adminEmail);
      if (!adminUserId) throw new Error(`Missing user id for ${adminEmail}`);

      const latestSessionByClass = new Map<string, { id: string; startsAt: Date }>();
      for (const c of DEV_CLASSES) {
        const classId = classIdByName.get(c.name);
        if (!classId) throw new Error(`Fixture class ${c.name} missing`);
        for (const s of c.schedules) {
          const startsAt = lastOccurrenceOnOrBefore(s.weekday, s.startTime);
          const sessionId = await upsertSession(tx, tenantId, classId, startsAt);
          const latest = latestSessionByClass.get(c.name);
          if (!latest || startsAt > latest.startsAt) {
            latestSessionByClass.set(c.name, { id: sessionId, startsAt });
          }
        }
      }

      const lotadaSession = latestSessionByClass.get('Lotada');
      const kidsSession = latestSessionByClass.get('Kids');
      const adultoSession = latestSessionByClass.get('Adulto Gi');
      if (!lotadaSession || !kidsSession || !adultoSession) {
        throw new Error('Fixture sessions missing');
      }
      const minutesAfter = (base: Date, minutes: number) =>
        new Date(base.getTime() + minutes * 60_000);

      // Self check-ins on Lotada: one per method the aluno sheet offers.
      const fabioId = studentIdByName.get('Fabio Fila');
      const flaviaId = studentIdByName.get('Flavia Fila');
      if (!fabioId || !flaviaId) throw new Error('Fixture filler students missing');
      await ensureActiveAttendance(tx, tenantId, lotadaSession.id, fabioId, {
        method: 'qr',
        checkedInAt: minutesAfter(lotadaSession.startsAt, 2),
      });
      await ensureActiveAttendance(tx, tenantId, lotadaSession.id, flaviaId, {
        method: 'code',
        checkedInAt: minutesAfter(lotadaSession.startsAt, 4),
      });

      // Ana self-checks-in by QR on the latest Adulto Gi session (alpha only).
      const anaId = studentIdByName.get('Ana Aluna');
      if (anaId) {
        await ensureActiveAttendance(tx, tenantId, adultoSession.id, anaId, {
          method: 'qr',
          checkedInAt: minutesAfter(adultoSession.startsAt, 1),
        });
      }

      // Kids roll call is manual, recorded by the professor. The first
      // dependent's row is revoked through the seam and re-inserted — the
      // sanctioned correction pattern (partial unique allows the re-check-in).
      const [dep0, dep1] = g.dependents.map((d) => studentIdByName.get(d.fullName));
      if (!dep0 || !dep1) throw new Error('Fixture dependents missing');
      await ensureActiveAttendance(tx, tenantId, kidsSession.id, dep1, {
        method: 'manual',
        recordedByUserId: professorUserId,
        checkedInAt: minutesAfter(kidsSession.startsAt, 3),
      });
      await ensureRevokedRecheckedAttendance(tx, tenantId, kidsSession.id, dep0, {
        recordedByUserId: professorUserId,
        revokedByUserId: adminUserId,
        checkedInAt: minutesAfter(kidsSession.startsAt, 5),
      });

      // GRD.5 — graduation fixtures: an immutable history for one student
      // (belt award + degree awards + one revocation compensation pair, all
      // audited in-transaction), a régua override (Azul 45 lessons), the
      // Laranja kids toggle off (admin-16), and a persistent professor
      // observação. All written through the RLS-enforced tenant path; belts
      // resolved from the shared catalog (public SELECT).
      const gradTargetName = DEV_GRADUATION_STUDENT[a.slug];
      if (!gradTargetName) throw new Error(`Missing graduation fixture student for ${a.slug}`);
      const gradStudentId = studentIdByName.get(gradTargetName);
      if (!gradStudentId) throw new Error(`Fixture student ${gradTargetName} missing`);

      const brancaId = await findBeltId(tx, 'adult', 'Branca');
      const azulId = await findBeltId(tx, 'adult', 'Azul');
      const pretaId = await findBeltId(tx, 'adult', 'Preta');
      const laranjaId = await findBeltId(tx, 'kids', 'Laranja');

      await upsertGraduationRule(tx, tenantId, azulId, { lessonsPerDegree: 45, enabled: true });
      await upsertGraduationRule(tx, tenantId, laranjaId, { lessonsPerDegree: 40, enabled: false });

      await ensureGraduationHistory(tx, tenantId, gradStudentId, {
        beltId: azulId,
        awardedByUserId: professorUserId,
        revokedByUserId: adminUserId,
      });

      await ensureStudentNote(tx, tenantId, gradStudentId, {
        authorUserId: professorUserId,
        body: 'Boa evolução na guarda fechada. Preparar para o próximo exame.',
      });

      // Display-only professor rank ("Faixa preta · 2º dan") and the Adulto
      // Gi belt range ("Branca a Azul" chips) — idempotent fixed values.
      await tx
        .update(memberships)
        .set({ beltId: pretaId, beltDegree: 2 })
        .where(
          and(
            eq(memberships.tenantId, tenantId),
            eq(memberships.userId, professorUserId),
            eq(memberships.role, 'professor'),
          ),
        );
      await tx
        .update(classes)
        .set({ minBeltId: brancaId, maxBeltId: azulId })
        .where(and(eq(classes.tenantId, tenantId), eq(classes.id, adultoId)));
    });
  }
}

async function upsertClass(
  tx: DbTransaction,
  tenantId: string,
  professorUserId: string,
  c: DevClassFixture,
): Promise<string> {
  const found = await tx
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.tenantId, tenantId), eq(classes.name, c.name)));
  if (found[0]) return found[0].id;
  const [inserted] = await tx
    .insert(classes)
    .values({
      tenantId,
      name: c.name,
      professorUserId,
      capacity: c.capacity,
      ageMin: c.ageMin,
      ageMax: c.ageMax,
    })
    .returning({ id: classes.id });
  if (!inserted) throw new Error(`Failed to insert class ${c.name}`);
  return inserted.id;
}

async function upsertStudent(
  tx: DbTransaction,
  tenantId: string,
  s: { fullName: string; birthDate: string; userId?: string; guardianId?: string },
): Promise<string> {
  const found = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.fullName, s.fullName)));
  if (found[0]) return found[0].id;
  const [inserted] = await tx
    .insert(students)
    .values({
      tenantId,
      fullName: s.fullName,
      birthDate: s.birthDate,
      userId: s.userId,
      guardianId: s.guardianId,
    })
    .returning({ id: students.id });
  if (!inserted) throw new Error(`Failed to insert student ${s.fullName}`);
  return inserted.id;
}

async function upsertGuardian(
  tx: DbTransaction,
  tenantId: string,
  g: DevGuardianFixture,
  userId: string | undefined,
): Promise<string> {
  const found = await tx
    .select({ id: guardians.id })
    .from(guardians)
    .where(and(eq(guardians.tenantId, tenantId), eq(guardians.fullName, g.fullName)));
  if (found[0]) return found[0].id;
  const [inserted] = await tx
    .insert(guardians)
    .values({ tenantId, fullName: g.fullName, phone: g.phone, userId })
    .returning({ id: guardians.id });
  if (!inserted) throw new Error(`Failed to insert guardian ${g.fullName}`);
  return inserted.id;
}

async function enroll(
  tx: DbTransaction,
  tenantId: string,
  classId: string,
  studentId: string,
): Promise<void> {
  await tx
    .insert(enrollments)
    .values({ tenantId, classId, studentId })
    .onConflictDoNothing({
      target: [enrollments.tenantId, enrollments.classId, enrollments.studentId],
    });
}

type CheckinMethod = (typeof checkinMethod.enumValues)[number];
type GraduationKind = (typeof graduationKind.enumValues)[number];

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000);

/** Upserts a per-academy graduation rule row on `(tenant_id, belt_id)`. */
async function upsertGraduationRule(
  tx: DbTransaction,
  tenantId: string,
  beltId: string,
  rule: { lessonsPerDegree: number; enabled: boolean },
): Promise<void> {
  await tx
    .insert(graduationRules)
    .values({ tenantId, beltId, ...rule })
    .onConflictDoUpdate({
      target: [graduationRules.tenantId, graduationRules.beltId],
      set: { ...rule, updatedAt: new Date() },
    });
}

/**
 * Inserts one graduation row and its audit entry in the same transaction —
 * the resolved audit decision has no unaudited graduation mutations, seeds
 * included (`graduation.awarded` / `graduation.revoked`).
 */
async function insertGraduation(
  tx: DbTransaction,
  row: {
    tenantId: string;
    studentId: string;
    beltId: string;
    kind: GraduationKind;
    degree: number;
    awardedByUserId: string;
    awardedAt: Date;
    notes?: string;
    reversesGraduationId?: string;
  },
): Promise<string> {
  const [inserted] = await tx
    .insert(studentGraduations)
    .values(row)
    .returning({ id: studentGraduations.id });
  if (!inserted) throw new Error('Failed to insert graduation row');
  const isRevocation = row.kind === 'revocation';
  const action = isRevocation ? 'graduation.revoked' : 'graduation.awarded';
  const metadata = isRevocation
    ? { reverses_graduation_id: row.reversesGraduationId, reason: row.notes ?? null }
    : { belt_id: row.beltId, degree: row.degree, kind: row.kind };
  await tx.execute(
    sql`SELECT audit_append(${row.tenantId}::uuid, ${row.awardedByUserId}::uuid, NULL,
          ${action}, ${'graduation'}, ${inserted.id}, ${JSON.stringify(metadata)}::jsonb)`,
  );
  return inserted.id;
}

/**
 * The GRD.5 history, only when the student has no rows yet (append-only
 * fixtures cannot upsert — skip-if-present keeps re-runs stable): Azul belt
 * award + two valid degrees, then a third degree reversed by an admin
 * `revocation` compensation row — the derived current state is Azul, 2 graus.
 */
async function ensureGraduationHistory(
  tx: DbTransaction,
  tenantId: string,
  studentId: string,
  opts: { beltId: string; awardedByUserId: string; revokedByUserId: string },
): Promise<void> {
  const existing = await tx
    .select({ id: studentGraduations.id })
    .from(studentGraduations)
    .where(
      and(eq(studentGraduations.tenantId, tenantId), eq(studentGraduations.studentId, studentId)),
    );
  if (existing.length > 0) return;

  const base = { tenantId, studentId, beltId: opts.beltId, awardedByUserId: opts.awardedByUserId };
  await insertGraduation(tx, {
    ...base,
    kind: 'belt',
    degree: 0,
    awardedAt: daysAgo(300),
    notes: 'Exame de faixa — aprovado com distinção.',
  });
  await insertGraduation(tx, { ...base, kind: 'degree', degree: 1, awardedAt: daysAgo(200) });
  await insertGraduation(tx, {
    ...base,
    kind: 'degree',
    degree: 2,
    awardedAt: daysAgo(100),
    notes: 'Constância exemplar nos treinos.',
  });
  const wrongDegreeId = await insertGraduation(tx, {
    ...base,
    kind: 'degree',
    degree: 3,
    awardedAt: daysAgo(30),
  });
  await insertGraduation(tx, {
    ...base,
    kind: 'revocation',
    degree: 0,
    awardedByUserId: opts.revokedByUserId,
    awardedAt: daysAgo(29),
    notes: 'Grau lançado em duplicidade.',
    reversesGraduationId: wrongDegreeId,
  });
}

/** Inserts the persistent observação unless the author already left one. */
async function ensureStudentNote(
  tx: DbTransaction,
  tenantId: string,
  studentId: string,
  note: { authorUserId: string; body: string },
): Promise<void> {
  const existing = await tx
    .select({ id: studentNotes.id })
    .from(studentNotes)
    .where(
      and(
        eq(studentNotes.tenantId, tenantId),
        eq(studentNotes.studentId, studentId),
        eq(studentNotes.authorUserId, note.authorUserId),
      ),
    );
  if (existing.length > 0) return;
  await tx.insert(studentNotes).values({ tenantId, studentId, ...note });
}

/** Local YYYY-MM-DD for a Date (session_date is a tenant-local day). */
function isoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Most recent occurrence of a weekly slot on or before today — "this week's"
 * materialized session for that slot (lazy semantics: only days that
 * happened get rows). Weekday: 0 = Sunday … 6 = Saturday.
 */
function lastOccurrenceOnOrBefore(weekday: number, startTime: string): Date {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7));
  const [hours = 0, minutes = 0] = startTime.split(':').map(Number);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** Idempotent session materialization on `(tenant, class, session_date)`. */
async function upsertSession(
  tx: DbTransaction,
  tenantId: string,
  classId: string,
  startsAt: Date,
): Promise<string> {
  const sessionDate = isoDate(startsAt);
  const found = await tx
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.tenantId, tenantId),
        eq(classSessions.classId, classId),
        eq(classSessions.sessionDate, sessionDate),
      ),
    );
  if (found[0]) return found[0].id;
  const [inserted] = await tx
    .insert(classSessions)
    .values({ tenantId, classId, sessionDate, startsAt })
    .returning({ id: classSessions.id });
  if (!inserted) throw new Error(`Failed to insert session ${classId}@${sessionDate}`);
  return inserted.id;
}

/** Inserts an attendance unless the pair already has an active one. */
async function ensureActiveAttendance(
  tx: DbTransaction,
  tenantId: string,
  classSessionId: string,
  studentId: string,
  opts: { method: CheckinMethod; checkedInAt: Date; recordedByUserId?: string },
): Promise<void> {
  const active = await tx
    .select({ id: attendances.id })
    .from(attendances)
    .where(
      and(
        eq(attendances.tenantId, tenantId),
        eq(attendances.classSessionId, classSessionId),
        eq(attendances.studentId, studentId),
        sql`${attendances.revokedAt} IS NULL`,
      ),
    );
  if (active[0]) return;
  await tx.insert(attendances).values({
    tenantId,
    classSessionId,
    studentId,
    method: opts.method,
    checkedInAt: opts.checkedInAt,
    recordedByUserId: opts.recordedByUserId,
  });
}

/**
 * The sanctioned correction pattern as a fixture: a professor-recorded manual
 * row, voided through the audited `attendance_revoke` seam (admin actor —
 * any-time window, audit row written in the same transaction), then a fresh
 * active re-check-in for the same pair. On re-runs the pair already has rows
 * and only a missing active row is repaired — counts stay stable.
 */
async function ensureRevokedRecheckedAttendance(
  tx: DbTransaction,
  tenantId: string,
  classSessionId: string,
  studentId: string,
  opts: { recordedByUserId: string; revokedByUserId: string; checkedInAt: Date },
): Promise<void> {
  const existing = await tx
    .select({ id: attendances.id, revokedAt: attendances.revokedAt })
    .from(attendances)
    .where(
      and(
        eq(attendances.tenantId, tenantId),
        eq(attendances.classSessionId, classSessionId),
        eq(attendances.studentId, studentId),
      ),
    );
  if (existing.length === 0) {
    const [first] = await tx
      .insert(attendances)
      .values({
        tenantId,
        classSessionId,
        studentId,
        method: 'manual',
        checkedInAt: opts.checkedInAt,
        recordedByUserId: opts.recordedByUserId,
      })
      .returning({ id: attendances.id });
    if (!first) throw new Error('Failed to insert revocable attendance');
    const revoked = await tx.execute(
      sql`SELECT status FROM attendance_revoke(${tenantId}::uuid, ${first.id}::uuid, ${opts.revokedByUserId}::uuid, ${'seed: roll-call correction'})`,
    );
    if (revoked.rows[0]?.['status'] !== 'revoked') {
      throw new Error(`Seed revoke failed: ${String(revoked.rows[0]?.['status'])}`);
    }
  }
  await ensureActiveAttendance(tx, tenantId, classSessionId, studentId, {
    method: 'manual',
    checkedInAt: new Date(opts.checkedInAt.getTime() + 60_000),
    recordedByUserId: opts.recordedByUserId,
  });
}
