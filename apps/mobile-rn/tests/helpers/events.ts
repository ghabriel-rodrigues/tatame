/**
 * Events fixtures for the RN suites (EVT.10-11, spec 008). Local mirror of
 * the shared contract types (the shared testing entry pulls msw, which the
 * RN jest env does not run), shaped to the handoff screenshots aluno-10 and
 * responsavel-06: Open mat de verão (gratuito, sáb 15/08 10:00) and
 * Festival Kids (R$ 60, dom 13/09 09:30), Pedro/Júlia as the dependents.
 */

import type {
  AlunoEventDetail,
  AlunoEventItem,
  CalendarEventItem,
  EventRegistrationState,
  ProfessorUpcomingEvent,
  ResponsavelEvent,
  ResponsavelEventDependent,
  ResponsavelEventsResponse,
} from '../../src/features/events/types';
import { JULIA_ID, PEDRO_ID } from './billing';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

export const OPEN_MAT_EVENT_ID = uuid('e001', 1);
export const FESTIVAL_EVENT_ID = uuid('e001', 2);
export const REGISTRATION_ID = uuid('e002', 1);
export const EVENT_CHARGE_ID = uuid('e003', 1);

export function makeRegistration(
  overrides: Partial<EventRegistrationState> = {},
): EventRegistrationState {
  return {
    id: REGISTRATION_ID,
    status: 'confirmed',
    chargeId: null,
    ...overrides,
  };
}

/** Pending-payment registration riding the open event-origin charge. */
export function makePendingRegistration(
  overrides: Partial<EventRegistrationState> = {},
): EventRegistrationState {
  return makeRegistration({ status: 'pending_payment', chargeId: EVENT_CHARGE_ID, ...overrides });
}

/** aluno-03/11 card: Open mat de verão, gratuito, sáb 15/08 10:00. */
export function makeAlunoEventItem(
  overrides: Partial<AlunoEventItem> = {},
): AlunoEventItem {
  return {
    id: OPEN_MAT_EVENT_ID,
    name: 'Open mat de verão',
    bannerPreset: 'event-purple-pink',
    location: 'Tatame principal',
    startsAt: '2026-08-15T13:00:00.000Z',
    date: '2026-08-15',
    time: '10:00',
    priceCents: null,
    registration: null,
    ...overrides,
  };
}

/** Festival Kids — the paid card (R$ 60, dom 13/09 09:30). */
export function makePaidEventItem(
  overrides: Partial<AlunoEventItem> = {},
): AlunoEventItem {
  return makeAlunoEventItem({
    id: FESTIVAL_EVENT_ID,
    name: 'Festival Kids',
    date: '2026-09-13',
    time: '09:30',
    startsAt: '2026-09-13T12:30:00.000Z',
    priceCents: 6_000,
    ...overrides,
  });
}

/** aluno-10 detail: banner, data/local/responsável lines, description. */
export function makeAlunoEventDetail(
  overrides: Partial<AlunoEventDetail> = {},
): AlunoEventDetail {
  return {
    id: OPEN_MAT_EVENT_ID,
    name: 'Open mat de verão',
    bannerPreset: 'event-purple-pink',
    location: 'Tatame principal · Horizonte BJJ Centro',
    startsAt: '2026-08-15T13:00:00.000Z',
    date: '2026-08-15',
    time: '10:00',
    priceCents: null,
    description:
      'Treino aberto para todas as faixas, com academias convidadas da região.',
    responsible: { userId: uuid('e004', 1), fullName: 'Rafael Nunes' },
    registration: null,
    ...overrides,
  };
}

export function makeDependent(
  overrides: Partial<ResponsavelEventDependent> = {},
): ResponsavelEventDependent {
  return {
    studentId: PEDRO_ID,
    fullName: 'Pedro Silveira',
    registration: null,
    ...overrides,
  };
}

/** responsavel-06 card with the Pedro/Júlia chips. */
export function makeResponsavelEvent(
  overrides: Partial<ResponsavelEvent> = {},
): ResponsavelEvent {
  return {
    id: OPEN_MAT_EVENT_ID,
    name: 'Open mat de verão',
    bannerPreset: 'event-purple-pink',
    location: 'Tatame principal',
    startsAt: '2026-08-15T13:00:00.000Z',
    date: '2026-08-15',
    time: '10:00',
    priceCents: null,
    description: null,
    dependents: [
      makeDependent(),
      makeDependent({ studentId: JULIA_ID, fullName: 'Júlia Silveira' }),
    ],
    ...overrides,
  };
}

/** responsavel-06 catalog: Festival Kids (R$ 60) + Open mat (gratuito). */
export function makeResponsavelEvents(
  events?: ResponsavelEvent[],
): ResponsavelEventsResponse {
  return {
    events: events ?? [
      makeResponsavelEvent({
        id: FESTIVAL_EVENT_ID,
        name: 'Festival Kids',
        date: '2026-09-13',
        time: '09:30',
        startsAt: '2026-09-13T12:30:00.000Z',
        location: 'Ginásio Municipal',
        priceCents: 6_000,
      }),
      makeResponsavelEvent(),
    ],
  };
}

/** professor-02 list row: "32 confirmados · gratuito". */
export function makeProfessorUpcomingEvent(
  overrides: Partial<ProfessorUpcomingEvent> = {},
): ProfessorUpcomingEvent {
  return {
    id: OPEN_MAT_EVENT_ID,
    name: 'Open mat de verão',
    bannerPreset: 'event-purple-pink',
    location: 'Tatame principal',
    startsAt: '2026-08-15T13:00:00.000Z',
    date: '2026-08-15',
    time: '10:00',
    priceCents: null,
    confirmedCount: 32,
    ...overrides,
  };
}

/** Dated month event for the persona calendars (the pink dots). */
export function makeCalendarEvent(
  overrides: Partial<CalendarEventItem> = {},
): CalendarEventItem {
  return {
    id: OPEN_MAT_EVENT_ID,
    name: 'Open mat de verão',
    bannerPreset: 'event-purple-pink',
    location: 'Tatame principal',
    startsAt: '2026-08-15T13:00:00.000Z',
    date: '2026-08-15',
    time: '10:00',
    priceCents: null,
    registration: null,
    ...overrides,
  };
}
