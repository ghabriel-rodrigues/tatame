/**
 * Route guards (web-02/04). UX only — real RBAC is the NestJS guard chain.
 * Guards read the auth store synchronously (session bootstrapped before any
 * guarded render) and never fetch per-navigation.
 */
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { MeResponse } from '@tatame/shared';
import { BrandLogo } from '@tatame/design-system';
import { useAuth } from './auth-store';

/** Splash shown while `booting` — guards never run against an unknown session. */
export function BootSplash() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        background:
          'linear-gradient(180deg, var(--purple-50) 0%, var(--bg-app) 40%)',
      }}
      data-testid="boot-splash"
    >
      <BrandLogo size="lg" boxed />
      <CircularProgress size={22} />
    </Box>
  );
}

function hasPlatformMembership(session: MeResponse): boolean {
  return session.memberships.some((m) => m.type === 'platform');
}

function hasAdminMembership(session: MeResponse): boolean {
  return session.memberships.some(
    (m) => m.type === 'academy' && m.role === 'admin',
  );
}

/** The surface this session belongs on (guards + root redirect target). */
export function homeSurface(session: MeResponse): string {
  if (session.impersonation.isImpersonated) return '/admin';
  if (hasPlatformMembership(session)) return '/plataforma';
  if (hasAdminMembership(session)) return '/admin';
  return '/baixe-o-app';
}

export interface RequireSurfaceProps {
  surface: 'admin' | 'plataforma';
}

export function RequireSurface({ surface }: RequireSurfaceProps) {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'booting') return <BootSplash />;
  if (status !== 'authed' || !session) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const impersonated = session.impersonation.isImpersonated;
  if (surface === 'admin' && !(hasAdminMembership(session) || impersonated)) {
    return <Navigate to={homeSurface(session)} replace />;
  }
  if (surface === 'plataforma') {
    // Impersonation does NOT grant plataforma — "Encerrar" returns there.
    if (impersonated) return <Navigate to="/admin" replace />;
    if (!hasPlatformMembership(session))
      return <Navigate to={homeSurface(session)} replace />;
  }
  return <Outlet />;
}

/** "/" — land the session where it belongs (or the login screen). */
export function RootRedirect() {
  const { status, session } = useAuth();
  if (status === 'booting') return <BootSplash />;
  if (status !== 'authed' || !session) return <Navigate to="/login" replace />;
  return <Navigate to={homeSurface(session)} replace />;
}
