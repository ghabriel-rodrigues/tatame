/**
 * AGD.4 + EVT.9 — Calendário console page (admin-14, specs 007/008): month
 * grid built client-side from the echoed month (Sunday-first weeks), purple
 * dots expanded from the weekday recurrence buckets, pink dots + day Evento
 * entries from the filled `events` contract (spec 008), "aulas
 * recorrentes"/"evento" legend, selected-day agenda sorted by time and the
 * "Nada agendado neste dia." empty state, plus the nav link. Real routes +
 * real client against MSW (web-07). Fixture month: Agosto 2026 — day 1 is a
 * Saturday, Sundays (2, 9, 16, 23, 30) are free.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  adminCalendarHandlers,
  billingHandlers,
  makeAdminCalendar,
  makeCalendarClassItem,
  makeCalendarEventItem,
  makeMeResponse,
  makeMembership,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

const user = userEvent.setup();

/** jsdom lib quirk (same dodge as visao-financeira.spec): read text via cast. */
const textOf = (element: unknown) =>
  (element as { textContent: string | null }).textContent;

function renderCalendario() {
  server.use(...adminCalendarHandlers());
  const admin = makeMembership({ role: 'admin' });
  return renderRoute('/admin/calendario', {
    session: makeMeResponse({ memberships: [admin] }),
  });
}

