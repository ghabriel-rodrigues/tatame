/**
 * Aluno month calendar (AGD.6, aluno-08): reached from the Agenda "Mês"
 * button — recurrence dots expanded from the weekday buckets, "sua aula" /
 * "evento" legend, day selection driving the day agenda, and the aluno
 * free-day copy.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe } from '../helpers/session';
import { makeAlunoHome } from '../helpers/attendance';
import { makeAgenda, makeCalendar, makeCalendarItem } from '../helpers/agenda';

jest.useFakeTimers();
// Monday 2026-08-03: Mondays in August 2026 = 3, 10, 17, 24, 31.
jest.setSystemTime(new Date('2026-08-03T12:00:00'));

const secure = SecureStore as unknown as { __reset: () => void };

function renderCalendario(mondayItems = [makeCalendarItem()]): void {
  installFetchMock((request) => {
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/agenda') {
      return json(200, makeAgenda());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/calendar') {
      return json(200, makeCalendar({ 1: mondayItems }));
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

    // Class dot on every Monday, nowhere else; no event dots in this phase.
    for (const day of [3, 10, 17, 24, 31]) {
      expect(screen.getByTestId(`class-dot-${day}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('class-dot-4')).toBeNull();
    expect(screen.queryByTestId('class-dot-9')).toBeNull();
    expect(screen.queryByTestId('event-dot-3')).toBeNull();

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
