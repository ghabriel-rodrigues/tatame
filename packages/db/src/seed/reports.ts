import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database, DbTransaction } from '../lib/client.js';
import { withPlatform, withTenant } from '../lib/client.js';
import {
  academies,
  attendances,
  classSessions,
  classes,
  eventRegistrations,
  events,
  guardians,
  studentGraduations,
  students,
  users,
} from '../schema/index.js';
import { findBeltId } from './belts.js';

/**
 * Reports & rankings fixtures (spec 013, REP.2).
 *
 * 1. The fixture aluno gets a FULL profile with CPF/RG set — the locked
 *    dashed-box state of aluno-18 is demoable on first login (CPF passes the
 *    service checksum; write-once means the seed only fills NULL fields).
 * 2. Per fixture academy, a ranking spread so both segments render non-empty
 *    with a distinct top 3 and the fixture aluno inside the top 10:
 *    - three record-only adult students (Rita/Rodrigo/Renan Ranking) with
 *      graded attendance counts on extra current-month sessions. They are
 *      deliberately NOT enrolled anywhere: rankings are academy-wide over
 *      active students, and enrollment-derived surfaces (occupancy chips,
 *      rosters, frequência denominators) must keep their seeded numbers.
 *    - three already-happened published free events inside the current
 *      semester with graded confirmed registrations (Por eventos window).
 * 3. One belt award inside the current semester (Rita) so the Graduações
 *    report is never empty near a semester boundary — the GRD.5 history uses
 *    relative days that can fall into the previous half.
 *
 * All tenant rows go through `withTenant` (RLS honest); the graduation row is
 * audited in-transaction via `audit_append` like every award. Idempotent:
 * students/events keyed on (tenant, name), sessions on (tenant, class, date),
 * attendances/registrations on their active-row uniques, the profile on
 * NULL-only fills.
 */

/** Known-valid CPF (checksum passes) — the locked Identificação fixture. */
const FIXTURE_ALUNO_PROFILE = {
  email: 'aluno@tatame.dev',
  gender: 'female',
  cpf: '39053344705',
  rg: '12.345.678-9',
  addressLine: 'Rua do Tatame, 123 — ap 42',
  addressCity: 'Sao Paulo',
  addressState: 'SP',
  addressZip: '01310100',
  emergencyContactName: 'Renata Responsavel',
  emergencyContactPhone: '+55 11 91234-0001',
};

/** Record-only adults carrying the graded lesson counts (top 3 of aluno-06). */
const RANKING_STUDENTS: Array<{ fullName: string; birthDate: string; lessons: number }> = [
  { fullName: 'Rita Ranking', birthDate: '1994-01-12', lessons: 4 },
  { fullName: 'Rodrigo Ranking', birthDate: '1991-06-25', lessons: 3 },
  { fullName: 'Renan Ranking', birthDate: '1997-10-03', lessons: 2 },
];

/**
 * Already-happened free events inside the current semester. `participants`
 * name the confirmed registrations: `main` = the academy's fixture aluno,
 * `dep0` = the guardian's first dependent.
 */
const RANKING_EVENTS: Array<{
  name: string;
  description: string;
  daysAgo: number;
  participants: Array<'main' | 'dep0' | 'Rita Ranking' | 'Rodrigo Ranking'>;
}> = [
  {
    name: 'Copa Interna',
    description: 'Copa interna amistosa entre as turmas da academia.',
    daysAgo: 3,
    participants: ['main', 'dep0', 'Rita Ranking', 'Rodrigo Ranking'],
  },
  {
    name: 'Festival de Verao',
    description: 'Festival de treinos e confraternizacao da equipe.',
    daysAgo: 10,
    participants: ['main', 'Rita Ranking'],
  },
  {
    name: 'Desafio Interno',
    description: 'Desafio tecnico interno com arbitragem dos professores.',
    daysAgo: 17,
    participants: ['main'],
  },
];

/** Mirrors the dev-seed casts (same academies, same people). */
const MAIN_STUDENT: Record<string, string> = {
  'alpha-jj': 'Ana Aluna',
  'bravo-bjj': 'Fabio Fila',
};
const PROFESSOR_EMAIL: Record<string, string> = {
  'alpha-jj': 'professor@tatame.dev',
  'bravo-bjj': 'multi@tatame.dev',
};
const ADMIN_EMAIL: Record<string, string> = {
  'alpha-jj': 'admin@tatame.dev',
  'bravo-bjj': 'admin.bravo@tatame.dev',
};

