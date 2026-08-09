/**
 * Enrollment fixtures (ENR.13-16 web slice). Contract-typed factories plus a
 * ready-made registry mirroring the handoff screenshots (admin-07…12) so
 * component tests read like the design: Lucas/Marina/Pedro/João/Bia,
 * Fundamentos (Lotada 24/24), Avançada 16/20, Kids 14/16.
 */
import type {
  AdminSessionRow,
  ClassDetail,
  ClassListItem,
  GuardianListItem,
  ProfessorListItem,
  RosterStudent,
  ScheduleSlotView,
  StudentListItem,
} from '../types.js';
import { catalogBelt, makeBeltView } from './graduation-fixtures.js';

/** Catalog belt as a BeltRefDto (turma min/max range fields, GRD.14). */
function beltRef(name: string) {
  const { ladderKind: _ladderKind, ...ref } = catalogBelt(name);
  return ref;
}

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

let studentCounter = 0;
export function makeStudent(overrides: Partial<StudentListItem> = {}): StudentListItem {
  studentCounter += 1;
  return {
    id: uuid('8001', studentCounter),
    fullName: `Aluno ${studentCounter}`,
    birthDate: '2005-03-14',
    status: 'active',
    badge: 'ativo',
    guardianId: null,
    userId: uuid('8009', studentCounter),
    classes: [],
    ...overrides,
  };
}

let guardianCounter = 0;
export function makeGuardian(overrides: Partial<GuardianListItem> = {}): GuardianListItem {
  guardianCounter += 1;
  return {
    id: uuid('8002', guardianCounter),
    fullName: `Responsável ${guardianCounter}`,
    phone: '+55 11 99999-0000',
    email: `responsavel${guardianCounter}@tatame.dev`,
    badge: 'pendente',
    userId: null,
    dependentCount: 0,
    ...overrides,
  };
}

let professorCounter = 0;
export function makeProfessor(overrides: Partial<ProfessorListItem> = {}): ProfessorListItem {
  professorCounter += 1;
  return {
    membershipId: uuid('8003', professorCounter),
    userId: uuid('8004', professorCounter),
    fullName: `Professor ${professorCounter}`,
    email: `professor${professorCounter}@tatame.dev`,
    status: 'active',
    ...overrides,
  };
}

export function makeSchedule(overrides: Partial<ScheduleSlotView> = {}): ScheduleSlotView {
  return { weekday: 1, startTime: '19:00', durationMinutes: 60, ...overrides };
}

let classCounter = 0;
export function makeClass(overrides: Partial<ClassListItem> = {}): ClassListItem {
  classCounter += 1;
  return {
    id: uuid('8005', classCounter),
    name: `Turma ${classCounter}`,
    status: 'active',
    capacity: 20,
    occupancy: 10,
    lotada: false,
    ageMin: null,
    ageMax: null,
    professor: { userId: uuid('8004', 1), fullName: 'Rafael Nunes' },
    schedules: [makeSchedule()],
    ...overrides,
  };
}

export function makeClassDetail(overrides: Partial<ClassDetail> = {}): ClassDetail {
  return { ...makeClass(), roster: [], ...overrides };
}

let sessionCounter = 0;
/** Materialized session row for the admin turma detail (ATT.14). */
export function makeAdminSession(overrides: Partial<AdminSessionRow> = {}): AdminSessionRow {
  sessionCounter += 1;
  return {
    id: uuid('8006', sessionCounter),
    sessionDate: '2026-08-03',
    startsAt: '2026-08-03T19:00:00',
    status: 'done',
    presentCount: 0,
    ...overrides,
  };
}

export function makeRosterStudent(overrides: Partial<RosterStudent> = {}): RosterStudent {
  const student = makeStudent();
  return {
    studentId: student.id,
    fullName: student.fullName,
    birthDate: student.birthDate,
    badge: 'ativo',
    ...overrides,
  };
}

