/**
 * Agenda & calendar fixtures for the RN suites (AGD.5-6). Local mirror of
 * the shared contract types (same pattern as the other helpers), shaped to
 * the handoff screenshots aluno-11, aluno-08 and professor-04.
 */

import type {
  AlunoAgendaClass,
  AlunoAgendaResponse,
  CalendarBuckets,
  CalendarClassItem,
  CalendarResponse,
} from '../../src/features/agenda/types';
import { OPEN_MAT_CLASS_ID } from './attendance';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

export const FUNDAMENTOS_CLASS_ID = uuid('9006', 1);

export function makeAgendaClass(overrides: Partial<AlunoAgendaClass> = {}): AlunoAgendaClass {
  return {
    classId: OPEN_MAT_CLASS_ID,
    className: 'Open mat',
    startTime: '10:00',
    endTime: '12:00',
    professorName: 'Rafa Mendes',
    ageMin: null,
    ageMax: null,
    minBelt: null,
    maxBelt: null,
    occupancy: { active: 12, capacity: 20 },
    checkedIn: false,
    ...overrides,
  };
}

export interface AgendaOptions {
  weekday?: number;
  isToday?: boolean;
  classes?: AlunoAgendaClass[];
  /** "Eventos do mês" cards (EVT.10, spec 008); defaults to none. */
  events?: AlunoAgendaResponse['events'];
}

export function makeAgenda(options: AgendaOptions = {}): AlunoAgendaResponse {
  return {
    weekday: options.weekday ?? 1,
    isToday: options.isToday ?? true,
    classes: options.classes ?? [makeAgendaClass()],
    events: options.events ?? [],
  };
}

export function makeCalendarItem(overrides: Partial<CalendarClassItem> = {}): CalendarClassItem {
  return {
    classId: FUNDAMENTOS_CLASS_ID,
    className: 'Fundamentos',
    startTime: '19:00',
    endTime: '20:00',
    professorName: 'Rafa Mendes',
    occupancy: { active: 14, capacity: 20 },
    ...overrides,
  };
}

export function makeBuckets(partial: Partial<CalendarBuckets> = {}): CalendarBuckets {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...partial };
}

export function makeCalendar(
  partialBuckets: Partial<CalendarBuckets> = {},
  month = '2026-08',
  events: CalendarResponse['events'] = [],
): CalendarResponse {
  return {
    month,
    classesByWeekday: makeBuckets(partialBuckets),
    events,
  };
}
