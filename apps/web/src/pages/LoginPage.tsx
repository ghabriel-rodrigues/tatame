/**
 * AUTH.12 — login page, pixel-faithful to the handoff login screens
 * (admin-01 / plataforma-01): boxed 56px BrandLogo, 26px title, 14px muted
 * subtitle, stacked fields, pill CTA with glow, centered "Esqueci minha
 * senha". One /login serves both web personas (Admin + Plataforma), so the
 * copy is surface-neutral. Extra steps beyond the handoff: platform TOTP
 * challenge and the multi-academy chooser.
 */
import { useState, type FormEvent } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ApiErrorCodes,
  isProblemCode,
  type AuthSessionResponse,
  type MembershipView,
} from '@tatame/shared';
import { BrandLogo, FormField, TatameButton } from '@tatame/design-system';
import { apiClient } from '../api/api';
import { adoptSession, switchMembership } from '../auth/auth-store';
import {
  readLastSurface,
  resolvePostLogin,
  surfaceForMembership,
  type PostLoginResolution,
} from '../auth/redirect';
import { ROLE_LABELS } from '../auth/role-labels';
import { PhoneCanvas } from '../components/PhoneCanvas';

type Step =
  | { kind: 'credentials' }
  | { kind: 'totp'; challengeToken: string }
  | { kind: 'choose'; options: MembershipView[] };

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const next = searchParams.get('next');

  async function settle(session: AuthSessionResponse): Promise<void> {
    const adopted = await adoptSession(session.accessToken);
    if (!adopted) {
      setError('Não foi possível carregar sua sessão. Tente novamente.');
      return;
    }
    const resolution: PostLoginResolution = resolvePostLogin({
      memberships: session.memberships,
      activeMembershipId: session.activeMembershipId,
      next,
      lastSurface: readLastSurface(),
    });
    if (resolution.kind === 'choose') {
      setStep({ kind: 'choose', options: resolution.options });
      return;
    }
    if (resolution.switchToMembershipId) {
      await switchMembership(resolution.switchToMembershipId);
    }
    navigate(resolution.to, { replace: true });
  }

  async function submitCredentials(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const {
        data,
        error: apiError,
        response,
      } = await apiClient.POST('/v1/auth/login', {
        body: { email, password, transport: 'cookie' },
      });
      if (data) {
        if ('mfaRequired' in data) {
          setStep({ kind: 'totp', challengeToken: data.challengeToken });
          return;
        }
        await settle(data);
        return;
      }
      if (isProblemCode(apiError, ApiErrorCodes.AUTH_INVALID_CREDENTIALS)) {
        setError('Email ou senha inválidos.');
      } else if (response.status === 422) {
        setError('Preencha email e senha para entrar.');
      } else {
        setError('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTotp(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (step.kind !== 'totp') return;
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: apiError } = await apiClient.POST(
        '/v1/auth/login/totp',
        {
          body: {
            challengeToken: step.challengeToken,
            code: totpCode,
            transport: 'cookie',
          },
        },
      );
      if (data) {
        await settle(data);
        return;
      }
      if (isProblemCode(apiError, ApiErrorCodes.AUTH_MFA_INVALID_CODE)) {
        setError('Código inválido. Tente novamente.');
      } else if (isProblemCode(apiError, ApiErrorCodes.AUTH_MFA_REQUIRED)) {
        setError('Sessão de verificação expirada. Entre novamente.');
        setStep({ kind: 'credentials' });
      } else {
        setError('Não foi possível confirmar o código. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function chooseMembership(membership: MembershipView): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await switchMembership(membership.id);
      navigate(surfaceForMembership(membership), { replace: true });
    } catch {
      setError('Não foi possível trocar de academia. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PhoneCanvas>
      <BrandLogo size="md" boxed />

      {step.kind === 'credentials' ? (
        <Box component="form" onSubmit={submitCredentials} noValidate>
          <Typography
            variant="h3"
            sx={{
              fontSize: 26,
              fontWeight: 700,
              marginTop: '20px',
              color: 'var(--fg-1)',
            }}
          >
            Entrar no Tatame
          </Typography>
          <Typography
            sx={{ fontSize: 14, marginTop: '6px', color: 'var(--fg-3)' }}
          >
            Acesso restrito à administração e à equipe da plataforma.
          </Typography>
          <Stack spacing="12px" sx={{ marginTop: '28px' }}>
            <FormField
              label="Email"
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <FormField
              label="Senha"
              type="password"
              name="password"
              placeholder="Senha"
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
              error={error ?? undefined}
            />
            <Box sx={{ marginTop: '6px' }}>
              <TatameButton
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                label="Entrar"
              />
            </Box>
          </Stack>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: '18px',
            }}
          >
            <TatameButton
              variant="ghost"
              size="sm"
              label="Esqueci minha senha"
              onPress={() => navigate('/esqueci-senha')}
            />
          </Box>
        </Box>
      ) : null}

      {step.kind === 'totp' ? (
        <Box component="form" onSubmit={submitTotp} noValidate>
          <Typography
            variant="h3"
            sx={{
              fontSize: 26,
              fontWeight: 700,
              marginTop: '20px',
              color: 'var(--fg-1)',
            }}
          >
            Verificação em duas etapas
          </Typography>
          <Typography
            sx={{ fontSize: 14, marginTop: '6px', color: 'var(--fg-3)' }}
          >
            Informe o código do seu aplicativo autenticador.
          </Typography>
          <Stack spacing="12px" sx={{ marginTop: '28px' }}>
            <FormField
              label="Código"
              name="totp"
              placeholder="000000"
              autoComplete="one-time-code"
              value={totpCode}
              onChangeText={setTotpCode}
              error={error ?? undefined}
            />
            <Box sx={{ marginTop: '6px' }}>
              <TatameButton
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                label="Confirmar"
              />
            </Box>
            <TatameButton
              variant="ghost"
              size="sm"
              label="Voltar ao login"
              onPress={() => {
                setError(null);
                setStep({ kind: 'credentials' });
              }}
            />
          </Stack>
        </Box>
      ) : null}

      {step.kind === 'choose' ? (
        <Box>
          <Typography
            variant="h3"
            sx={{
              fontSize: 26,
              fontWeight: 700,
              marginTop: '20px',
              color: 'var(--fg-1)',
            }}
          >
            Escolha a academia
          </Typography>
          <Typography
            sx={{ fontSize: 14, marginTop: '6px', color: 'var(--fg-3)' }}
          >
            Sua conta administra mais de uma academia.
          </Typography>
          <Stack spacing="12px" sx={{ marginTop: '28px' }}>
            {step.options.map((membership) => (
              <TatameButton
                key={membership.id}
                variant="secondary"
                size="lg"
                fullWidth
                disabled={submitting}
                onPress={() => void chooseMembership(membership)}
              >
                {membership.academyName ?? 'Plataforma'} ·{' '}
                {ROLE_LABELS[membership.role]}
              </TatameButton>
            ))}
          </Stack>
          {error ? (
            <Typography
              sx={{
                fontSize: 13,
                marginTop: '12px',
                color: 'var(--danger-500)',
              }}
            >
              {error}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </PhoneCanvas>
  );
}

export default LoginPage;
