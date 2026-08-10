/**
 * AUTH.15 — authenticated console scaffold shared by /admin and /plataforma:
 * top bar (academy/platform identity + role pill), membership switcher
 * (via /v1/auth/switch), logout, and — admin surface — the non-dismissible
 * impersonation banner with "Encerrar". Content area is the route Outlet.
 */
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet, useNavigate } from 'react-router';
import type { MeResponse, MembershipView } from '@tatame/shared';
import { BrandLogo, Card, TatameButton } from '@tatame/design-system';
import {
  endImpersonation,
  logout,
  switchMembership,
  useAuth,
} from '../auth/auth-store';
import { surfaceForMembership, writeLastSurface, type WebSurface } from '../auth/redirect';
import { ROLE_LABELS } from '../auth/role-labels';
import { BootSplash } from '../auth/guards';

function ImpersonationBanner({ session }: { session: MeResponse }) {
  const navigate = useNavigate();
  const [ending, setEnding] = useState(false);
  const academyName = session.academy?.name ?? 'academia';

  return (
    <Box
      role="alert"
      sx={{
        background: 'var(--purple-950)',
        color: 'var(--white, #FFFFFF)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'inherit' }}>
        Você está como admin de {academyName} — sessão auditada.
      </Typography>
      <TatameButton
        variant="secondary"
        size="sm"
        loading={ending}
        label="Encerrar"
        onPress={() => {
          setEnding(true);
          void endImpersonation()
            .then((state) => {
              navigate(state.status === 'authed' ? '/plataforma' : '/login', { replace: true });
            })
            .finally(() => setEnding(false));
        }}
      />
    </Box>
  );
}

function MembershipSwitcher({
  session,
  disabled,
  onSwitch,
}: {
  session: MeResponse;
  disabled: boolean;
  onSwitch: (membership: MembershipView) => void;
}) {
  const current = session.activeMembershipId ?? '';

  function label(membership: MembershipView): string {
    const place = membership.type === 'platform' ? 'Plataforma' : (membership.academyName ?? '');
    return `${place} · ${ROLE_LABELS[membership.role]}`;
  }

  return (
    <Select
      size="small"
      value={current}
      disabled={disabled}
      inputProps={{ 'aria-label': 'Trocar de contexto' }}
      onChange={(event: SelectChangeEvent) => {
        const membership = session.memberships.find((m) => m.id === event.target.value);
        if (membership && membership.id !== session.activeMembershipId) onSwitch(membership);
      }}
      sx={{ minWidth: 220, background: 'var(--bg-surface)' }}
    >
      {session.memberships.map((membership) => (
        <MenuItem key={membership.id} value={membership.id}>
          {label(membership)}
        </MenuItem>
      ))}
    </Select>
  );
}

export interface ConsoleShellProps {
  surface: WebSurface;
}

export function ConsoleShell({ surface }: ConsoleShellProps) {
  const navigate = useNavigate();
  const { status, session } = useAuth();
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    writeLastSurface(surface);
  }, [surface]);

  if (status === 'booting') return <BootSplash />;
  if (!session) return null; // Guard already redirects; render nothing mid-transition.

  const impersonated = session.impersonation.isImpersonated;
  const title =
    surface === '/admin'
      ? (session.academy?.name ?? 'Painel da academia')
      : 'Console da plataforma';

  function handleSwitch(membership: MembershipView): void {
    setSwitching(true);
    void switchMembership(membership.id)
      .then(() => navigate(surfaceForMembership(membership), { replace: true }))
      .finally(() => setSwitching(false));
  }

  return (
    <Box sx={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      {surface === '/admin' && impersonated ? <ImpersonationBanner session={session} /> : null}
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          padding: '14px 20px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-1)',
        }}
      >
        <Stack direction="row" spacing="14px" sx={{ alignItems: 'center' }}>
          <BrandLogo size="sm" boxed />
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: 'var(--fg-1)' }}>
              {title}
            </Typography>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-3)' }}>
              {session.user.fullName}
            </Typography>
          </Box>
          <Box
            component="span"
            sx={{
              padding: '5px 11px',
              borderRadius: '999px',
              background: 'var(--purple-950)',
              color: 'var(--white, #FFFFFF)',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {ROLE_LABELS[session.activeRole]}
          </Box>
        </Stack>
        <Stack direction="row" spacing="10px" sx={{ alignItems: 'center' }}>
          {session.memberships.length > 1 && !impersonated ? (
            <MembershipSwitcher session={session} disabled={switching} onSwitch={handleSwitch} />
          ) : null}
          <TatameButton
            variant="ghost"
            size="sm"
            label="Sair"
            onPress={() => {
              void logout().then(() => navigate('/login', { replace: true }));
            }}
          />
        </Stack>
      </Box>
      {surface === '/admin' ? (
        <Box
          component="nav"
          aria-label="Seções do painel"
          sx={{
            display: 'flex',
            gap: '18px',
            padding: '10px 20px',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-1)',
            '& a': {
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--fg-3)',
              textDecoration: 'none',
            },
            '& a.active': { color: 'var(--brand-1)' },
          }}
        >
          <NavLink to="/admin" end>
            Início
          </NavLink>
          <NavLink to="/admin/cadastros">Cadastros</NavLink>
          <NavLink to="/admin/calendario">Calendário</NavLink>
          <NavLink to="/admin/eventos">Eventos</NavLink>
          <NavLink to="/admin/graduacao">Graduação</NavLink>
          <NavLink to="/admin/loja">Loja</NavLink>
          <NavLink to="/admin/planos">Planos</NavLink>
        </Box>
      ) : null}
      <Box component="main" sx={{ padding: '24px 20px', maxWidth: 1080, margin: '0 auto' }}>
        <Outlet />
      </Box>
    </Box>
  );
}

/** Empty content placeholder — the persona modules land in later slices. */
export function UnderConstruction({ surfaceLabel }: { surfaceLabel: string }) {
  return (
    <Stack spacing="14px">
      <Card variant="hero">
        <Typography variant="overline" sx={{ color: 'inherit', opacity: 0.8 }}>
          {surfaceLabel}
        </Typography>
        <Typography sx={{ fontSize: 24, fontWeight: 700, marginTop: '4px', color: 'inherit' }}>
          Em construção
        </Typography>
      </Card>
      <Card variant="tinted">
        <Typography sx={{ fontSize: 13.5, color: 'var(--fg-2)' }}>
          Os módulos desta área chegam nas próximas iterações. Sua sessão, permissões e
          contexto de academia já estão ativos.
        </Typography>
      </Card>
    </Stack>
  );
}

export default ConsoleShell;
