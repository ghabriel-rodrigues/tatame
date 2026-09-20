/**
 * Aluno Agenda tab (AGD.5, aluno-11): day pills defaulting to today +
 * weekday-parameterized fetch, class card anatomy, the check-in affordance
 * rule (today/not-today/checked) handing off to the ATT.15 sheet, the
 * "Sem aulas neste dia" empty state, the real "Eventos do mês" section
 * (EVT.10 — state chips, tap → detail) and the home hero "Ver agenda" CTA
 * landing on the real tab.
 */

import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import {
  installFetchMock,
  json,
  makeMe,
  type FetchHandler,
} from '../helpers/session';
import { OPEN_MAT_CLASS_ID, makeAlunoHome } from '../helpers/attendance';
import {
  makeAgenda,
  makeAgendaClass,
  type AgendaOptions,
} from '../helpers/agenda';
import {
  OPEN_MAT_EVENT_ID,
  makeAlunoEventDetail,
  makeAlunoEventItem,
  makePaidEventItem,
  makeRegistration,
} from '../helpers/events';

jest.useFakeTimers();
// Monday 2026-08-03 — pins "today" for the default pill and isToday flows.
jest.setSystemTime(new Date('2026-08-03T12:00:00'));

const secure = SecureStore as unknown as { __reset: () => void };

interface AgendaLog {
  searches: string[];
}

function renderAgenda(
  agendaFor: (weekday: number) => AgendaOptions,
  override?: FetchHandler,
): AgendaLog {
  const log: AgendaLog = { searches: [] };
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
    }
    if (request.method === 'GET' && request.path === '/v1/aluno/agenda') {
      log.searches.push(request.search);
      const weekday = Number(
        new URLSearchParams(request.search).get('weekday'),
      );
      return json(
        200,
        makeAgenda({ weekday, isToday: weekday === 1, ...agendaFor(weekday) }),
      );
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'student' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openAgendaTab(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText('Agenda')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Agenda'));
  });
  await waitFor(() => expect(screen.getByTestId('day-pill-0')).toBeTruthy());
}

describe('aluno Agenda (AGD.5)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('preselects today, fetches its weekday and renders the full class card', async () => {
    const log = renderAgenda(() => ({}));
    await openAgendaTab();

    // Monday pill selected by default (system time pinned to a Monday).
    expect(
      screen.getByTestId('day-pill-1').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('day-pill-3').props.accessibilityState.selected,
    ).toBe(false);
    await waitFor(() => expect(log.searches).toContain('?weekday=1'));

    // Card anatomy: time range, turma, professor, level chip, occupancy chip.
    await waitFor(() => expect(screen.getByText('Open mat')).toBeTruthy());
    expect(screen.getByText('10:00')).toBeTruthy();
    expect(screen.getByText('12:00')).toBeTruthy();
    expect(screen.getByText('Rafa Mendes')).toBeTruthy();
    expect(screen.getByText('Todas as faixas')).toBeTruthy();
    expect(screen.getByText('12 de 20 vagas')).toBeTruthy();
  });

  it('tapping another day pill fetches that weekday and drops the check-in affordance', async () => {
    const log = renderAgenda((weekday) =>
      weekday === 3
        ? {
            classes: [
              makeAgendaClass({ className: 'Fundamentos', checkedIn: false }),
            ],
          }
        : {},
    );
    await openAgendaTab();
    await waitFor(() => expect(screen.getByText('Open mat')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('day-pill-3'));
    });

    await waitFor(() => expect(log.searches).toContain('?weekday=3'));
    await waitFor(() => expect(screen.getByText('Fundamentos')).toBeTruthy());
    expect(
      screen.getByTestId('day-pill-3').props.accessibilityState.selected,
    ).toBe(true);
    // Off-today: no button, no green check (spec 007 story 9).
    expect(screen.queryByText('Check-in')).toBeNull();
    expect(
      screen.queryByTestId(`agenda-checked-${OPEN_MAT_CLASS_ID}`),
    ).toBeNull();
  });

  it('today + unchecked shows the Check-in button opening the ATT.15 sheet', async () => {
    renderAgenda(() => ({}));
    await openAgendaTab();

    await waitFor(() => expect(screen.getByText('Check-in')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Check-in'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('checkin-sheet')).toBeTruthy(),
    );
  });

  it('today + checked shows the green check instead of the button', async () => {
    renderAgenda(() => ({ classes: [makeAgendaClass({ checkedIn: true })] }));
    await openAgendaTab();

    await waitFor(() =>
      expect(
        screen.getByTestId(`agenda-checked-${OPEN_MAT_CLASS_ID}`),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Check-in')).toBeNull();
  });

  it('renders the "Sem aulas neste dia" empty state', async () => {
    renderAgenda(() => ({ classes: [] }));
    await openAgendaTab();

    await waitFor(() =>
      expect(screen.getByTestId('agenda-empty')).toBeTruthy(),
    );
    expect(screen.getByText('Sem aulas neste dia')).toBeTruthy();
    expect(
      screen.getByText('Bom descanso — o tatame espera você amanhã.'),
    ).toBeTruthy();
    expect(screen.queryByText('Check-in')).toBeNull();
  });

  it('keeps the "Eventos do mês" empty state when the month has no events', async () => {
    renderAgenda(() => ({}));
    await openAgendaTab();

    await waitFor(() =>
      expect(screen.getByText('Eventos do mês')).toBeTruthy(),
    );
    expect(screen.getByTestId('events-empty')).toBeTruthy();
    expect(screen.getByText('Nenhum evento neste mês')).toBeTruthy();
  });

  it('lists the month events with the own-state chip and pushes the detail (EVT.10)', async () => {
    renderAgenda(
      () => ({
        events: [
          makeAlunoEventItem({ registration: makeRegistration() }),
          makePaidEventItem(),
        ],
      }),
      (request) =>
        request.method === 'GET' &&
        request.path === `/v1/aluno/events/${OPEN_MAT_EVENT_ID}`
          ? json(200, makeAlunoEventDetail())
          : null,
    );
    await openAgendaTab();

    await waitFor(() =>
      expect(
        screen.getByTestId(`agenda-event-${OPEN_MAT_EVENT_ID}`),
      ).toBeTruthy(),
    );
    // Own state wins over the valor chip; the paid card shows the price.
    expect(screen.getByText('Confirmado')).toBeTruthy();
    expect(screen.getByText('Festival Kids')).toBeTruthy();
    expect(screen.getByText('R$ 60,00')).toBeTruthy();
    expect(screen.queryByTestId('events-empty')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Open mat de verão'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('event-info-card')).toBeTruthy(),
    );
    expect(screen.getByText('Responsável: Prof. Rafael Nunes')).toBeTruthy();
  });

  it('home hero "Ver agenda" CTA navigates to the real Agenda tab', async () => {
    renderAgenda(() => ({}));

    await waitFor(() => expect(screen.getByText('Ver agenda')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Ver agenda'));
    });

    await waitFor(() => expect(screen.getByTestId('day-pill-1')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByText('12 de 20 vagas')).toBeTruthy(),
    );
  });
});