export interface SeedReportHandles {
  /** RLS-enforced pool (`tatame_app`) — tenant-scoped rows go through it. */
  appDb: Database;
  /** BYPASSRLS pool (`tatame_platform`) — auth-global profile + lookups. */
  platformDb: Database;
}

/** Tenant-local (America/Sao_Paulo) YYYY-MM-DD — mirrors the API time lib. */
function spDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(at);
}

const DAY_MS = 24 * 3600 * 1000;

/** Start instant of the tenant-local calendar semester containing `now`. */
function semesterStart(now: Date): Date {
  const today = spDate(now);
  const year = today.slice(0, 4);
  const month = Number(today.slice(5, 7));
  // Fixed -03:00 offset (Brazil abolished DST) — matches the API time lib.
  return new Date(`${year}-${month <= 6 ? '01' : '07'}-01T00:00:00-03:00`);
}

/**
 * An instant `daysAgo` days in the past, clamped inside the current semester
 * and never in the future — the "already happened this semester" guarantee
 * the ranking/graduação windows need regardless of the run date.
 */
function pastInSemester(daysAgo: number, now: Date = new Date()): Date {
  const candidate = new Date(now.getTime() - daysAgo * DAY_MS);
  const start = semesterStart(now);
  if (candidate >= start) return candidate;
  // Ran within `daysAgo` days of a semester boundary: land halfway between
  // the boundary and now (always past, always inside the half).
  return new Date((start.getTime() + now.getTime()) / 2);
}

/**
 * Requires `seedDevFixtures` (academies, users, students, classes) and
 * `seedBeltCatalog` to have run first.
 */
export async function seedReportFixtures({ appDb, platformDb }: SeedReportHandles): Promise<void> {
  // 1. The fixture aluno's full profile — NULL-only fill so a demoed edit or
  //    the write-once lock is never clobbered by a re-run.
  await withPlatform(platformDb, async (tx) => {
    const { email, ...profile } = FIXTURE_ALUNO_PROFILE;
    await tx
      .update(users)
      .set(profile)
      .where(and(sql`lower(${users.email}) = ${email}`, isNull(users.cpf)));
  });

  for (const slug of Object.keys(MAIN_STUDENT)) {
    const [academy] = await withPlatform(platformDb, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
    );
    if (!academy) throw new Error(`Fixture academy ${slug} missing — run seedDevFixtures first`);
    const tenantId = academy.id;

    const userIdByEmail = new Map<string, string>();
    for (const email of [PROFESSOR_EMAIL[slug]!, ADMIN_EMAIL[slug]!]) {
      const [user] = await withPlatform(platformDb, (tx) =>
        tx.select({ id: users.id }).from(users).where(eq(users.email, email)),
      );
      if (!user) throw new Error(`Missing user ${email} — run seedDevFixtures first`);
      userIdByEmail.set(email, user.id);
    }
    const professorUserId = userIdByEmail.get(PROFESSOR_EMAIL[slug]!)!;
    const actorUserId = userIdByEmail.get(ADMIN_EMAIL[slug]!)!;

    await withTenant(appDb, tenantId, async (tx) => {
      const mainName = MAIN_STUDENT[slug]!;
      const [main] = await tx
        .select({ id: students.id, userId: students.userId })
        .from(students)
        .where(and(eq(students.tenantId, tenantId), eq(students.fullName, mainName)));
      if (!main) throw new Error(`Fixture student ${mainName} missing for ${slug}`);

      const [guardian] = await tx
        .select({ id: guardians.id, userId: guardians.userId })
        .from(guardians)
        .where(eq(guardians.tenantId, tenantId));
      if (!guardian) throw new Error(`Fixture guardian missing for ${slug}`);
      const [dep0] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.tenantId, tenantId), eq(students.guardianId, guardian.id)))
        .orderBy(students.fullName);
      if (!dep0) throw new Error(`Fixture dependent missing for ${slug}`);

      // Record-only ranking students (no login, no enrollment — see header).
      const rankingIdByName = new Map<string, string>();
      for (const s of RANKING_STUDENTS) {
        rankingIdByName.set(s.fullName, await ensureStudent(tx, tenantId, s));
      }

      // ── Por aulas: graded counts on extra current-month sessions ────────
      const [adulto] = await tx
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.tenantId, tenantId), eq(classes.name, 'Adulto Gi')));
      if (!adulto) throw new Error(`Fixture class Adulto Gi missing for ${slug}`);

      const now = new Date();
      const monthKey = spDate(now).slice(0, 7);
      // Walk back from today; keep only days still inside the current month
      // (lazy-materialization semantics: only days that happened get rows).
      const sessionIds: string[] = [];
      for (let offset = 0; offset < 8 && sessionIds.length < 4; offset += 1) {
        const at = new Date(now.getTime() - offset * DAY_MS);
        if (spDate(at).slice(0, 7) !== monthKey) break;
        sessionIds.push(await ensureSession(tx, tenantId, adulto.id, at));
      }

      for (const s of RANKING_STUDENTS) {
        const studentId = rankingIdByName.get(s.fullName)!;
        for (const sessionId of sessionIds.slice(0, s.lessons)) {
          await ensureActiveAttendance(tx, tenantId, sessionId, studentId, professorUserId);
        }
      }
      // The fixture aluno's guaranteed current-month lesson (their dev-seed
      // check-in can fall into the previous month early in a month).
      if (sessionIds[0]) {
        await ensureActiveAttendance(tx, tenantId, sessionIds[0], main.id, professorUserId);
      }

      // ── Por eventos: already-happened semester events, graded counts ────
      for (const e of RANKING_EVENTS) {
        const eventId = await ensureEvent(tx, {
          tenantId,
          name: e.name,
          description: e.description,
          startsAt: pastInSemester(e.daysAgo, now),
          responsibleUserId: professorUserId,
          actorUserId,
        });
        for (const participant of e.participants) {
          const studentId =
            participant === 'main'
              ? main.id
              : participant === 'dep0'
                ? dep0.id
                : rankingIdByName.get(participant)!;
          const confirmedByUserId =
            participant === 'main'
              ? (main.userId ?? actorUserId)
              : participant === 'dep0'
                ? (guardian.userId ?? actorUserId)
                : actorUserId;
          await ensureConfirmedRegistration(tx, {
            tenantId,
            eventId,
            studentId,
            confirmedByUserId,
            actorUserId,
          });
        }
      }

      // ── Graduações: one belt award guaranteed inside the semester ───────
      const azulId = await findBeltId(tx, 'adult', 'Azul');
      await ensureBeltAward(tx, {
        tenantId,
        studentId: rankingIdByName.get('Rita Ranking')!,
        beltId: azulId,
        awardedByUserId: professorUserId,
        awardedAt: pastInSemester(4, now),
      });
    });
  }
}

