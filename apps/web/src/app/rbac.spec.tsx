/**
 * RBAC/persona boundary suite (web-07 §3 — mandatory per guarded surface).
 * Guards are UX only; these tests pin the redirect contract for /admin and
 * /plataforma plus the impersonation banner rendering.
 */
import { screen } from '@testing-library/react';
import {
  makeMeResponse,
  makeMembership,
  makePlatformMembership,
} from '@tatame/shared/testing';
import { renderRoute } from '../test/render-route';

describe('route guards — /admin', () => {
  it('redirects anonymous users to /login preserving ?next=', () => {
    const { router } = renderRoute('/admin');
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/admin')}`);
  });

  it('renders the boot splash while the session is booting', () => {
    renderRoute('/admin', { session: 'booting' });
    expect(screen.getByTestId('boot-splash')).toBeInTheDocument();
  });

  it('renders the admin shell for an admin membership', async () => {
    const admin = makeMembership({ role: 'admin' });
    renderRoute('/admin', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    expect(await screen.findByText('Em construção')).toBeInTheDocument();
    expect(screen.getByText('Alpha Jiu-Jitsu')).toBeInTheDocument();
    expect(screen.getByText('Sair')).toBeInTheDocument();
  });

  it('redirects platform-only staff to /plataforma', () => {
    const platform = makePlatformMembership();
    const { router } = renderRoute('/admin', {
      session: makeMeResponse({ memberships: [platform], academy: null }),
    });
    expect(router.state.location.pathname).toBe('/plataforma');
  });

  it('redirects mobile-only personas to /baixe-o-app', () => {
    const student = makeMembership({ role: 'student' });
    const { router } = renderRoute('/admin', {
      session: makeMeResponse({ memberships: [student] }),
    });
    expect(router.state.location.pathname).toBe('/baixe-o-app');
  });

  it('blocks a professor from the admin registry surface (ENR RBAC)', () => {
    const professor = makeMembership({ role: 'professor' });
    const { router } = renderRoute('/admin/cadastros', {
      session: makeMeResponse({ memberships: [professor] }),
    });
    expect(router.state.location.pathname).toBe('/baixe-o-app');
  });

  it('renders the non-dismissible impersonation banner for an impersonated session', async () => {
    const platform = makePlatformMembership();
    renderRoute('/admin', {
      session: makeMeResponse({
        memberships: [platform],
        impersonated: true,
        activeRole: 'admin',
      }),
    });
    expect(
      await screen.findByText(/Você está como admin de Alpha Jiu-Jitsu — sessão auditada/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Encerrar' })).toBeInTheDocument();
  });
});

describe('route guards — /plataforma', () => {
  it('redirects anonymous users to /login preserving ?next=', () => {
    const { router } = renderRoute('/plataforma');
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/plataforma')}`);
  });

  it('renders the platform console for platform staff', async () => {
    const platform = makePlatformMembership();
    renderRoute('/plataforma', {
      session: makeMeResponse({ memberships: [platform], academy: null }),
    });
    expect(await screen.findByText('Console da plataforma')).toBeInTheDocument();
    expect(screen.getByText('Em construção')).toBeInTheDocument();
  });

  it('redirects academy admins to /admin', () => {
    const admin = makeMembership({ role: 'admin' });
    const { router } = renderRoute('/plataforma', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    expect(router.state.location.pathname).toBe('/admin');
  });

  it('denies impersonated sessions (impersonation does not grant plataforma)', () => {
    const platform = makePlatformMembership();
    const { router } = renderRoute('/plataforma', {
      session: makeMeResponse({
        memberships: [platform],
        impersonated: true,
        activeRole: 'admin',
      }),
    });
    expect(router.state.location.pathname).toBe('/admin');
  });
});

describe('root redirect', () => {
  it('sends anonymous visitors to /login', () => {
    const { router } = renderRoute('/');
    expect(router.state.location.pathname).toBe('/login');
  });

  it('lands an authed admin on /admin', () => {
    const admin = makeMembership({ role: 'admin' });
    const { router } = renderRoute('/', {
      session: makeMeResponse({ memberships: [admin] }),
    });
    expect(router.state.location.pathname).toBe('/admin');
  });
});
