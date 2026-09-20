/**
 * Professor Notificações (NOT.9): dashboard-header bell with the unread
 * dot, the shared Notificações screen, read-all on open, the professor
 * shell-route map (events land on the calendário; wallet hints are inert —
 * no financial access) and the perfil settings switch.
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
import { makeDashboard } from '../helpers/attendance';
import { makeCalendar } from '../helpers/agenda';
import { makeProfessorProfile } from '../helpers/graduation';
import { OPEN_MAT_EVENT_ID } from '../helpers/events';
import {
  makeNotification,
  makeNotificationsPage,
  notificationsHandlers,
  type NotificationsBackendOptions,
  type NotificationsLog,
} from '../helpers/notifications';

jest.useFakeTimers();
// Monday 2026-08-03 — same pinned month as the professor calendar suite.
jest.setSystemTime(new Date('2026-08-03T12:00:00'));

const secure = SecureStore as unknown as { __reset: () => void };

/** Feed a professor actually receives: publish fan-out + buyer order rows. */
function makeProfessorFeed() {
  return [
    makeNotification({
      category: 'event',
      chip: '15',
      title: 'Open mat de verão',
      body: 'Sábado, 15 de agosto às 10:00',
      route: `event/${OPEN_MAT_EVENT_ID}`,
    }),
    makeNotification({
      category: 'store',
      chip: null,
      title: 'Pedido pronto para retirada',
      body: 'Rash Guard Preta M · retire na recepção',
      route: 'orders',
    }),
  ];
}

function renderProfessor(
  options: NotificationsBackendOptions = {},
  override?: FetchHandler,
): NotificationsLog {
  const { handler, log } = notificationsHandlers(options);
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const fromNotifications = handler(request);
    if (fromNotifications) return fromNotifications;
    if (
      request.method === 'GET' &&
      request.path === '/v1/professor/dashboard'
    ) {
      return json(200, makeDashboard());
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
  return log;
}

async function openNotificacoes(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByTestId('notifications-bell')).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByTestId('notifications-bell'));
  });
  await waitFor(() => expect(screen.getByText('Notificações')).toBeTruthy());
}

describe('professor Notificações (NOT.9)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('shows the bell dot, renders the feed on open and read-all kills the dot', async () => {
    const log = renderProfessor({
      count: 2,
      pages: [makeNotificationsPage(makeProfessorFeed())],
    });

    await waitFor(() =>
      expect(screen.getByTestId('notifications-bell-dot')).toBeTruthy(),
    );

    await openNotificacoes();

    await waitFor(() =>
      expect(screen.getByText('Open mat de verão')).toBeTruthy(),
    );
    expect(screen.getByText('15')).toBeTruthy();
    expect(screen.getByText('Pedido pronto para retirada')).toBeTruthy();
    expect(screen.getByTestId('notification-icon-store')).toBeTruthy();
    expect(screen.getAllByText('Hoje')).toHaveLength(2);

    await waitFor(() => expect(log.readAllPosts).toBe(1));
    await waitFor(() =>
      expect(screen.queryByTestId('notifications-bell-dot')).toBeNull(),
    );
  });

  it('routes an event row onto the calendário (professor shell map)', async () => {
    renderProfessor(
      { pages: [makeNotificationsPage(makeProfessorFeed())] },
      ({ method, path }) =>
        method === 'GET' && path === '/v1/professor/calendar'
          ? json(200, makeCalendar())
          : null,
    );

    await openNotificacoes();
    await waitFor(() =>
      expect(screen.getByText('Open mat de verão')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Open mat de verão'));
    });

    await waitFor(() => expect(screen.getByText('Agosto 2026')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId('calendar-card')).toBeTruthy(),
    );
  });

  it('keeps wallet hints inert — the professor has no financial surface', async () => {
    const walletRow = makeNotification({
      title: 'Mensalidade de agosto disponível',
      route: 'wallet',
    });
    renderProfessor({ pages: [makeNotificationsPage([walletRow])] });

    await openNotificacoes();
    await waitFor(() =>
      expect(screen.getByText('Mensalidade de agosto disponível')).toBeTruthy(),
    );

    // Inert row: rendered without a pressable role, tapping goes nowhere.
    await act(async () => {
      fireEvent.press(screen.getByTestId(`notification-${walletRow.id}`));
    });
    expect(screen.getByText('Notificações')).toBeTruthy();
    expect(screen.getByText('Mensalidade de agosto disponível')).toBeTruthy();
  });

  it('wires the perfil Notificações switch to the settings endpoints (story 9)', async () => {
    const log = renderProfessor({}, ({ method, path }) =>
      method === 'GET' && path === '/v1/professor/profile'
        ? json(200, makeProfessorProfile())
        : null,
    );

    await waitFor(() => expect(screen.getByLabelText('Perfil')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Perfil'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('perfil-notifications-switch')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('perfil-notifications-switch').props.value,
      ).toBe(true),
    );

    await act(async () => {
      fireEvent(
        screen.getByTestId('perfil-notifications-switch'),
        'valueChange',
        false,
      );
    });

    await waitFor(() => expect(log.settingsPuts).toEqual([{ enabled: false }]));
    await waitFor(() =>
      expect(
        screen.getByTestId('perfil-notifications-switch').props.value,
      ).toBe(false),
    );
  });
});