describe('Calendário (AGD.4)', () => {
  it('renders the Agosto 2026 grid: title, subtitle, Sunday-first offset and 31 day cells', async () => {
    renderCalendario();

    expect(
      await screen.findByRole('heading', { name: 'Agosto 2026' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Todas as turmas e eventos da academia'),
    ).toBeInTheDocument();
    // 2026-08-01 is a Saturday → six leading blanks in a Sunday-first week.
    expect(screen.getAllByTestId('cal-blank')).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: /^Dia \d+$/ })).toHaveLength(
      31,
    );
    expect(screen.getByRole('button', { name: 'Dia 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dia 31' })).toBeInTheDocument();
  });

  it('expands weekday buckets into dots: every scheduled weekday dotted, free Sundays bare', async () => {
    renderCalendario();
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    // Mondays (Fundamentos) and Saturdays (Open mat) carry the class dot.
    for (const day of [3, 10, 17, 24, 31]) {
      expect(screen.getByTestId(`dot-aula-${day}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('dot-aula-1')).toBeInTheDocument();
    // Sundays have an empty bucket → no dot.
    for (const day of [2, 9, 16, 23, 30]) {
      expect(screen.queryByTestId(`dot-aula-${day}`)).not.toBeInTheDocument();
    }
    // The default fixture ships no events — no pink dots without them.
    expect(screen.queryByTestId(/^dot-evento-/)).not.toBeInTheDocument();
  });

  it('lists the selected day agenda sorted by time with turma, professor and occupancy', async () => {
    renderCalendario();
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    // 2026-08-04 is a Tuesday: Kids 18:00 then Avançada 20:00.
    await user.click(screen.getByRole('button', { name: 'Dia 4' }));
    expect(screen.getByText('terça, 4 de agosto')).toBeInTheDocument();

    expect(screen.getByText('Kids')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(screen.getByText('18:45')).toBeInTheDocument();
    expect(screen.getByText('Prof. Ana Souza · 14 de 16')).toBeInTheDocument();
    expect(screen.getByText('Avançada')).toBeInTheDocument();
    expect(
      screen.getByText('Prof. Rafael Nunes · 16 de 20'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Aula')).toHaveLength(2);
    // Sorted by start time: Kids (18:00) before Avançada (20:00).
    const rows = screen.getAllByText(/^(Kids|Avançada)$/).map(textOf);
    expect(rows).toEqual(['Kids', 'Avançada']);
    expect(
      screen.queryByText('Nada agendado neste dia.'),
    ).not.toBeInTheDocument();
  });

  it('shows the admin empty-state copy on a free selected day', async () => {
    renderCalendario();
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    // 2026-08-02 is a Sunday — the free day of the admin-14 screenshot.
    await user.click(screen.getByRole('button', { name: 'Dia 2' }));
    expect(screen.getByText('domingo, 2 de agosto')).toBeInTheDocument();
    expect(screen.getByText('Nada agendado neste dia.')).toBeInTheDocument();
    const selected = screen.getByRole('button', { name: 'Dia 2' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the "aulas recorrentes" / "evento" legend', async () => {
    renderCalendario();
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    expect(screen.getByText('aulas recorrentes')).toBeInTheDocument();
    expect(screen.getByText('evento')).toBeInTheDocument();
  });

  it('renders an all-empty month with every day bare and the empty state', async () => {
    server.use(
      ...adminCalendarHandlers(
        makeAdminCalendar({
          classesByWeekday: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
        }),
      ),
    );
    const admin = makeMembership({ role: 'admin' });
    renderRoute('/admin/calendario', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    expect(screen.queryAllByTestId(/^dot-aula-/)).toHaveLength(0);
    expect(screen.getByText('Nada agendado neste dia.')).toBeInTheDocument();
  });

  it('supports a multi-class weekday bucket via the item factory', async () => {
    const extra = makeCalendarClassItem({
      className: 'No-Gi',
      startTime: '07:00',
      endTime: '08:00',
      professorName: 'Ana Souza',
      occupancy: { active: 8, capacity: 20 },
    });
    const base = makeAdminCalendar();
    server.use(
      ...adminCalendarHandlers(
        makeAdminCalendar({
          classesByWeekday: {
            ...base.classesByWeekday,
            2: [...base.classesByWeekday[2], extra],
          },
        }),
      ),
    );
    const admin = makeMembership({ role: 'admin' });
    renderRoute('/admin/calendario', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    await user.click(screen.getByRole('button', { name: 'Dia 11' }));
    // 07:00 No-Gi sorts ahead of Kids and Avançada.
    const names = screen.getAllByText(/^(No-Gi|Kids|Avançada)$/).map(textOf);
    expect(names).toEqual(['No-Gi', 'Kids', 'Avançada']);
  });

  it('marks event dates with the pink dot from the filled events contract (EVT.9)', async () => {
    server.use(
      ...adminCalendarHandlers(
        makeAdminCalendar({
          events: [
            makeCalendarEventItem({
              name: 'Open mat de verão',
              date: '2026-08-15',
            }),
            makeCalendarEventItem({
              name: 'Exame de faixa',
              date: '2026-08-22',
              time: '09:00',
              priceCents: 12_000,
            }),
          ],
        }),
      ),
    );
    const admin = makeMembership({ role: 'admin' });
    renderRoute('/admin/calendario', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    expect(screen.getByTestId('dot-evento-15')).toBeInTheDocument();
    expect(screen.getByTestId('dot-evento-22')).toBeInTheDocument();
    // Only the event dates carry the pink dot.
    expect(screen.getAllByTestId(/^dot-evento-/)).toHaveLength(2);
    // Event days keep their class dot too (both Saturdays have Open mat).
    expect(screen.getByTestId('dot-aula-15')).toBeInTheDocument();
  });

  it('merges Evento entries into the selected-day agenda, sorted by time (EVT.9)', async () => {
    server.use(
      ...adminCalendarHandlers(
        makeAdminCalendar({
          events: [
            makeCalendarEventItem({
              name: 'Exame de faixa',
              date: '2026-08-22',
              time: '09:00',
              location: 'Tatame principal',
              priceCents: 12_000,
            }),
          ],
        }),
      ),
    );
    const admin = makeMembership({ role: 'admin' });
    renderRoute('/admin/calendario', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    // 2026-08-22 is a Saturday: Exame 09:00 (evento) before Open mat 10:00 (aula).
    await user.click(screen.getByRole('button', { name: 'Dia 22' }));
    expect(screen.getByText('sábado, 22 de agosto')).toBeInTheDocument();

    expect(screen.getByText('Exame de faixa')).toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('Tatame principal · R$ 120')).toBeInTheDocument();
    expect(screen.getByText('Evento')).toBeInTheDocument();
    expect(screen.getByText('Open mat')).toBeInTheDocument();
    expect(screen.getByText('Aula')).toBeInTheDocument();
    // Sorted by time: the 09:00 event ahead of the 10:00 class.
    const rows = screen.getAllByText(/^(Exame de faixa|Open mat)$/).map(textOf);
    expect(rows).toEqual(['Exame de faixa', 'Open mat']);
  });

  it('renders free events with the Gratuito label and ignores out-of-month dates (EVT.9)', async () => {
    server.use(
      ...adminCalendarHandlers(
        makeAdminCalendar({
          events: [
            makeCalendarEventItem({
              name: 'Open mat de verão',
              date: '2026-08-16',
              time: '10:00',
              location: 'Tatame principal',
              priceCents: null,
            }),
            // September event — outside the echoed month, never a dot.
            makeCalendarEventItem({
              name: 'Festival Kids',
              date: '2026-09-13',
            }),
          ],
        }),
      ),
    );
    const admin = makeMembership({ role: 'admin' });
    renderRoute('/admin/calendario', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    await screen.findByRole('heading', { name: 'Agosto 2026' });

    expect(screen.getByTestId('dot-evento-16')).toBeInTheDocument();
    expect(screen.queryByTestId('dot-evento-13')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^dot-evento-/)).toHaveLength(1);

    // A free Sunday whose only entry is the event — Evento row, no empty state.
    await user.click(screen.getByRole('button', { name: 'Dia 16' }));
    expect(screen.getByText('domingo, 16 de agosto')).toBeInTheDocument();
    expect(screen.getByText('Open mat de verão')).toBeInTheDocument();
    expect(screen.getByText('Tatame principal · Gratuito')).toBeInTheDocument();
    expect(screen.getByText('Evento')).toBeInTheDocument();
    expect(
      screen.queryByText('Nada agendado neste dia.'),
    ).not.toBeInTheDocument();
  });

  it('exposes the Calendário nav link in the admin console shell', async () => {
    server.use(...billingHandlers(), ...adminCalendarHandlers());
    const admin = makeMembership({ role: 'admin' });
    renderRoute('/admin', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    await screen.findByRole('heading', { name: 'Visão financeira' });

    const nav = screen.getByRole('navigation', { name: 'Seções do painel' });
    const link = within(nav).getByRole('link', { name: 'Calendário' });
    expect(link).toHaveAttribute('href', '/admin/calendario');

    await user.click(link);
    expect(
      await screen.findByRole('heading', { name: 'Agosto 2026' }),
    ).toBeInTheDocument();
  });
});
