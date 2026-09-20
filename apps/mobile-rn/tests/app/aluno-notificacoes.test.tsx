/**
 * Aluno Notificações (NOT.8, aluno-20): home-header bell with the unread
 * dot, the Notificações screen (category chips, relative timestamps,
 * cursor pagination on scroll, read-all on open killing the dot), route
 * taps through the aluno shell map and the perfil settings switch.
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
import { makeAlunoHome } from '../helpers/attendance';
import { makeWallet } from '../helpers/billing';
import { OPEN_MAT_EVENT_ID } from '../helpers/events';
import {
  makeAlunoFeed,
  makeNotification,
  makeNotificationsPage,
  notificationsHandlers,
  type NotificationsBackendOptions,
  type NotificationsLog,
} from '../helpers/notifications';

jest.useFakeTimers();

const secure = SecureStore as unknown as { __reset: () => void };

function renderAluno(
  options: NotificationsBackendOptions = {},
  override?: FetchHandler,
): NotificationsLog {
  const { handler, log } = notificationsHandlers(options);
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const fromNotifications = handler(request);
    if (fromNotifications) return fromNotifications;
    if (request.method === 'GET' && request.path === '/v1/aluno/home') {
      return json(200, makeAlunoHome());
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

async function openNotificacoes(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByTestId('notifications-bell')).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByTestId('notifications-bell'));
  });
  await waitFor(() => expect(screen.getByText('Notificações')).toBeTruthy());
}

describe('aluno Notificações (NOT.8)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('shows the bell dot, renders the aluno-20 feed on open and read-all kills the dot', async () => {
    const log = renderAluno({
      count: 3,
      pages: [makeNotificationsPage(makeAlunoFeed(OPEN_MAT_EVENT_ID))],
    });

    // Unread → the pink dot on the home-header bell.
    await waitFor(() =>
      expect(screen.getByTestId('notifications-bell-dot')).toBeTruthy(),
    );

    await openNotificacoes();

    // aluno-20 rows: pre-rendered chip, title, body and the relative label.
    await waitFor(() =>
      expect(screen.getByText('Mensalidade de agosto disponível')).toBeTruthy(),
    );
    expect(screen.getByText('Vence em 10 de agosto · R$ 180,00')).toBeTruthy();
    expect(screen.getByText('R$')).toBeTruthy();
    expect(screen.getByText('Open mat de verão')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
    expect(screen.getByText('Você recebeu o 2º grau')).toBeTruthy();
    expect(screen.getByText('2º')).toBeTruthy();
    expect(screen.getAllByText('Hoje')).toHaveLength(3);

    // Story 8: opening the screen fires read-all exactly once; the dot dies.
    await waitFor(() => expect(log.readAllPosts).toBe(1));
    await waitFor(() =>
      expect(screen.queryByTestId('notifications-bell-dot')).toBeNull(),
    );
  });

  it('falls back to the category icon when no chip was rendered and keeps inert rows inert', async () => {
    const iconRow = makeNotification({
      category: 'store',
      chip: null,
      title: 'Novidades na loja',
      body: null,
      route: null,
    });
    renderAluno({ pages: [makeNotificationsPage([iconRow])] });

    await openNotificacoes();

    await waitFor(() =>
      expect(screen.getByText('Novidades na loja')).toBeTruthy(),
    );
    expect(screen.getByTestId('notification-icon-store')).toBeTruthy();

    // route: null → no navigation; the screen stays put.
    await act(async () => {
      fireEvent.press(screen.getByTestId(`notification-${iconRow.id}`));
    });
    expect(screen.getByText('Notificações')).toBeTruthy();
    expect(screen.getByText('Novidades na loja')).toBeTruthy();
  });

  it('paginates on scroll through the cursor (spec 010: cursor-paged ~30)', async () => {
    const log = renderAluno({
      pages: [
        makeNotificationsPage(makeAlunoFeed(OPEN_MAT_EVENT_ID), 'cursor-2'),
        makeNotificationsPage([
          makeNotification({
            category: 'store',
            chip: null,
            title: 'Pedido pronto para retirada',
            body: 'Kimono Trançado Azul A2 · retire na recepção',
            route: 'orders',
          }),
        ]),
      ],
    });

    await openNotificacoes();
    await waitFor(() =>
      expect(screen.getByText('Open mat de verão')).toBeTruthy(),
    );
    expect(screen.queryByText('Pedido pronto para retirada')).toBeNull();

    await act(async () => {
      fireEvent.scroll(screen.getByTestId('notifications-scroll'), {
        nativeEvent: {
          contentOffset: { y: 700 },
          contentSize: { height: 1200 },
          layoutMeasurement: { height: 600 },
        },
      });
    });

    await waitFor(() =>
      expect(screen.getByText('Pedido pronto para retirada')).toBeTruthy(),
    );
    expect(log.listCursors).toEqual([null, 'cursor-2']);
    // First page keeps rendering above the appended one.
    expect(screen.getByText('Mensalidade de agosto disponível')).toBeTruthy();
  });

  it('routes a wallet row into the Carteira (semantic hint → aluno shell)', async () => {
    renderAluno(
      {
        count: 1,
        pages: [makeNotificationsPage(makeAlunoFeed(OPEN_MAT_EVENT_ID))],
      },
      ({ method, path }) =>
        method === 'GET' && path === '/v1/aluno/wallet'
          ? json(200, makeWallet())
          : null,
    );

    await openNotificacoes();
    await waitFor(() =>
      expect(screen.getByText('Mensalidade de agosto disponível')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(
        screen.getByLabelText('Mensalidade de agosto disponível'),
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('mensalidade-card')).toBeTruthy(),
    );
    expect(
      screen.getByText('Plano mensal recorrente · R$ 180,00'),
    ).toBeTruthy();
  });

  it('renders the empty state without a dot', async () => {
    renderAluno();

    await waitFor(() =>
      expect(screen.getByTestId('notifications-bell')).toBeTruthy(),
    );
    expect(screen.queryByTestId('notifications-bell-dot')).toBeNull();

    await openNotificacoes();

    await waitFor(() =>
      expect(screen.getByTestId('notifications-empty')).toBeTruthy(),
    );
    expect(screen.getByText('Nenhuma notificação')).toBeTruthy();
    expect(
      screen.getByText(
        'Avisos de pagamentos, eventos, graduação e loja aparecem aqui.',
      ),
    ).toBeTruthy();
  });

  it('wires the perfil Notificações switch to the settings endpoints (story 9)', async () => {
    const log = renderAluno();

    await waitFor(() => expect(screen.getByLabelText('Perfil')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Perfil'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('perfil-notifications-switch')).toBeTruthy(),
    );
    expect(
      screen.getByText('Silencia o alerta do sino no início'),
    ).toBeTruthy();
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
