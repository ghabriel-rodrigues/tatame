/**
 * STO.9 — Loja console, Pedidos board (admin-04/05, spec 009): order cards
 * with buyer, item summary, total and the PT-BR status chips (pending never
 * reaches the board), the status sheet with the "atual" marker and only the
 * valid transitions enabled, ready/delivered moves with their toasts, and
 * Cancelado gated by the estorno confirm. Real routes + real client against
 * MSW (web-07).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  adminStoreHandlers,
  http,
  makeAdminStoreOrder,
  makeAdminStoreOrderBoard,
  makeMeResponse,
  makeMembership,
  makeStoreOrderItem,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

const session = () =>
  makeMeResponse({ memberships: [makeMembership({ role: 'admin' })] });

async function openPedidos(user: ReturnType<typeof userEvent.setup>) {
  renderRoute('/admin/loja', { session: session() });
  await screen.findByRole('heading', { name: 'Loja da academia' });
  await user.click(screen.getByRole('tab', { name: 'Pedidos' }));
}

describe('Loja — Pedidos (STO.9)', () => {
  it('renders the admin-04 board: buyer · number, item summary and status chips', async () => {
    server.use(...adminStoreHandlers());
    const user = userEvent.setup();
    await openPedidos(user);

    expect(
      await screen.findByText('Lucas Almeida · #2431'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Kimono oficial · A2 · R$ 389 · Pix'),
    ).toBeInTheDocument();
    expect(screen.getByText('Recebido')).toBeInTheDocument();

    expect(screen.getByText('Fernanda Silveira · #2430')).toBeInTheDocument();
    expect(
      screen.getByText('Camiseta da equipe · P · R$ 69 · Pix'),
    ).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();

    expect(screen.getByText('Marina Costa · #2428')).toBeInTheDocument();
    expect(
      screen.getByText('Rash guard · M · R$ 149 · Pix'),
    ).toBeInTheDocument();

    // Sizeless item skips the tam segment.
    expect(screen.getByText('João Ferraz · #2425')).toBeInTheDocument();
    expect(
      screen.getByText('Protetor bucal · R$ 39 · Pix'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Entregue')).toHaveLength(2);
  });

  it('keeps pending orders off the board', async () => {
    server.use(
      ...adminStoreHandlers({
        orders: [
          ...makeAdminStoreOrderBoard(),
          makeAdminStoreOrder({
            number: 2440,
            status: 'pending',
            buyer: {
              userId: '018f0000-0000-7000-8054-00000000ffff',
              fullName: 'Pedro Pendente',
            },
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    await openPedidos(user);

    expect(
      await screen.findByText('Lucas Almeida · #2431'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Pedro Pendente/)).not.toBeInTheDocument();
    expect(screen.queryByText('Aguardando pagamento')).not.toBeInTheDocument();
  });

  it('opens the admin-05 sheet: item card, retirada note, options and the atual marker', async () => {
    server.use(...adminStoreHandlers());
    const user = userEvent.setup();
    await openPedidos(user);

    await user.click(
      await screen.findByRole('button', { name: /Lucas Almeida · #2431/ }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Pedido #2431' });

    expect(
      within(sheet).getByText('Lucas Almeida · pago via Pix'),
    ).toBeInTheDocument();
    expect(within(sheet).getByText('Kimono oficial · A2')).toBeInTheDocument();
    expect(within(sheet).getByText('R$ 389')).toBeInTheDocument();
    expect(
      within(sheet).getByText(/Retirada na recepção · comprador é notificado/),
    ).toBeInTheDocument();
    expect(within(sheet).getByText('Status do pedido')).toBeInTheDocument();

    // Four options with their prototype descriptions.
    expect(
      within(sheet).getByText('Pago — aguardando separação'),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText('Separando o item para retirada'),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText('Resolvido — retirado pelo comprador'),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText('Estorno do Pix em até 1 dia útil'),
    ).toBeInTheDocument();

    // Recebido is the current status: atual pill, not clickable.
    expect(within(sheet).getByText('atual')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Recebido' }),
    ).toBeDisabled();
    // Valid transitions from paid: ready and canceled only — no skipping.
    expect(
      within(sheet).getByRole('button', { name: 'Em andamento' }),
    ).toBeEnabled();
    expect(
      within(sheet).getByRole('button', { name: 'Entregue' }),
    ).toBeDisabled();
    expect(
      within(sheet).getByRole('button', { name: 'Cancelado' }),
    ).toBeEnabled();
  });

  it('advances a paid order to Em andamento with the notified toast', async () => {
    const orders = makeAdminStoreOrderBoard();
    const lucas = orders[0]!;
    server.use(...adminStoreHandlers({ orders }));
    let posted: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.post(
        '/v1/admin/store/orders/{id}/status',
        async ({ params, request, response }) => {
          posted = {
            id: params.id,
            body: (await request.json()) as Record<string, unknown>,
          };
          return response(200).json({ ...lucas, status: 'ready' });
        },
      ),
    );
    const user = userEvent.setup();
    await openPedidos(user);

    await user.click(
      await screen.findByRole('button', { name: /Lucas Almeida · #2431/ }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Pedido #2431' });
    await user.click(
      within(sheet).getByRole('button', { name: 'Em andamento' }),
    );

    expect(
      await screen.findByText(
        'Pedido #2431 marcado como em andamento — comprador notificado.',
      ),
    ).toBeInTheDocument();
    expect(posted).toEqual({ id: lucas.id, body: { status: 'ready' } });
  });

  it('advances a ready order to Entregue; delivered is then terminal', async () => {
    const orders = makeAdminStoreOrderBoard();
    const fernanda = orders[1]!;
    server.use(...adminStoreHandlers({ orders }));
    let posted: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.post(
        '/v1/admin/store/orders/{id}/status',
        async ({ params, request, response }) => {
          posted = {
            id: params.id,
            body: (await request.json()) as Record<string, unknown>,
          };
          return response(200).json({ ...fernanda, status: 'delivered' });
        },
      ),
    );
    const user = userEvent.setup();
    await openPedidos(user);

    await user.click(
      await screen.findByRole('button', { name: /Fernanda Silveira · #2430/ }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Pedido #2430' });
    await user.click(within(sheet).getByRole('button', { name: 'Entregue' }));

    expect(
      await screen.findByText(
        'Pedido #2430 marcado como entregue — comprador notificado.',
      ),
    ).toBeInTheDocument();
    expect(posted).toEqual({ id: fernanda.id, body: { status: 'delivered' } });
  });

  it('freezes terminal orders: a delivered pedido offers no transition', async () => {
    server.use(...adminStoreHandlers());
    const user = userEvent.setup();
    await openPedidos(user);

    await user.click(
      await screen.findByRole('button', { name: /Marina Costa · #2428/ }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Pedido #2428' });

    expect(
      within(sheet).getByRole('button', { name: 'Recebido' }),
    ).toBeDisabled();
    expect(
      within(sheet).getByRole('button', { name: 'Em andamento' }),
    ).toBeDisabled();
    expect(
      within(sheet).getByRole('button', { name: 'Entregue' }),
    ).toBeDisabled();
    expect(
      within(sheet).getByRole('button', { name: 'Cancelado' }),
    ).toBeDisabled();
    expect(within(sheet).getByText('atual')).toBeInTheDocument();
  });

  it('cancels only after the estorno confirm, with the refund toast', async () => {
    const orders = makeAdminStoreOrderBoard();
    const lucas = orders[0]!;
    server.use(...adminStoreHandlers({ orders }));
    let posted: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.post(
        '/v1/admin/store/orders/{id}/status',
        async ({ params, request, response }) => {
          posted = {
            id: params.id,
            body: (await request.json()) as Record<string, unknown>,
          };
          return response(200).json({ ...lucas, status: 'canceled' });
        },
      ),
    );
    const user = userEvent.setup();
    await openPedidos(user);

    await user.click(
      await screen.findByRole('button', { name: /Lucas Almeida · #2431/ }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Pedido #2431' });
    await user.click(within(sheet).getByRole('button', { name: 'Cancelado' }));

    const confirm = await screen.findByRole('dialog', {
      name: 'Cancelar pedido',
    });
    expect(
      within(confirm).getByText(/estorno do Pix em até 1 dia útil/),
    ).toBeInTheDocument();
    expect(posted).toBeNull();

    await user.click(
      within(confirm).getByRole('button', { name: 'Cancelar pedido' }),
    );
    expect(
      await screen.findByText(
        'Pedido #2431 marcado como cancelado — estorno iniciado.',
      ),
    ).toBeInTheDocument();
    expect(posted).toEqual({ id: lucas.id, body: { status: 'canceled' } });
  });

  it('maps store.order_invalid_transition to the PT-BR message', async () => {
    server.use(...adminStoreHandlers());
    server.use(
      http.post('/v1/admin/store/orders/{id}/status', ({ response }) =>
        response.untyped(
          problemResponse(409, 'store.order_invalid_transition'),
        ),
      ),
    );
    const user = userEvent.setup();
    await openPedidos(user);

    await user.click(
      await screen.findByRole('button', { name: /Lucas Almeida · #2431/ }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Pedido #2431' });
    await user.click(
      within(sheet).getByRole('button', { name: 'Em andamento' }),
    );

    expect(
      await screen.findByText('Este pedido não aceita essa mudança de status.'),
    ).toBeInTheDocument();
  });

  it('renders an honest empty state when the board has no orders', async () => {
    server.use(...adminStoreHandlers({ orders: [] }));
    const user = userEvent.setup();
    await openPedidos(user);

    expect(await screen.findByText('Nenhum pedido ainda')).toBeInTheDocument();
  });

  it('uses makeStoreOrderItem defaults for ad-hoc orders', async () => {
    server.use(
      ...adminStoreHandlers({
        orders: [
          makeAdminStoreOrder({
            number: 2500,
            status: 'paid',
            totalCents: 77_800,
            buyer: {
              userId: '018f0000-0000-7000-8054-00000000aaaa',
              fullName: 'Bia Andrade',
            },
            item: makeStoreOrderItem({ quantity: 2 }),
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    await openPedidos(user);

    expect(await screen.findByText('Bia Andrade · #2500')).toBeInTheDocument();
    expect(
      screen.getByText('Kimono oficial · A2 · R$ 778 · Pix'),
    ).toBeInTheDocument();
  });
});
