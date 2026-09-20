/**
 * NOT.7 — admin console bell + notifications panel (spec 010): unread dot
 * from `/v1/notifications/unread-count`, panel open fires read-all and
 * renders the feed cards (chip/icon, title, body, relative timestamp),
 * empty state, admin route-hint navigation and the no-bell-on-plataforma
 * rule. Real routes + real client against MSW (web-07).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  adminStoreHandlers,
  billingHandlers,
  http,
  makeMeResponse,
  makeMembership,
  makeNotification,
  makeNotificationFeed,
  makePlatformMembership,
  notificationsHandlers,
  platformConsoleHandlers,
} from '@tatame/shared/testing';
import { renderRoute } from '../test/render-route';
import { server } from '../test/setup';
import {
  adminRouteFor,
  relativeNotificationTime,
} from './notifications-format';

// The /admin index is the Visão financeira (BIL.13) — it always fetches.
beforeEach(() => {
  server.use(...billingHandlers());
});

function renderAdmin() {
  const admin = makeMembership({ role: 'admin' });
  return renderRoute('/admin', {
    session: makeMeResponse({ memberships: [admin] }),
  });
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Notificações' }));
  return await screen.findByRole('region', { name: 'Painel de notificações' });
}

describe('NOT.7 — console bell + unread dot', () => {
  it('renders the bell with the pink dot when unread-count is positive', async () => {
    server.use(...notificationsHandlers({ unreadCount: 3 }));
    renderAdmin();

    expect(
      await screen.findByRole('button', { name: 'Notificações' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('notifications-unread-dot'),
    ).toBeInTheDocument();
  });

  it('renders no dot when unread-count is zero', async () => {
    server.use(...notificationsHandlers({ notifications: [], unreadCount: 0 }));
    renderAdmin();

    expect(
      await screen.findByRole('button', { name: 'Notificações' }),
    ).toBeInTheDocument();
    // Let the page's own async settle so the badge query has resolved too.
    await screen.findByRole('heading', { name: 'Visão financeira' });
    expect(
      screen.queryByTestId('notifications-unread-dot'),
    ).not.toBeInTheDocument();
  });

  it('renders no bell on the plataforma surface (platform notifications are debt)', async () => {
    server.use(...platformConsoleHandlers());
    renderRoute('/plataforma', {
      session: makeMeResponse({
        memberships: [makePlatformMembership()],
        academy: null,
      }),
    });

    expect(
      await screen.findByRole('heading', { name: 'Visão geral' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Notificações' }),
    ).not.toBeInTheDocument();
  });
});

describe('NOT.7 — notifications panel', () => {
  it('opens the panel, fires read-all, renders the cards and clears the dot', async () => {
    const readAllSpy = vi.fn();
    server.use(
      // First match wins inside a single use() — the spy shadows the default.
      http.post('/v1/notifications/read-all', ({ response }) => {
        readAllSpy();
        return response(200).json({ updated: 2 });
      }),
      ...notificationsHandlers({ notifications: makeNotificationFeed() }),
    );
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByTestId('notifications-unread-dot');

    const panel = await openPanel(user);

    // Cards: title, body and PT-BR relative timestamps per the feed fixture.
    expect(
      await within(panel).findByText('Estoque baixo: Mochila de treino'),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText('3 unidades restantes (alerta em 5)'),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText('Mensalidade de agosto disponível'),
    ).toBeInTheDocument();
    expect(within(panel).getByText('Open mat de verão')).toBeInTheDocument();
    expect(
      within(panel).getByText('Pedro Silveira fez check-in'),
    ).toBeInTheDocument();
    expect(within(panel).getAllByText('Hoje').length).toBeGreaterThan(0);
    expect(within(panel).getByText('Ontem')).toBeInTheDocument();

    // read-all fired on open; the dot dies without a refetch race.
    await waitFor(() => expect(readAllSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.queryByTestId('notifications-unread-dot'),
      ).not.toBeInTheDocument(),
    );
  });

  it('renders the empty state when the feed has no rows', async () => {
    server.use(...notificationsHandlers({ notifications: [], unreadCount: 0 }));
    const user = userEvent.setup();
    renderAdmin();

    const panel = await openPanel(user);
    expect(
      await within(panel).findByText('Nenhuma notificação'),
    ).toBeInTheDocument();
  });

  it('renders pre-rendered chip labels and falls back to the category icon', async () => {
    server.use(
      ...notificationsHandlers({
        notifications: [
          ...makeNotificationFeed(),
          makeNotification({
            category: 'store',
            chip: null,
            title: 'Pedido #2431 pago',
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    renderAdmin();

    const panel = await openPanel(user);
    await within(panel).findByText('Pedido #2431 pago');
    // One chip per category from the seed feed: R$ · ! · 15 · 2º · PS.
    for (const chip of ['R$', '!', '15', '2º', 'PS']) {
      expect(within(panel).getByText(chip)).toBeInTheDocument();
    }
    // The chip-less row renders the store category icon instead.
    expect(
      within(panel).getByTestId('notification-icon-store'),
    ).toBeInTheDocument();
  });

  it('navigates admin-relevant route hints and leaves the rest inert', async () => {
    server.use(
      ...notificationsHandlers({ notifications: makeNotificationFeed() }),
    );
    const user = userEvent.setup();
    const { router } = renderAdmin();

    const panel = await openPanel(user);
    await within(panel).findByText('Estoque baixo: Mochila de treino');
    // jsdom-typing note: the RN types shadow lib.dom's HTMLElement — read
    // tagName through a structural cast (same workaround as web-07 suites).
    const tagOf = (element: unknown) =>
      (element as { tagName: string }).tagName;
    const cardWith = (text: string) =>
      within(panel)
        .getAllByRole('listitem')
        .find((item) => within(item).queryByText(text) !== null)!;

    // wallet is not an admin surface — the card is inert (not a button).
    const walletCard = cardWith('Mensalidade de agosto disponível');
    expect(tagOf(walletCard)).not.toBe('BUTTON');
    await user.click(walletCard);
    expect(router.state.location.pathname).toBe('/admin');

    // store → /admin/loja (Loja console fetches on landing).
    server.use(...adminStoreHandlers());
    const storeCard = cardWith('Estoque baixo: Mochila de treino');
    expect(tagOf(storeCard)).toBe('BUTTON');
    await user.click(storeCard);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/loja'),
    );
  });
});

describe('NOT.7 — pure logic', () => {
  it('maps admin-relevant semantic routes and leaves the rest inert', () => {
    expect(adminRouteFor('store')).toBe('/admin/loja');
    expect(adminRouteFor('orders')).toBe('/admin/loja');
    expect(adminRouteFor('graduation')).toBe('/admin/graduacao');
    expect(adminRouteFor('event/018f-abc')).toBe('/admin/eventos');
    expect(adminRouteFor('wallet')).toBeNull();
    expect(adminRouteFor('unknown-hint')).toBeNull();
    expect(adminRouteFor(null)).toBeNull();
    expect(adminRouteFor(undefined)).toBeNull();
  });

  it('formats PT-BR relative timestamps (Hoje/Ontem/weekday/month)', () => {
    const now = new Date(2026, 7, 10, 15, 0, 0); // seg, 10 ago 2026
    const iso = (d: Date) => d.toISOString();
    expect(relativeNotificationTime(iso(new Date(2026, 7, 10, 8)), now)).toBe(
      'Hoje',
    );
    expect(relativeNotificationTime(iso(new Date(2026, 7, 9, 22)), now)).toBe(
      'Ontem',
    );
    expect(relativeNotificationTime(iso(new Date(2026, 7, 7, 12)), now)).toBe(
      'Sexta',
    );
    expect(relativeNotificationTime(iso(new Date(2026, 7, 4, 12)), now)).toBe(
      'Terça',
    );
    expect(relativeNotificationTime(iso(new Date(2026, 7, 3, 12)), now)).toBe(
      '3 de ago',
    );
    expect(relativeNotificationTime(iso(new Date(2026, 6, 28, 12)), now)).toBe(
      '28 de jul',
    );
  });
});