/** Full registry shape consumed by `enrollmentHandlers`. */
export interface EnrollmentRegistryFixture {
  students: StudentListItem[];
  guardians: GuardianListItem[];
  professors: ProfessorListItem[];
  classes: ClassListItem[];
  classDetails: Record<string, ClassDetail>;
  /** Sessions per class id for GET /admin/classes/:id/sessions (ATT.14). */
  sessions: Record<string, AdminSessionRow[]>;
}

/** Screenshot-faithful registry (admin-07…12) with stable ids. */
export function makeEnrollmentRegistry(): EnrollmentRegistryFixture {
  const rafael = makeProfessor({ fullName: 'Rafael Nunes', email: 'rafael@tatame.dev' });
  const ana = makeProfessor({ fullName: 'Ana Souza', email: 'ana@tatame.dev' });

  const fundamentos = makeClass({
    name: 'Fundamentos',
    capacity: 24,
    occupancy: 24,
    lotada: true,
    minBelt: beltRef('Branca'),
    maxBelt: beltRef('Azul'),
    professor: { userId: rafael.userId, fullName: rafael.fullName },
    schedules: [
      makeSchedule({ weekday: 1 }),
      makeSchedule({ weekday: 3 }),
      makeSchedule({ weekday: 5 }),
    ],
  });
  const avancada = makeClass({
    name: 'Avançada',
    capacity: 20,
    occupancy: 16,
    professor: { userId: rafael.userId, fullName: rafael.fullName },
    schedules: [
      makeSchedule({ weekday: 2, startTime: '20:00', durationMinutes: 90 }),
      makeSchedule({ weekday: 4, startTime: '20:00', durationMinutes: 90 }),
    ],
  });
  const kids = makeClass({
    name: 'Kids',
    capacity: 16,
    occupancy: 14,
    ageMin: 4,
    ageMax: 12,
    professor: { userId: ana.userId, fullName: ana.fullName },
    schedules: [
      makeSchedule({ weekday: 2, startTime: '18:00', durationMinutes: 45 }),
      makeSchedule({ weekday: 4, startTime: '18:00', durationMinutes: 45 }),
    ],
  });

  const fernanda = makeGuardian({ fullName: 'Fernanda Silveira', dependentCount: 1 });

  // Derived belts per admin-07 rows ("Faixa azul · Fundamentos…").
  const students = [
    makeStudent({
      fullName: 'Lucas Almeida',
      classes: [{ id: fundamentos.id, name: fundamentos.name }],
      belt: makeBeltView('Azul', 2),
    }),
    makeStudent({
      fullName: 'Marina Costa',
      classes: [{ id: avancada.id, name: avancada.name }],
      belt: makeBeltView('Roxa', 1),
    }),
    makeStudent({
      fullName: 'Pedro Silveira',
      birthDate: '2016-08-02',
      badge: 'pendente',
      userId: null,
      guardianId: fernanda.id,
      classes: [{ id: kids.id, name: kids.name }],
      belt: makeBeltView('Cinza'),
    }),
    makeStudent({
      fullName: 'João Ferraz',
      classes: [{ id: fundamentos.id, name: fundamentos.name }],
      belt: makeBeltView('Branca'),
    }),
    makeStudent({
      fullName: 'Bia Andrade',
      badge: 'pendente',
      userId: null,
      classes: [{ id: avancada.id, name: avancada.name }],
      belt: makeBeltView('Azul'),
    }),
  ];

  const fundamentosDetail: ClassDetail = {
    ...fundamentos,
    occupancy: 3,
    lotada: false,
    roster: [
      { studentId: students[0]!.id, fullName: 'Lucas Almeida', birthDate: '2005-03-14', badge: 'ativo' },
      { studentId: students[3]!.id, fullName: 'João Ferraz', birthDate: '2005-03-14', badge: 'ativo' },
      { studentId: students[4]!.id, fullName: 'Bia Andrade', birthDate: '2005-03-14', badge: 'pendente' },
    ],
  };

  return {
    students,
    guardians: [fernanda],
    professors: [rafael, ana],
    classes: [fundamentos, avancada, kids],
    classDetails: {
      [fundamentos.id]: fundamentosDetail,
      [avancada.id]: { ...avancada, roster: [] },
      [kids.id]: { ...kids, roster: [] },
    },
    sessions: {},
  };
}