/** Inserts a record-only student keyed on (tenant, fullName). */
async function ensureStudent(
  tx: DbTransaction,
  tenantId: string,
  s: { fullName: string; birthDate: string },
): Promise<string> {
  const found = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.fullName, s.fullName)));
  if (found[0]) return found[0].id;
  const [inserted] = await tx
    .insert(students)
    .values({ tenantId, fullName: s.fullName, birthDate: s.birthDate })
    .returning({ id: students.id });
  if (!inserted) throw new Error(`Failed to insert student ${s.fullName}`);
  return inserted.id;
}

/** Idempotent session materialization on `(tenant, class, session_date)`. */
async function ensureSession(
  tx: DbTransaction,
  tenantId: string,
  classId: string,
  at: Date,
): Promise<string> {
  const sessionDate = spDate(at);
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
    .values({ tenantId, classId, sessionDate, startsAt: at, status: 'done' })
    .returning({ id: classSessions.id });
  if (!inserted) throw new Error(`Failed to insert session ${classId}@${sessionDate}`);
  return inserted.id;
}

/** Inserts a professor-recorded manual attendance unless an active one exists. */
async function ensureActiveAttendance(
  tx: DbTransaction,
  tenantId: string,
  classSessionId: string,
  studentId: string,
  recordedByUserId: string,
): Promise<void> {
  const active = await tx
    .select({ id: attendances.id })
    .from(attendances)
    .where(
      and(
        eq(attendances.tenantId, tenantId),
        eq(attendances.classSessionId, classSessionId),
        eq(attendances.studentId, studentId),
        isNull(attendances.revokedAt),
      ),
    );
  if (active[0]) return;
  await tx.insert(attendances).values({
    tenantId,
    classSessionId,
    studentId,
    method: 'manual',
    recordedByUserId,
  });
}

