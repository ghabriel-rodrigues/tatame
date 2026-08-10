/**
 * EVT.9 — Eventos console page (admin-13, spec 008): gradient-preset cards
 * with valor chip, date and inscritos lines, Rascunho/Cancelado states, the
 * Novo evento sheet (salvar rascunho vs publicar, valor vazio = gratuito),
 * edit + publish with the 422 requirements mapping, cancel with the charge
 * warning, the inscritos view totals and the Comunicar toast, plus the nav
 * link. Real routes + real client against MSW (web-07).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  adminEventsHandlers,
  billingHandlers,
  http,
  makeAdminEvent,
  makeAdminEventList,
  makeDraftEvent,
  makeEnrollmentRegistry,
  makeEventTotals,
  makeMeResponse,
  makeMembership,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

const session = () => makeMeResponse({ memberships: [makeMembership({ role: 'admin' })] });

describe('Eventos (EVT.9)', () => {
  it('renders the admin-13 cards: valor chips, date and inscritos lines', async () => {
    server.use(...adminEventsHandlers());
    renderRoute('/admin/eventos', { session: session() });

    expect(await screen.findByRole('heading', { name: 'Eventos' })).toBeInTheDocument();

    // Open mat de verão — gratuito, sáb 15/08 10:00, 32 confirmados.
    expect(await screen.findByText('Open mat de verão')).toBeInTheDocument();
    expect(screen.getByText('Gratuito')).toBeInTheDocument();
    expect(screen.getByText('Sáb, 15 de agosto · 10:00')).toBeInTheDocument();
    expect(screen.getByText('32 confirmados · Prof. Rafael Nunes')).toBeInTheDocument();

    // Exame de faixa — R$ 120, arrecadado R$ 2.160.
    expect(screen.getByText('Exame de faixa')).toBeInTheDocument();
    expect(screen.getByText('R$ 120')).toBeInTheDocument();
    expect(screen.getByText('Sáb, 29 de agosto · 09:00')).toBeInTheDocument();
    expect(
      screen.getByText('18 inscritos · R$ 2.160 · Prof. Rafael Nunes'),
    ).toBeInTheDocument();

    // Festival Kids — R$ 60, Prof. Ana.
    expect(screen.getByText('Festival Kids')).toBeInTheDocument();
    expect(screen.getByText('R$ 60')).toBeInTheDocument();
    expect(screen.getByText('Dom, 13 de setembro · 09:30')).toBeInTheDocument();
    expect(
      screen.getByText('9 inscritos · R$ 240 · Prof. Ana Souza'),
    ).toBeInTheDocument();

    // Published cards carry the Comunicar action.
    expect(screen.getByRole('button', { name: 'Comunicar Open mat de verão' })).toBeInTheDocument();
  });

  it('renders the gradient banner from the preset slug catalog', async () => {
    const event = makeAdminEvent({ name: 'Open mat', bannerPreset: 'event-purple-pink' });
    server.use(...adminEventsHandlers({ events: [event] }));
    renderRoute('/admin/eventos', { session: session() });
    await screen.findByText('Open mat');

    const banner = screen.getByTestId(`event-banner-${event.id}`);
    expect(banner).toHaveStyle({
      background:
        'linear-gradient(135deg, var(--purple-700), var(--purple-500) 70%, var(--pink-500) 140%)',
    });
  });

  it('shows the Rascunho chip and "Data a definir" on drafts, with no Comunicar', async () => {
    const draft = makeDraftEvent({ name: 'Seminário de guarda' });
    server.use(...adminEventsHandlers({ events: [draft, ...makeAdminEventList()] }));
    renderRoute('/admin/eventos', { session: session() });

    expect(await screen.findByText('Seminário de guarda')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('Data a definir')).toBeInTheDocument();
    expect(screen.getByText('0 inscritos · Prof. Rafael Nunes')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Comunicar Seminário de guarda' }),
    ).not.toBeInTheDocument();
  });

  it('shows the Cancelado chip and freezes canceled events (no edit, no Comunicar)', async () => {
    const canceled = makeAdminEvent({
      name: 'Copa interna',
      status: 'canceled',
      totals: makeEventTotals({ inscritos: 12, confirmados: 10 }),
    });
    server.use(...adminEventsHandlers({ events: [canceled] }));
    renderRoute('/admin/eventos', { session: session() });

    expect(await screen.findByText('Copa interna')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar Copa interna' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Comunicar Copa interna' }),
    ).not.toBeInTheDocument();
  });

  it('creates a draft from the Novo evento sheet (empty valor = gratuito, no date)', async () => {
    const registry = makeEnrollmentRegistry();
    const rafael = registry.professors[0]!;
    server.use(...adminEventsHandlers({ professors: registry.professors }));
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/events', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json(makeDraftEvent({ name: 'Seminário de guarda' }));
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/eventos', { session: session() });
    await screen.findByText('Open mat de verão');

    await user.click(screen.getByRole('button', { name: 'Novo evento' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo evento' });
    await user.type(within(sheet).getByLabelText(/Nome/), 'Seminário de guarda');
    await user.click(within(sheet).getByRole('combobox', { name: 'Responsável' }));
    await user.click(await screen.findByRole('option', { name: 'Rafael Nunes' }));
    await user.click(within(sheet).getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText('Rascunho salvo.')).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Seminário de guarda',
      description: null,
      bannerPreset: 'event-purple-pink',
      location: null,
      startsAt: null,
      priceCents: null,
      responsibleUserId: rafael.userId,
      status: 'draft',
    });
  });

  it('publishes a new paid event with date, hora, local, valor and banner preset', async () => {
    const registry = makeEnrollmentRegistry();
    const ana = registry.professors[1]!;
    server.use(...adminEventsHandlers({ professors: registry.professors }));
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/events', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json(makeAdminEvent({ name: 'Festival Kids' }));
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/eventos', { session: session() });
    await screen.findByText('Open mat de verão');

    await user.click(screen.getByRole('button', { name: 'Novo evento' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo evento' });
    await user.type(within(sheet).getByLabelText(/Nome/), 'Festival Kids');
    await user.type(within(sheet).getByLabelText(/Descrição/), 'Aberto às famílias');
    await user.type(within(sheet).getByLabelText(/Local/), 'Tatame principal');
    fireEvent.change(within(sheet).getByLabelText(/Data/), {
      target: { value: '2026-09-13' },
    });
    fireEvent.change(within(sheet).getByLabelText(/Hora/), {
      target: { value: '09:30' },
    });
    await user.type(within(sheet).getByLabelText(/Valor/), '60,00');
    await user.click(within(sheet).getByRole('button', { name: 'Banner Rosa e roxo' }));
    await user.click(within(sheet).getByRole('combobox', { name: 'Responsável' }));
    await user.click(await screen.findByRole('option', { name: 'Ana Souza' }));
    await user.click(within(sheet).getByRole('button', { name: 'Publicar evento' }));

    expect(await screen.findByText('Evento publicado.')).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Festival Kids',
      description: 'Aberto às famílias',
      bannerPreset: 'event-pink-purple',
      location: 'Tatame principal',
      startsAt: new Date('2026-09-13T09:30:00').toISOString(),
      priceCents: 6_000,
      responsibleUserId: ana.userId,
      status: 'published',
    });
  });

  it('maps event.publish_requirements to the PT-BR message when publishing a bare draft', async () => {
    const draft = makeDraftEvent({ name: 'Seminário de guarda' });
    server.use(...adminEventsHandlers({ events: [draft] }));
    server.use(
      http.post('/v1/admin/events/{id}/publish', ({ response }) =>
        response.untyped(problemResponse(422, 'event.publish_requirements')),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/admin/eventos', { session: session() });
    await screen.findByText('Seminário de guarda');

    await user.click(screen.getByRole('button', { name: 'Editar Seminário de guarda' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar evento' });
    await user.click(within(sheet).getByRole('button', { name: 'Publicar evento' }));

    expect(
      await screen.findByText('Defina data e local para publicar o evento.'),
    ).toBeInTheDocument();
  });

  it('edits an event through the banner press (PATCH with the changed values)', async () => {
    const events = makeAdminEventList();
    const openMat = events[0]!;
    server.use(...adminEventsHandlers({ events }));
    let patched: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.patch('/v1/admin/events/{id}', async ({ params, request, response }) => {
        patched = { id: params.id, body: (await request.json()) as Record<string, unknown> };
        return response(200).json({ ...openMat, location: 'Quadra externa' });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/eventos', { session: session() });
    await screen.findByText('Open mat de verão');

    await user.click(screen.getByRole('button', { name: 'Editar Open mat de verão' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar evento' });
    const local = within(sheet).getByLabelText(/Local/);
    await user.clear(local);
    await user.type(local, 'Quadra externa');
    await user.click(within(sheet).getByRole('button', { name: 'Salvar evento' }));

    expect(await screen.findByText('Evento atualizado.')).toBeInTheDocument();
    expect(patched).toEqual({
      id: openMat.id,
      body: {
        name: 'Open mat de verão',
        description: null,
        bannerPreset: 'event-purple-pink',
        location: 'Quadra externa',
        startsAt: new Date('2026-08-15T10:00:00').toISOString(),
        priceCents: null,
        responsibleUserId: openMat.responsible.userId,
      },
    });
  });

  it('cancels an event only after the charge-cancellation warning is confirmed', async () => {
    const events = makeAdminEventList();
    const exame = events[1]!;
    server.use(...adminEventsHandlers({ events }));
    let canceledId: string | null = null;
    server.use(
      http.post('/v1/admin/events/{id}/cancel', ({ params, response }) => {
        canceledId = params.id;
        return response(200).json({ ...exame, status: 'canceled' });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/eventos', { session: session() });
    await screen.findByText('Exame de faixa');

    await user.click(screen.getByRole('button', { name: 'Editar Exame de faixa' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar evento' });
    await user.click(within(sheet).getByRole('button', { name: 'Cancelar evento' }));

    const confirm = await screen.findByRole('dialog', { name: 'Cancelar evento' });
    expect(
      within(confirm).getByText(/cobranças em aberto deste evento serão canceladas/),
    ).toBeInTheDocument();
    expect(canceledId).toBeNull();

    await user.click(within(confirm).getByRole('button', { name: 'Cancelar evento' }));
    expect(await screen.findByText('Evento cancelado.')).toBeInTheDocument();
    expect(canceledId).toBe(exame.id);
  });

  it('shows the inscritos view with rows, statuses and the totals tiles', async () => {
    server.use(...adminEventsHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/eventos', { session: session() });
    await screen.findByText('Exame de faixa');

    await user.click(screen.getByRole('button', { name: 'Inscritos de Exame de faixa' }));
    const sheet = await screen.findByRole('dialog', { name: 'Inscritos' });

    // Totals: 3 inscritos, 2 confirmados, R$ 240,00 arrecadado.
    // ("Inscritos" is both the sheet title and the first tile label.)
    expect(await within(sheet).findAllByText('Inscritos')).toHaveLength(2);
    expect(within(sheet).getByText('3')).toBeInTheDocument();
    expect(within(sheet).getByText('Confirmados')).toBeInTheDocument();
    expect(within(sheet).getByText('2')).toBeInTheDocument();
    expect(within(sheet).getByText('Arrecadado')).toBeInTheDocument();
    expect(within(sheet).getByText('R$ 240,00')).toBeInTheDocument();

    // Rows: who registered, who confirmed, paid amount, status chips.
    expect(within(sheet).getByText('Lucas Almeida')).toBeInTheDocument();
    expect(within(sheet).getByText('por Lucas Almeida · R$ 120,00')).toBeInTheDocument();
    expect(within(sheet).getByText('Pedro Silveira')).toBeInTheDocument();
    expect(
      within(sheet).getByText('por Fernanda Silveira · R$ 120,00'),
    ).toBeInTheDocument();
    expect(within(sheet).getByText('Bia Andrade')).toBeInTheDocument();
    expect(within(sheet).getByText('por Bia Andrade')).toBeInTheDocument();
    expect(within(sheet).getAllByText('Confirmado')).toHaveLength(2);
    expect(within(sheet).getByText('Pagamento pendente')).toBeInTheDocument();
  });

  it('announces to the inscritos and shows the prototype toast on 202', async () => {
    const events = makeAdminEventList();
    const openMat = events[0]!;
    server.use(...adminEventsHandlers({ events }));
    let announcedId: string | null = null;
    server.use(
      http.post('/v1/admin/events/{id}/announce', ({ params, response }) => {
        announcedId = params.id;
        return response(202).json({ recipients: 32 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/eventos', { session: session() });
    await screen.findByText('Open mat de verão');

    await user.click(screen.getByRole('button', { name: 'Comunicar Open mat de verão' }));
    expect(
      await screen.findByText('Comunicado enviado aos inscritos.'),
    ).toBeInTheDocument();
    expect(announcedId).toBe(openMat.id);
  });

  it('exposes the Eventos nav link in the admin console shell', async () => {
    server.use(...billingHandlers(), ...adminEventsHandlers());
    const user = userEvent.setup();
    renderRoute('/admin', { session: session() });
    await screen.findByRole('heading', { name: 'Visão financeira' });

    const nav = screen.getByRole('navigation', { name: 'Seções do painel' });
    const link = within(nav).getByRole('link', { name: 'Eventos' });
    expect(link).toHaveAttribute('href', '/admin/eventos');

    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Eventos' })).toBeInTheDocument();
  });
});
