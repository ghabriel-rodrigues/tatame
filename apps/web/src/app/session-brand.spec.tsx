/**
 * CFG.8 — session-driven branding: the theme provider derives the Lumira CSS
 * vars (and the MUI theme) from the active session's academy brand; the
 * plataforma surface and academy-null sessions stay on the default Tatame
 * brand. Asserted through the public design-system contract (the CSS custom
 * properties applyBrand writes), never internals.
 */
import { screen } from '@testing-library/react';
import {
  FIXTURE_ACADEMY,
  makeMeResponse,
  makeMembership,
  makePlatformMembership,
} from '@tatame/shared/testing';
import { derivePalette, TATAME_DEFAULT_BRAND } from '@tatame/design-system';
import { renderRoute } from '../test/render-route';

const cssVar = (name: string) =>
  document.documentElement.style.getPropertyValue(`--${name}`);

const DEFAULT_DERIVED = derivePalette(TATAME_DEFAULT_BRAND, 'light');

describe('session-driven branding (CFG.8)', () => {
  it('applies the academy brand from the session on an admin surface', async () => {
    const session = makeMeResponse({ memberships: [makeMembership({ role: 'admin' })] });
    renderRoute('/admin/em-construcao', { session });

    await screen.findByText('Em construção');

    const theme = session.academy?.theme;
    expect(theme).toBeTruthy();
    const derived = derivePalette(theme as NonNullable<typeof theme>, 'light');
    expect(cssVar('purple-700')).toBe(derived['purple-700']);
    expect(cssVar('purple-700')).not.toBe(DEFAULT_DERIVED['purple-700']);
    expect(cssVar('pink-500')).toBe(derived['pink-500']);
  });

  it('keeps the plataforma console on the default Tatame brand', async () => {
    const session = makeMeResponse({
      memberships: [makePlatformMembership()],
      academy: null,
      activeRole: 'owner',
    });
    renderRoute('/plataforma/em-construcao', { session });

    await screen.findByText('Em construção');

    expect(cssVar('purple-700')).toBe(DEFAULT_DERIVED['purple-700']);
  });

  it('uses the default brand for logged-out surfaces', async () => {
    renderRoute('/login', { session: null });

    await screen.findByText('Entrar no Tatame');

    expect(cssVar('purple-700')).toBe(DEFAULT_DERIVED['purple-700']);
  });

  it('impersonated admin sessions wear the impersonated academy brand', async () => {
    const session = makeMeResponse({ impersonated: true, memberships: [] });
    renderRoute('/admin/em-construcao', { session });

    await screen.findByText('Em construção');

    const derived = derivePalette(
      FIXTURE_ACADEMY.theme as NonNullable<typeof FIXTURE_ACADEMY.theme>,
      'light',
    );
    expect(cssVar('purple-700')).toBe(derived['purple-700']);
  });
});
