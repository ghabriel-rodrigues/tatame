/**
 * Events fixtures (EVT.9 web slice, spec 008). Contract-typed factories for
 * the admin events console — gradient cards, inscritos totals, registrations
 * — and the calendar event items that light up the pink dots. The default
 * catalog mirrors the admin-13 screenshot: Open mat de verão (gratuito,
 * 32 confirmados), Exame de faixa (R$ 120, R$ 2.160 arrecadado) and
 * Festival Kids (R$ 60), all owned by the seed professors.
 */
import type { ApiSchemas } from '../types.js';

export type AdminEvent = ApiSchemas['AdminEventDto'];
export type EventResponsible = ApiSchemas['EventResponsibleDto'];
export type EventTotals = ApiSchemas['EventTotalsDto'];
export type AdminEventsResponse = ApiSchemas['AdminEventsResponseDto'];
export type AdminRegistrationRow = ApiSchemas['AdminRegistrationRowDto'];
export type AdminEventRegistrationsResponse =
  ApiSchemas['AdminEventRegistrationsResponseDto'];
export type CalendarEventItem = ApiSchemas['CalendarEventItemDto'];

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

/** Seed professor references (match the enrollment registry names). */
export const FIXTURE_RESPONSIBLE_RAFAEL: EventResponsible = {
  userId: '018f0000-0000-7000-8030-00000000000a',
  fullName: 'Rafael Nunes',
};
export const FIXTURE_RESPONSIBLE_ANA: EventResponsible = {
  userId: '018f0000-0000-7000-8030-00000000000b',
  fullName: 'Ana Souza',
};

export function makeEventTotals(overrides: Partial<EventTotals> = {}): EventTotals {
  return { inscritos: 0, confirmados: 0, arrecadadoCents: 0, ...overrides };
}

let eventCounter = 0;
export function makeAdminEvent(overrides: Partial<AdminEvent> = {}): AdminEvent {
  eventCounter += 1;
  return {
    id: uuid('8040', eventCounter),
    name: `Evento ${eventCounter}`,
    bannerPreset: 'event-purple-pink',
    location: 'Tatame principal',
    startsAt: '2026-08-15T13:00:00.000Z',
    date: '2026-08-15',
    time: '10:00',
    priceCents: null,
    description: null,
    status: 'published',
    responsible: FIXTURE_RESPONSIBLE_RAFAEL,
    totals: makeEventTotals(),
    ...overrides,
  };
}

/** "Rascunho · Data a definir" card — no date, no local. */
export function makeDraftEvent(overrides: Partial<AdminEvent> = {}): AdminEvent {
  return makeAdminEvent({
    name: 'Seminário de guarda',
    location: null,
    startsAt: null,
    date: null,
    time: null,
    status: 'draft',
    totals: makeEventTotals(),
    ...overrides,
  });
}

/**
 * admin-13-faithful catalog (published only, chronological): Open mat de
 * verão (gratuito, sáb 15/08 10:00, 32 confirmados), Exame de faixa
 * (R$ 120, sáb 29/08 09:00, 18 inscritos · R$ 2.160) and Festival Kids
 * (R$ 60, dom 13/09 09:30, 9 inscritos, Prof. Ana).
 */
export function makeAdminEventList(): AdminEvent[] {
  return [
    makeAdminEvent({
      name: 'Open mat de verão',
      date: '2026-08-15',
      time: '10:00',
      startsAt: '2026-08-15T13:00:00.000Z',
      priceCents: null,
      totals: makeEventTotals({ inscritos: 32, confirmados: 32 }),
    }),
    makeAdminEvent({
      name: 'Exame de faixa',
      date: '2026-08-29',
      time: '09:00',
      startsAt: '2026-08-29T12:00:00.000Z',
      priceCents: 12_000,
      totals: makeEventTotals({
        inscritos: 18,
        confirmados: 18,
        arrecadadoCents: 216_000,
      }),
    }),
    makeAdminEvent({
      name: 'Festival Kids',
      date: '2026-09-13',
      time: '09:30',
      startsAt: '2026-09-13T12:30:00.000Z',
      priceCents: 6_000,
      responsible: FIXTURE_RESPONSIBLE_ANA,
      totals: makeEventTotals({ inscritos: 9, confirmados: 4, arrecadadoCents: 24_000 }),
    }),
  ];
}

let registrationCounter = 0;
export function makeAdminRegistrationRow(
  overrides: Partial<AdminRegistrationRow> = {},
): AdminRegistrationRow {
  registrationCounter += 1;
  return {
    id: uuid('8041', registrationCounter),
    student: {
      id: uuid('8042', registrationCounter),
      fullName: `Aluno Inscrito ${registrationCounter}`,
    },
    status: 'confirmed',
    confirmedBy: {
      userId: uuid('8043', registrationCounter),
      fullName: `Aluno Inscrito ${registrationCounter}`,
    },
    paidAmountCents: null,
    ...overrides,
  };
}

/** Inscritos view payload: mixed statuses + honest totals over them. */
export function makeAdminEventRegistrations(
  overrides: Partial<AdminEventRegistrationsResponse> = {},
): AdminEventRegistrationsResponse {
  const event = makeAdminEvent({
    name: 'Exame de faixa',
    priceCents: 12_000,
    totals: makeEventTotals({ inscritos: 3, confirmados: 2, arrecadadoCents: 24_000 }),
  });
  return {
    event,
    registrations: [
      makeAdminRegistrationRow({
        student: { id: uuid('8042', 901), fullName: 'Lucas Almeida' },
        status: 'confirmed',
        confirmedBy: { userId: uuid('8043', 901), fullName: 'Lucas Almeida' },
        paidAmountCents: 12_000,
      }),
      makeAdminRegistrationRow({
        student: { id: uuid('8042', 902), fullName: 'Pedro Silveira' },
        status: 'confirmed',
        confirmedBy: { userId: uuid('8043', 902), fullName: 'Fernanda Silveira' },
        paidAmountCents: 12_000,
      }),
      makeAdminRegistrationRow({
        student: { id: uuid('8042', 903), fullName: 'Bia Andrade' },
        status: 'pending_payment',
        confirmedBy: { userId: uuid('8043', 903), fullName: 'Bia Andrade' },
        paidAmountCents: null,
      }),
    ],
    totals: event.totals,
    ...overrides,
  };
}

let calendarEventCounter = 0;
/** Dated month event for the persona calendars (the pink dots). */
export function makeCalendarEventItem(
  overrides: Partial<CalendarEventItem> = {},
): CalendarEventItem {
  calendarEventCounter += 1;
  return {
    id: uuid('8044', calendarEventCounter),
    name: 'Open mat de verão',
    bannerPreset: 'event-purple-pink',
    location: 'Tatame principal',
    startsAt: '2026-08-15T13:00:00.000Z',
    date: '2026-08-15',
    time: '10:00',
    priceCents: null,
    ...overrides,
  };
}