/** Inserts a published (already-happened) free event keyed on (tenant, name). */
async function ensureEvent(
  tx: DbTransaction,
  e: {
    tenantId: string;
    name: string;
    description: string;
    startsAt: Date;
    responsibleUserId: string;
    actorUserId: string;
  },
): Promise<string> {
  const found = await tx
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.tenantId, e.tenantId), eq(events.name, e.name)));
  if (found[0]) return found[0].id;
  const [inserted] = await tx
    .insert(events)
    .values({
      tenantId: e.tenantId,
      name: e.name,
      description: e.description,
      bannerPreset: 'event-purple-pink',
      location: 'Tatame principal',
      startsAt: e.startsAt,
      priceCents: null, // gratuito — confirmations need no charge
      status: 'published',
      responsibleUserId: e.responsibleUserId,
    })
    .returning({ id: events.id });
  if (!inserted) throw new Error(`Failed to insert event ${e.name}`);
  await tx.execute(
    sql`SELECT audit_append(${e.tenantId}::uuid, ${e.actorUserId}::uuid, NULL,
          ${'events.event.created'}, ${'event'}, ${inserted.id},
          ${JSON.stringify({ name: e.name, status: 'published', price_cents: null })}::jsonb)`,
  );
  await tx.execute(
    sql`SELECT audit_append(${e.tenantId}::uuid, ${e.actorUserId}::uuid, NULL,
          ${'events.event.published'}, ${'event'}, ${inserted.id},
          ${JSON.stringify({ starts_at: e.startsAt.toISOString() })}::jsonb)`,
  );
  return inserted.id;
}

/** Inserts a confirmed registration keyed on the (tenant, event, student) unique. */
async function ensureConfirmedRegistration(
  tx: DbTransaction,
  r: {
    tenantId: string;
    eventId: string;
    studentId: string;
    confirmedByUserId: string;
    actorUserId: string;
  },
): Promise<void> {
  const found = await tx
    .select({ id: eventRegistrations.id })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.tenantId, r.tenantId),
        eq(eventRegistrations.eventId, r.eventId),
        eq(eventRegistrations.studentId, r.studentId),
      ),
    );
  if (found[0]) return;
  const [inserted] = await tx
    .insert(eventRegistrations)
    .values({
      tenantId: r.tenantId,
      eventId: r.eventId,
      studentId: r.studentId,
      confirmedByUserId: r.confirmedByUserId,
      status: 'confirmed',
    })
    .returning({ id: eventRegistrations.id });
  if (!inserted) throw new Error('Failed to insert event registration');
  await tx.execute(
    sql`SELECT audit_append(${r.tenantId}::uuid, ${r.actorUserId}::uuid, NULL,
          ${'events.registration.confirmed'}, ${'event_registration'}, ${inserted.id},
          ${JSON.stringify({
            event_id: r.eventId,
            student_id: r.studentId,
            confirmed_by_user_id: r.confirmedByUserId,
          })}::jsonb)`,
  );
}

/**
 * One audited belt award, only while the student has no graduation rows
 * (append-only fixtures cannot upsert — skip-if-present keeps re-runs stable).
 */
async function ensureBeltAward(
  tx: DbTransaction,
  g: {
    tenantId: string;
    studentId: string;
    beltId: string;
    awardedByUserId: string;
    awardedAt: Date;
  },
): Promise<void> {
  const existing = await tx
    .select({ id: studentGraduations.id })
    .from(studentGraduations)
    .where(
      and(
        eq(studentGraduations.tenantId, g.tenantId),
        eq(studentGraduations.studentId, g.studentId),
      ),
    );
  if (existing.length > 0) return;
  const [inserted] = await tx
    .insert(studentGraduations)
    .values({
      tenantId: g.tenantId,
      studentId: g.studentId,
      beltId: g.beltId,
      kind: 'belt',
      degree: 0,
      awardedByUserId: g.awardedByUserId,
      awardedAt: g.awardedAt,
      notes: 'Exame de faixa do semestre — aprovado.',
    })
    .returning({ id: studentGraduations.id });
  if (!inserted) throw new Error('Failed to insert graduation row');
  await tx.execute(
    sql`SELECT audit_append(${g.tenantId}::uuid, ${g.awardedByUserId}::uuid, NULL,
          ${'graduation.awarded'}, ${'graduation'}, ${inserted.id},
          ${JSON.stringify({ belt_id: g.beltId, degree: 0, kind: 'belt' })}::jsonb)`,
  );
}
