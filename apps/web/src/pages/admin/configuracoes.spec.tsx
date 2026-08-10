/**
 * CFG.9/CFG.10 — Configurações hub (admin-15): identidade card with the 4
 * preset swatches (live preview on select, Salvar persists, Cancelar reverts
 * to the saved/session brand), the toggle block (Tema escuro real +
 * persisted, Notificações automáticas wired to PUT /admin/academy,
 * geolocalização disabled stub) and the entry rows. Real routes + real
 * client against MSW (web-07).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  adminConfigHandlers,
  http,
  makeMeResponse,
  makeMembership,
  problemResponse,
} from '@tatame/shared/testing';
import {
  derivePalette,
  READY_MADE_PALETTES,
  TATAME_DEFAULT_BRAND,
} from '@tatame/design-system';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';
import { THEME_MODE_STORAGE_KEY, resetThemeState } from '../../app/theme-store';

const session = () => makeMeResponse({ memberships: [makeMembership({ role: 'admin' })] });

const cssVar = (name: string) =>
  document.documentElement.style.getPropertyValue(`--${name}`);

describe('Configurações hub (CFG.9)', () => {
  it('renders the identidade card, swatches, toggles and entry rows per admin-15', async () => {
    server.use(...adminConfigHandlers());
    renderRoute('/admin/configuracoes', { session: session() });

    expect(
      await screen.findByRole('heading', { name: 'Configurações' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Identidade, tema e permissões da academia.'),
    ).toBeInTheDocument();

    // Identidade visual: monogram + name field + disabled Logo (upload = debt).
    expect(screen.getByText('Identidade visual')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome da academia/)).toHaveValue('Alpha Jiu-Jitsu');
    expect(screen.getByText('AJ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logo' })).toBeDisabled();

    // The 4 preset swatches — brand null selects Lumira (null IS the default).
    expect(screen.getByRole('button', { name: 'Lumira' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const name of ['Oceano', 'Mata', 'Ouro']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }

    // Toggles: dark off, notificações on, geolocalização honestly disabled.
    expect(screen.getByLabelText('Tema escuro')).not.toBeChecked();
    expect(screen.getByLabelText('Notificações automáticas')).toBeChecked();
    expect(screen.getByLabelText('Check-in por geolocalização')).toBeDisabled();

    // Entry rows.
    expect(screen.getByRole('button', { name: 'Permissões por perfil' })).toBeInTheDocument();
    expect(screen.getByText('Integrações de pagamento')).toBeInTheDocument();
    expect(screen.getByText('Pix ativo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planos de mensalidade' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regras de graduação' })).toBeInTheDocument();
  });

  it('live-previews a selected palette and persists it with Salvar', async () => {
    server.use(...adminConfigHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('/v1/admin/academy', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(200).json({
          id: '018f0000-0000-7000-8000-00000000a1fa',
          name: 'Alpha Jiu-Jitsu',
          slug: 'alpha-jj',
          logoUrl: null,
          brand: READY_MADE_PALETTES.navy,
          autoNotificationsEnabled: true,
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/configuracoes', { session: session() });
    await screen.findByRole('heading', { name: 'Configurações' });

    // Live preview (story 5): the console re-themes before saving.
    await user.click(screen.getByRole('button', { name: 'Oceano' }));
    const oceano = derivePalette(READY_MADE_PALETTES.navy, 'light');
    expect(cssVar('purple-700')).toBe(oceano['purple-700']);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Identidade salva.')).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Alpha Jiu-Jitsu',
      brand: READY_MADE_PALETTES.navy,
      autoNotificationsEnabled: true,
    });
    // Session academy patched: the console stays on the saved brand.
    expect(cssVar('purple-700')).toBe(oceano['purple-700']);
  });

  it('Cancelar reverts the live preview to the session brand', async () => {
    server.use(...adminConfigHandlers());
    const user = userEvent.setup();
    const me = session();
    renderRoute('/admin/configuracoes', { session: me });
    await screen.findByRole('heading', { name: 'Configurações' });

    const sessionDerived = derivePalette(
      me.academy?.theme as NonNullable<NonNullable<typeof me.academy>['theme']>,
      'light',
    );
    expect(cssVar('purple-700')).toBe(sessionDerived['purple-700']);

    await user.click(screen.getByRole('button', { name: 'Mata' }));
    expect(cssVar('purple-700')).toBe(
      derivePalette(READY_MADE_PALETTES.verde, 'light')['purple-700'],
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cssVar('purple-700')).toBe(sessionDerived['purple-700']);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('saves the edited academy name keeping the saved (null) brand', async () => {
    server.use(...adminConfigHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('/v1/admin/academy', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(200).json({
          id: '018f0000-0000-7000-8000-00000000a1fa',
          name: 'Horizonte BJJ',
          slug: 'alpha-jj',
          logoUrl: null,
          brand: null,
          autoNotificationsEnabled: true,
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/configuracoes', { session: session() });
    await screen.findByRole('heading', { name: 'Configurações' });

    const nameField = screen.getByLabelText(/Nome da academia/);
    await user.clear(nameField);
    await user.type(nameField, 'Horizonte BJJ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Identidade salva.')).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Horizonte BJJ',
      brand: null,
      autoNotificationsEnabled: true,
    });
  });

  it('wires the Notificações automáticas toggle to PUT /admin/academy', async () => {
    server.use(...adminConfigHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('/v1/admin/academy', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(200).json({
          id: '018f0000-0000-7000-8000-00000000a1fa',
          name: 'Alpha Jiu-Jitsu',
          slug: 'alpha-jj',
          logoUrl: null,
          brand: null,
          autoNotificationsEnabled: false,
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/configuracoes', { session: session() });
    await screen.findByRole('heading', { name: 'Configurações' });

    await user.click(screen.getByLabelText('Notificações automáticas'));

    expect(screen.getByLabelText('Notificações automáticas')).not.toBeChecked();
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      name: 'Alpha Jiu-Jitsu',
      brand: null,
      autoNotificationsEnabled: false,
    });
  });

  it('rolls the Notificações automáticas switch back when the PUT fails', async () => {
    server.use(...adminConfigHandlers());
    server.use(
      http.put('/v1/admin/academy', ({ response }) =>
        response.untyped(problemResponse(500, 'internal')),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/admin/configuracoes', { session: session() });
    await screen.findByRole('heading', { name: 'Configurações' });

    await user.click(screen.getByLabelText('Notificações automáticas'));

    expect(
      await screen.findByText('Não foi possível salvar. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Notificações automáticas')).toBeChecked();
  });

  it('navigates to Permissões por perfil from the entry row', async () => {
    server.use(...adminConfigHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/configuracoes', { session: session() });
    await screen.findByRole('heading', { name: 'Configurações' });

    await user.click(screen.getByRole('button', { name: 'Permissões por perfil' }));

    expect(
      await screen.findByRole('heading', { name: 'Permissões por perfil' }),
    ).toBeInTheDocument();
  });
});

describe('Console dark theme (CFG.10)', () => {
  it('flips data-theme, keeps the brand, and persists the preference', async () => {
    server.use(...adminConfigHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/configuracoes', { session: session() });
    await screen.findByRole('heading', { name: 'Configurações' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    await user.click(screen.getByLabelText('Tema escuro'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('dark');
    expect(screen.getByLabelText('Tema escuro')).toBeChecked();

    // Dark mode is still the academy's app: brand overlay re-derived dark.
    const me = session();
    const darkDerived = derivePalette(
      me.academy?.theme ?? TATAME_DEFAULT_BRAND,
      'dark',
    );
    expect(cssVar('purple-700')).toBe(darkDerived['purple-700']);

    await user.click(screen.getByLabelText('Tema escuro'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('light');
  });

  it('restores the persisted dark preference on a fresh mount', async () => {
    server.use(...adminConfigHandlers());
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark');
    resetThemeState(); // Fresh store boot, as a new page load would do.

    renderRoute('/admin/configuracoes', { session: session() });
    await screen.findByRole('heading', { name: 'Configurações' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByLabelText('Tema escuro')).toBeChecked();
  });
});
