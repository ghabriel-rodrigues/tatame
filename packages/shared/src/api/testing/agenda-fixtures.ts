/**
 * Agenda/calendar fixtures (AGD.4 web slice, spec 007). Contract-typed
 * factories for the persona calendar read model — weekday recurrence buckets
 * the client expands into month-grid dots. The admin default mirrors the
 * admin-14 screenshot and the seed catalog (Fundamentos seg/qua/sex,
 * Kids + Avançada ter/qui, Open mat sáb, Sundays free) over "Agosto 2026".
 */
import type { ApiSchemas } from '../types.js';

export type CalendarClassItem = ApiSchemas['CalendarClassItemDto'];
export type CalendarBuckets = ApiSchemas['CalendarBucketsDto'];
export type CalendarResponse = ApiSchemas['CalendarResponseDto'];

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

let calendarClassCounter = 0;
export function makeCalendarClassItem(
  overrides: Partial<CalendarClassItem> = {},
): CalendarClassItem {
  calendarClassCounter += 1;
  return {
    classId: uuid('8020', calendarClassCounter),
    className: `Turma ${calendarClassCounter}`,
    startTime: '19:00',
    endTime: '20:00',
    professorName: 'Rafael Nunes',
    occupancy: { active: 10, capacity: 20 },
    ...overrides,
  };
}

/** All seven weekday buckets empty (0 = Sunday … 6 = Saturday). */
export function emptyCalendarBuckets(): CalendarBuckets {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/**
 * admin-14-faithful calendar payload: Fundamentos on seg/qua/sex 19:00,
 * Kids 18:00 + Avançada 20:00 on ter/qui, Open mat sáb 10:00, Sundays free
 * ("Nada agendado neste dia."), `events` empty per the phase contract.
 */
export function makeAdminCalendar(
  overrides: Partial<CalendarResponse> = {},
): CalendarResponse {
  const fundamentos = makeCalendarClassItem({
    className: 'Fundamentos',
    startTime: '19:00',
    endTime: '20:00',
    professorName: 'Rafael Nunes',
    occupancy: { active: 24, capacity: 24 },
  });
  const kids = makeCalendarClassItem({
    className: 'Kids',
    startTime: '18:00',
    endTime: '18:45',
    professorName: 'Ana Souza',
    occupancy: { active: 14, capacity: 16 },
  });
  const avancada = makeCalendarClassItem({
    className: 'Avançada',
    startTime: '20:00',
    endTime: '21:30',
    professorName: 'Rafael Nunes',
    occupancy: { active: 16, capacity: 20 },
  });
  const openMat = makeCalendarClassItem({
    className: 'Open mat',
    startTime: '10:00',
    endTime: '11:30',
    professorName: 'Rafael Nunes',
    occupancy: { active: 12, capacity: 40 },
  });

  return {
    month: '2026-08',
    classesByWeekday: {
      0: [],
      1: [fundamentos],
      2: [kids, avancada],
      3: [fundamentos],
      4: [kids, avancada],
      5: [fundamentos],
      6: [openMat],
    },
    events: [],
    ...overrides,
  };
}
