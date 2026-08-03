/**
 * Enrollment fixtures for the RN suites (ENR.17-20). Local mirror of
 * `@tatame/shared`'s enrollment factories (that package's testing entry
 * pulls msw, which the RN jest env does not run), shaped to the handoff
 * screenshots professor-07…09 and responsavel-02/08.
 */

import type { ClassDetail, ClassListItem, RosterStudent, ScheduleSlotView } from '@tatame/shared';
import type {
  ClassSuggestion,
  DependentDetail,
} from '../../src/features/enrollment/types';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

export const PROFESSOR_USER_ID = uuid('8004', 1);

export const FUNDAMENTOS_ID = uuid('8005', 1);
export const AVANCADA_ID = uuid('8005', 2);
export const KIDS_ID = uuid('8005', 3);

const slot = (weekday: number, startTime: string, durationMinutes = 60): ScheduleSlotView => ({
  weekday,
  startTime,
  durationMinutes,
});

let studentCounter = 0;
export function makeRosterStudent(
  fullName: string,
  overrides: Partial<RosterStudent> = {},
): RosterStudent {
  studentCounter += 1;
  return {
    studentId: uuid('8001', studentCounter),
    fullName,
    birthDate: '2005-03-14',
    badge: 'ativo',
    ...overrides,
  };
}

/** professor-08 roster: Lucas, João + pendente Tiago. */
export const FUNDAMENTOS_ROSTER: RosterStudent[] = [
  makeRosterStudent('Lucas Almeida'),
  makeRosterStudent('João Ferraz'),
  makeRosterStudent('Tiago Mota', { badge: 'pendente' }),
];

/** professor-09 picker candidates come from the Avançada roster. */
export const AVANCADA_ROSTER: RosterStudent[] = [
  makeRosterStudent('Marina Costa'),
  makeRosterStudent('Pedro Silveira', { birthDate: '2016-08-02' }),
  makeRosterStudent('Bia Andrade'),
];

/** professor-07 list: Fundamentos (Lotada 24/24), Avançada 16/20. */
export function makeProfessorClasses(): ClassListItem[] {
  return [
    {
      id: FUNDAMENTOS_ID,
      name: 'Fundamentos',
      status: 'active',
      capacity: 24,
      occupancy: 24,
      lotada: true,
      ageMin: null,
      ageMax: null,
      professor: { userId: PROFESSOR_USER_ID, fullName: 'Rafa Mendes' },
      schedules: [slot(1, '19:00'), slot(3, '19:00'), slot(5, '19:00')],
    },
    {
      id: AVANCADA_ID,
      name: 'Avançada',
      status: 'active',
      capacity: 20,
      occupancy: 16,
      lotada: false,
      ageMin: null,
      ageMax: null,
      professor: { userId: PROFESSOR_USER_ID, fullName: 'Rafa Mendes' },
      schedules: [slot(2, '20:00', 90), slot(4, '20:00', 90)],
    },
  ];
}

export function makeProfessorClassDetails(): Record<string, ClassDetail> {
  const [fundamentos, avancada] = makeProfessorClasses() as [ClassListItem, ClassListItem];
  return {
    [FUNDAMENTOS_ID]: {
      ...fundamentos,
      occupancy: FUNDAMENTOS_ROSTER.length,
      lotada: false,
      roster: FUNDAMENTOS_ROSTER,
    },
    [AVANCADA_ID]: {
      ...avancada,
      occupancy: AVANCADA_ROSTER.length,
      roster: AVANCADA_ROSTER,
    },
  };
}

const KIDS_SCHEDULES = [slot(2, '18:00', 45), slot(4, '18:00', 45)];

/** responsavel-02: Pedro (9 anos) e Júlia (12 anos), turma Kids. */
export function makeDependents(): DependentDetail[] {
  return [
    {
      id: uuid('8006', 1),
      fullName: 'Pedro Silveira',
      birthDate: '2016-08-02',
      status: 'active',
      class: {
        id: KIDS_ID,
        name: 'Kids',
        schedules: KIDS_SCHEDULES,
        nextSlot: KIDS_SCHEDULES[0] ?? null,
      },
    },
    {
      id: uuid('8006', 2),
      fullName: 'Júlia Silveira',
      birthDate: '2014-03-10',
      status: 'active',
      class: {
        id: KIDS_ID,
        name: 'Kids',
        schedules: KIDS_SCHEDULES,
        nextSlot: KIDS_SCHEDULES[0] ?? null,
      },
    },
  ];
}

/** responsavel-08 chip: "Kids · Ter e Qui 18:00". */
export function makeKidsSuggestion(): ClassSuggestion {
  return {
    id: KIDS_ID,
    name: 'Kids',
    ageMin: 4,
    ageMax: 12,
    capacity: 16,
    occupancy: 14,
    schedules: KIDS_SCHEDULES,
  };
}
