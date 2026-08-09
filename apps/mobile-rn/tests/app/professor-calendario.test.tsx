/**
 * Professor month calendar (AGD.6, professor-04): reached from the dashboard
 * header's calendar icon — own-class dots, "aula recorrente" legend, day
 * items with time and occupancy, and the professor free-day copy.
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe } from '../helpers/session';
import { makeDashboard } from '../helpers/attendance';
import { makeCalendar, makeCalendarItem } from '../helpers/agenda';

jest.useFakeTimers();
// Monday 2026-08-03 — same pinned month as the aluno calendar suite.
jest.setSystemTime(new Date('2026-08-03T12:00:00'));

const secure = SecureStore as unknown as { __reset: () => void };

function renderProfessorCalendario(): void {
  installFetchMock((request) => {
    if (request.method === 'GET' && request.path === '/v1/professor/dashboard') {
      return json(200, makeDashboard());
    }
    if (request.method === 'GET' && request.path === '/v1/professor/calendar') {
      return json(200, makeCalendar({ 1: [makeCalendarItem()] }));
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'professor', fullName: 'Rafa Mendes' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
}

async function openCalendario(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Calendário')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Calendário'));
  });
  await waitFor(() => expect(screen.getByText('Agosto 2026')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('calendar-card')).toBeTruthy());
}

describe('professor month calendar (AGD.6)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('opens from the dashboard header icon with the professor legend and dots', async () => {
    renderProfessorCalendario();
    await openCalendario();

    expect(screen.getByText('Aulas recorrentes e eventos da academia')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('calendar-card')).toBeTruthy());
    for (const day of [3, 10, 17, 24, 31]) {
      expect(screen.getByTestId(`class-dot-${day}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('class-dot-5')).toBeNull();
    expect(screen.getByText('aula recorrente')).toBeTruthy();
    expect(screen.getByText('evento')).toBeTruthy();
  });

  it('day items show time, turma and occupancy (spec 007 story 22)', async () => {
    renderProfessorCalendario();
    await openCalendario();

    await waitFor(() =>
      expect(screen.getByText('Segunda-feira, 3 de agosto')).toBeTruthy(),
    );
    expect(screen.getByText('Fundamentos')).toBeTruthy();
    expect(screen.getByText('19:00 – 20:00 · 14 de 20 vagas')).toBeTruthy();
    // Aluno-only tag stays out of the professor view.
    expect(screen.queryByText('Aula')).toBeNull();
  });

  it('selecting a free day shows "Dia livre — bom descanso."', async () => {
    renderProfessorCalendario();
    await openCalendario();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Dia 6'));
    });

    await waitFor(() => expect(screen.getByText('Quinta-feira, 6 de agosto')).toBeTruthy());
    expect(screen.getByText('Dia livre — bom descanso.')).toBeTruthy();
    expect(screen.queryByText('Fundamentos')).toBeNull();
  });
});
