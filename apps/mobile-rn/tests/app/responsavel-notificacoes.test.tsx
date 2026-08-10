/**
 * Responsável Notificações (NOT.9, responsavel-09): panel-header bell with
 * the unread dot, the shared Notificações screen with the guardian feed,
 * read-all on open, guardian route taps (wallet → Pagamentos, event →
 * Eventos), inert attendance rows and the perfil settings switch — muting
 * kills the badge server-side (spec 010 story 9).
 */

import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '../../src/session/api';
import { sessionTestApi } from '../../src/session/session-store';
import { installFetchMock, json, makeMe, type FetchHandler } from '../helpers/session';
import { makeDependents } from '../helpers/enrollment';
import { makeGuardianPayments } from '../helpers/billing';
import { makeResponsavelEvents } from '../helpers/events';
import {
  makeNotificationsPage,
  makeResponsavelFeed,
  notificationsHandlers,
  type NotificationsBackendOptions,
  type NotificationsLog,
} from '../helpers/notifications';

jest.useFakeTimers();
// sábado, 1 de agosto de 2026 — same pin as the dependents suite.
jest.setSystemTime(new Date(2026, 7, 1, 12, 0, 0));

const secure = SecureStore as unknown as { __reset: () => void };

function renderResponsavel(
  options: NotificationsBackendOptions = {},
  override?: FetchHandler,
): NotificationsLog {
  const { handler, log } = notificationsHandlers(options);
  installFetchMock((request) => {
    const overridden = override?.(request);
    if (overridden) return overridden;
    const fromNotifications = handler(request);
    if (fromNotifications) return fromNotifications;
    if (request.method === 'GET' && request.path === '/v1/responsavel/dependents') {
      return json(200, { dependents: makeDependents() });
    }
    return null;
  });
  sessionTestApi.seed({
    status: 'authed',
    session: makeMe({ role: 'guardian', fullName: 'Fernanda Silveira' }),
  });
  renderRouter('src/app');
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return log;
}

async function openNotificacoes(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('notifications-bell')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('notifications-bell'));
  });
  await waitFor(() => expect(screen.getByText('Notificações')).toBeTruthy());
}

describe('responsável Notificações (NOT.9)', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
  });

  it('shows the bell dot, renders the responsavel-09 feed on open and read-all kills the dot', async () => {
    const log = renderResponsavel({
      count: 4,
      pages: [makeNotificationsPage(makeResponsavelFeed())],
    });

    await waitFor(() => expect(screen.getByTestId('notifications-bell-dot')).toBeTruthy());

    await openNotificacoes();

    // responsavel-09 rows: payer bill, child graduation, event, attendance.
    await waitFor(() =>
      expect(screen.getByText('Mensalidade do Pedro em aberto')).toBeTruthy(),
    );
    expect(
      screen.getByText('R$ 150,00 · vence em 10 de agosto · pague com Pix em 1 toque'),
    ).toBeTruthy();
    expect(screen.getByText('R$')).toBeTruthy();
    expect(screen.getByText('Pedro recebeu o 3º grau na faixa cinza')).toBeTruthy();
    expect(screen.getByText('3º')).toBeTruthy();
    expect(screen.getByText('Festival Kids abriu inscrições')).toBeTruthy();
    expect(screen.getByText('13')).toBeTruthy();
    expect(screen.getByText('Júlia completou 13 aulas no mês')).toBeTruthy();
    expect(screen.getByText('JS')).toBeTruthy();
    expect(screen.getAllByText('Hoje')).toHaveLength(4);

    await waitFor(() => expect(log.readAllPosts).toBe(1));
    await waitFor(() =>
      expect(screen.queryByTestId('notifications-bell-dot')).toBeNull(),
    );
  });

  it('routes a wallet row onto Pagamentos (guardian shell map)', async () => {
    renderResponsavel(
      { pages: [makeNotificationsPage(makeResponsavelFeed())] },
      ({ method, path }) =>
        method === 'GET' && path === '/v1/responsavel/payments'
          ? json(200, makeGuardianPayments())
          : null,
    );

    await openNotificacoes();
    await waitFor(() =>
      expect(screen.getByText('Mensalidade do Pedro em aberto')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Mensalidade do Pedro em aberto'));
    });

    await waitFor(() => expect(screen.getByText('Pedro · agosto')).toBeTruthy());
    expect(screen.getByText('Pagar com Pix')).toBeTruthy();
  });

  it('routes an event row onto Eventos and keeps attendance rows inert', async () => {
    const feed = makeResponsavelFeed();
    const attendanceRow = feed[3];
    if (!attendanceRow) throw new Error('fixture drift: expected 4 guardian rows');
    renderResponsavel(
      { pages: [makeNotificationsPage(feed)] },
      ({ method, path }) =>
        method === 'GET' && path === '/v1/responsavel/events'
          ? json(200, makeResponsavelEvents())
          : null,
    );

    await openNotificacoes();
    await waitFor(() =>
      expect(screen.getByText('Júlia completou 13 aulas no mês')).toBeTruthy(),
    );

    // route: null (attendance insight) → nothing happens.
    await act(async () => {
      fireEvent.press(screen.getByTestId(`notification-${attendanceRow.id}`));
    });
    expect(screen.getByText('Notificações')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Festival Kids abriu inscrições'));
    });

    await waitFor(() =>
      expect(screen.getByText('Confirme a participação por dependente')).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByText('Festival Kids')).toBeTruthy());
  });

  it('perfil switch mutes the membership and the badge dies with it (story 9)', async () => {
    const log = renderResponsavel({ count: 2 });

    await waitFor(() => expect(screen.getByTestId('notifications-bell-dot')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Perfil'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('perfil-notifications-switch')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.getByTestId('perfil-notifications-switch').props.value).toBe(true),
    );

    await act(async () => {
      fireEvent(screen.getByTestId('perfil-notifications-switch'), 'valueChange', false);
    });

    await waitFor(() => expect(log.settingsPuts).toEqual([{ enabled: false }]));
    await waitFor(() =>
      expect(screen.getByTestId('perfil-notifications-switch').props.value).toBe(false),
    );
    // Mute zeroes the server-side count — the home bell dot follows.
    await waitFor(() =>
      expect(screen.queryByTestId('notifications-bell-dot')).toBeNull(),
    );
  });
});
