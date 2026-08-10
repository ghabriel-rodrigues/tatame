/**
 * Aluno month calendar (AGD.6, aluno-08): reached from the Agenda "Mês"
 * button — recurrence dots expanded from the weekday buckets, "sua aula" /
 * "evento" legend, day selection driving the day agenda, and the aluno
 * free-day copy. EVT.10 (spec 008 story 16): event days carry the pink dot
 * and Evento entries pushing the detail.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe } from '../helpers/session';
import { makeAlunoHome } from '../helpers/attendance';
import { makeAgenda, makeCalendar, makeCalendarItem } from '../helpers/agenda';
import {
  OPEN_MAT_EVENT_ID,
  makeAlunoEventDetail,
  makeCalendarEvent,
} from '../helpers/events';
import type { CalendarEventItem } from '../../src/features/events/types';

jest.useFakeTimers();
// Monday 2026-08-03: Mondays in August 2026 = 3, 10, 17, 24, 31.
jest.setSystemTime(new Date('2026-08-03T12:00:00'));

const secure = SecureStore as unknown as { __reset: () => void };

function renderCalendario(
  mondayItems = [makeCalendarItem()],
  events: CalendarEventItem[] = [],
): void {
  installFetchMock((request) => {
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/agenda') {
      return json(200, makeAgenda());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/calendar') {
      return json(200, makeCalendar({ 1: mondayItems }, '2026-08', events));
    }
    if (
      request.method === 'GET' &&
      request.path === `/v1/aluno/events/${OPEN_MAT_EVENT_ID}`
    ) {
      return json(200, makeAlunoEventDetail());
    }
    return null;
  });
  sessionTestApi.seed({ status: 'authed', session: makeMe({ role: 'student' }) });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

async function openCalendario(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Agenda')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Agenda'));
  });
  await waitFor(() => expect(screen.getByLabelText('Mês')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Mês'));
  });
  await waitFor(() => expect(screen.getByText('Agosto 2026')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('calendar-card')).toBeTruthy());
}

describe('aluno month calendar (AGD.6)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('expands recurrence dots over the month grid with the aluno legend', async () => {
    renderCalendario();
    await openCalendario();

    expect(screen.getByText('Suas aulas e eventos da academia')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('calendar-card')).toBeTruthy());

    // Class dot on every Monday, nowhere else; no event dots without events.
    for (const day of [3, 10, 17, 24, 31]) {
      expect(screen.getByTestId(`class-dot-${day}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('class-dot-4')).toBeNull();
    expect(screen.queryByTestId('class-dot-9')).toBeNull();
    expect(screen.queryByTestId('event-dot-3')).toBeNull();
    expect(screen.queryByTestId('event-dot-15')).toBeNull();

    // Legend (spec 007 story 15).
    expect(screen.getByText('sua aula')).toBeTruthy();
    expect(screen.getByText('evento')).toBeTruthy();
  });

  it('defaults to today and lists that day sorted by time, tagged Aula', async () => {
    renderCalendario([
      makeCalendarItem({ className: 'Competição', startTime: '20:15', endTime: '21:30' }),
      makeCalendarItem({ className: 'Fundamentos', startTime: '19:00', endTime: '20:00' }),
    ]);
    await openCalendario();

    await waitFor(() =>
      expect(screen.getByText('Segunda-feira, 3 de agosto')).toBeTruthy(),
    );
    expect(screen.getByLabelText('Dia 3').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Fundamentos')).toBeTruthy();
    expect(screen.getByText('Competição')).toBeTruthy();
    expect(screen.getAllByText('Aula').length).toBe(2);
  });

  it('marks event days with the pink dot and lists tappable Evento entries (EVT.10)', async () => {
    // Saturday 2026-08-15 carries the seeded Open mat de verão.
    renderCalendario([makeCalendarItem()], [makeCalendarEvent()]);
    await openCalendario();

    await waitFor(() => expect(screen.getByTestId('event-dot-15')).toBeTruthy());
    expect(screen.queryByTestId('event-dot-14')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Dia 15'));
    });

    await waitFor(() =>
      expect(screen.getByTestId(`calendar-event-${OPEN_MAT_EVENT_ID}`)).toBeTruthy(),
    );
    expect(screen.getByText('Open mat de verão')).toBeTruthy();
    expect(screen.getByText('Evento')).toBeTruthy();
    expect(screen.getByText('Tatame principal')).toBeTruthy();

    // Tapping the Evento entry pushes the detail (spec 008 story 16).
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Open mat de verão'));
    });

    await waitFor(() => expect(screen.getByTestId('event-info-card')).toBeTruthy());
    expect(screen.getByText('Responsável: Prof. Rafael Nunes')).toBeTruthy();
  });

  it('selecting a free day shows the aluno "Dia livre" copy', async () => {
    renderCalendario();
    await openCalendario();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Dia 4'));
    });

    await waitFor(() => expect(screen.getByText('Terça-feira, 4 de agosto')).toBeTruthy());
    expect(
      screen.getByText('Dia livre — o tatame espera você no próximo treino.'),
    ).toBeTruthy();
    expect(screen.queryByText('Fundamentos')).toBeNull();
  });
});
