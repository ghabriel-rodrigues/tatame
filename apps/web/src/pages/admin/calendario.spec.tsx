/**
 * AGD.4 — Calendário console page (admin-14, spec 007): month grid built
 * client-side from the echoed month (Sunday-first weeks), purple dots
 * expanded from the weekday recurrence buckets, "aulas recorrentes"/"evento"
 * legend, selected-day agenda sorted by time and the "Nada agendado neste
 * dia." empty state, plus the nav link. Real routes + real client against
 * MSW (web-07). Fixture month: Agosto 2026 — day 1 is a Saturday, Sundays
 * (2, 9, 16, 23, 30) are free.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  adminCalendarHandlers,
  billingHandlers,
  makeAdminCalendar,
  makeCalendarClassItem,
  makeMeResponse,
  makeMembership,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

const user = userEvent.setup();

/** jsdom lib quirk (same dodge as visao-financeira.spec): read text via cast. */
const textOf = (element: unknown) => (element as { textContent: string | null }).textContent;

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

    expect(await screen.findByRole('heading', { name: 'Agosto 2026' })).toBeInTheDocument();
    expect(screen.getByText('Todas as turmas e eventos da academia')).toBeInTheDocument();
    // 2026-08-01 is a Saturday → six leading blanks in a Sunday-first week.
    expect(screen.getAllByTestId('cal-blank')).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: /^Dia \d+$/ })).toHaveLength(31);
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
    // Events are empty in this phase — no pink dots anywhere.
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
    expect(screen.getByText('Prof. Rafael Nunes · 16 de 20')).toBeInTheDocument();
    expect(screen.getAllByText('Aula')).toHaveLength(2);
    // Sorted by start time: Kids (18:00) before Avançada (20:00).
    const rows = screen.getAllByText(/^(Kids|Avançada)$/).map(textOf);
    expect(rows).toEqual(['Kids', 'Avançada']);
    expect(screen.queryByText('Nada agendado neste dia.')).not.toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Agosto 2026' })).toBeInTheDocument();
  });
});
