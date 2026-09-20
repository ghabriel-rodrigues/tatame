/**
 * AUTH.16 — public invite flow (/convite/:token), per handoff convite-01..04:
 * branded landing (academy hero + inherited turma/plano bindings), stepped
 * signup (dados → revisão), atomic accept ending logged in, and the friendly
 * states: expired/invalid link, 409 email-exists → login-and-attach path,
 * 422 minor-requires-guardian.
 *
 * Academy branding: the landing payload's 3-color theme drives
 * derivePalette → applyBrand + a scoped MUI theme (white-label mechanics).
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ThemeProvider } from '@mui/material/styles';
import { useNavigate, useParams } from 'react-router';
import {
  ApiErrorCodes,
  isProblemCode,
  parseProblem,
  type InviteLandingResponse,
} from '@tatame/shared';
import {
  applyBrand,
  BrandLogo,
  Card,
  createTatameTheme,
  derivePalette,
  FormField,
  TatameButton,
  TATAME_DEFAULT_BRAND,
  type BrandInput,
} from '@tatame/design-system';
import { $api, apiClient } from '../api/api';
import { adoptSession, logout, useAuth } from '../auth/auth-store';
import { PhoneCanvas } from '../components/PhoneCanvas';

type Phase = 'landing' | 'dados' | 'revisao' | 'success' | 'email_exists';

interface DependentDraft {
  fullName: string;
  birthDate: string;
}

function brandFromTheme(
  theme: Record<string, unknown> | null | undefined,
): BrandInput | null {
  if (!theme) return null;
  const { deep, vibrant, accent } = theme as Record<string, unknown>;
  if (
    typeof deep === 'string' &&
    typeof vibrant === 'string' &&
    typeof accent === 'string'
  ) {
    return { deep, vibrant, accent };
  }
  return null;
}

function StepHeader({
  academyName,
  step,
  onBack,
}: {
  academyName: string;
  step: 1 | 2;
  onBack: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Stack direction="row" spacing="10px" sx={{ alignItems: 'center' }}>
        <TatameButton variant="ghost" size="sm" label="‹" onPress={onBack} />
        <Box>
          <Typography
            sx={{ fontSize: 16, fontWeight: 700, color: 'var(--fg-1)' }}
          >
            Seu cadastro
          </Typography>
          <Typography
            sx={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg-3)' }}
          >
            {academyName}
          </Typography>
        </Box>
      </Stack>
      <Box
        component="span"
        sx={{
          padding: '4px 10px',
          borderRadius: '999px',
          background: 'var(--brand-tint)',
          color: 'var(--purple-700)',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {step} de 2
      </Box>
    </Box>
  );
}

function InviteFlow({
  token,
  invite,
}: {
  token: string;
  invite: InviteLandingResponse;
}) {
  const navigate = useNavigate();
  const auth = useAuth();
  const [phase, setPhase] = useState<Phase>('landing');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    field: string;
    message: string;
  } | null>(null);

  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dependents, setDependents] = useState<DependentDraft[]>(
    invite.kind === 'guardian' ? [{ fullName: '', birthDate: '' }] : [],
  );

  const academyName = invite.academy.name;
  const isGuardian = invite.kind === 'guardian';
  const authedUser = auth.status === 'authed' ? auth.session?.user : null;

  function validateDados(): boolean {
    if (fullName.trim().length < 2) {
      setFieldError({
        field: 'fullName',
        message: 'Informe seu nome completo.',
      });
      return false;
    }
    if (!email.includes('@')) {
      setFieldError({ field: 'email', message: 'Informe um email válido.' });
      return false;
    }
    if (password.length < 8) {
      setFieldError({
        field: 'password',
        message: 'A senha precisa de pelo menos 8 caracteres.',
      });
      return false;
    }
    if (
      isGuardian &&
      dependents.some((d) => d.fullName.trim().length < 2 || !d.birthDate)
    ) {
      setError('Preencha nome e data de nascimento de cada dependente.');
      return false;
    }
    setFieldError(null);
    setError(null);
    return true;
  }

  async function submitAccept(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: apiError } = await apiClient.POST(
        '/v1/public/invites/{token}/accept',
        {
          params: { path: { token } },
          body: {
            email,
            password,
            fullName: fullName.trim(),
            ...(phone ? { phone } : {}),
            ...(birthDate ? { birthDate } : {}),
            ...(isGuardian
              ? {
                  dependents: dependents.map((d) => ({
                    fullName: d.fullName.trim(),
                    birthDate: d.birthDate,
                  })),
                }
              : {}),
          },
        },
      );
      if (data) {
        await adoptSession(data.accessToken);
        setPhase('success');
        return;
      }
      if (isProblemCode(apiError, ApiErrorCodes.INVITE_EMAIL_EXISTS)) {
        setPhase('email_exists');
        return;
      }
      if (
        isProblemCode(apiError, ApiErrorCodes.INVITE_MINOR_REQUIRES_GUARDIAN)
      ) {
        setPhase('dados');
        setFieldError({
          field: 'birthDate',
          message: 'Menores de idade devem ser cadastrados por um responsável.',
        });
        return;
      }
      if (isProblemCode(apiError, ApiErrorCodes.INVITE_INVALID_OR_EXPIRED)) {
        setError('Este convite não está mais disponível.');
        return;
      }
      const problem = parseProblem(apiError);
      setError(
        problem?.status === 422
          ? 'Confira os dados informados e tente novamente.'
          : 'Não foi possível concluir o cadastro. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** Post-login return path (409): attach the membership to the account. */
  async function acceptAsCurrentUser(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: apiError } = await apiClient.POST(
        '/v1/invites/{token}/accept',
        {
          params: { path: { token } },
        },
      );
      if (data) {
        setPhase('success');
        return;
      }
      if (isProblemCode(apiError, ApiErrorCodes.INVITE_ALREADY_MEMBER)) {
        setError('Sua conta já faz parte desta academia.');
        return;
      }
      setError(
        'Não foi possível vincular o convite à sua conta. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'success') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '14px',
          padding: '40px 28px',
          background:
            'linear-gradient(160deg, var(--purple-800) 0%, var(--purple-600) 55%, var(--pink-500, var(--purple-500)) 130%)',
          color: 'var(--white, #FFFFFF)',
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '999px',
            border: '2px solid rgba(255,255,255,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
          }}
          aria-hidden
        >
          ✓
        </Box>
        <Typography sx={{ fontSize: 22, fontWeight: 700, color: 'inherit' }}>
          Bem-vindo ao tatame
        </Typography>
        <Typography
          sx={{
            fontSize: 13.5,
            opacity: 0.85,
            color: 'inherit',
            maxWidth: 300,
          }}
        >
          Sua conta na {academyName} está pronta. Continue no aplicativo para
          treinar.
        </Typography>
        <TatameButton
          variant="secondary"
          size="lg"
          label="Continuar"
          onPress={() => navigate('/baixe-o-app', { replace: true })}
        />
      </Box>
    );
  }

  return (
    <PhoneCanvas>
      {phase === 'landing' ? (
        <Stack spacing="14px">
          <Card variant="hero" padding={22}>
            <BrandLogo size="sm" boxed label={academyName} />
            <Typography
              sx={{
                fontSize: 21,
                fontWeight: 700,
                marginTop: '14px',
                color: 'inherit',
                lineHeight: 1.3,
              }}
            >
              Você foi convidado para treinar na {academyName}
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                marginTop: '6px',
                color: 'inherit',
                opacity: 0.75,
              }}
            >
              {isGuardian
                ? 'Convite para responsável — cadastre você e seus dependentes.'
                : 'Convite de aluno enviado pela academia.'}
            </Typography>
          </Card>
          <Card>
            <Stack spacing="12px">
              <Box>
                <Typography
                  sx={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}
                >
                  {invite.classId ? 'Turma vinculada' : 'Sem turma vinculada'}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--fg-3)' }}>
                  {invite.classId
                    ? 'Você já entra matriculado na turma definida pelo convite.'
                    : 'A academia definirá sua turma após o cadastro.'}
                </Typography>
              </Box>
              <Box
                sx={{
                  borderTop: '1px solid var(--border-1)',
                  paddingTop: '12px',
                }}
              >
                <Typography
                  sx={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}
                >
                  {invite.academyPlanId ? 'Plano vinculado' : 'Plano a definir'}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--fg-3)' }}>
                  {invite.academyPlanId
                    ? 'Definido pelo convite — cancele quando quiser.'
                    : 'Definido pela academia depois do cadastro.'}
                </Typography>
              </Box>
            </Stack>
          </Card>
          {authedUser ? (
            <>
              <TatameButton
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                label={`Aceitar como ${authedUser.fullName}`}
                onPress={() => void acceptAsCurrentUser()}
              />
              <Box sx={{ textAlign: 'center' }}>
                <TatameButton
                  variant="ghost"
                  size="sm"
                  label="Usar outra conta"
                  onPress={() => {
                    void logout();
                  }}
                />
              </Box>
            </>
          ) : (
            <>
              <TatameButton
                variant="primary"
                size="lg"
                fullWidth
                label="Aceitar convite"
                onPress={() => setPhase('dados')}
              />
              <Typography
                sx={{
                  fontSize: 11.5,
                  textAlign: 'center',
                  color: 'var(--fg-4)',
                }}
              >
                Cadastro leva menos de 2 minutos.
                <br />
                Já tem conta?{' '}
                <Box
                  component="button"
                  onClick={() =>
                    navigate(
                      `/login?next=${encodeURIComponent(`/convite/${token}`)}`,
                    )
                  }
                  sx={{
                    border: 0,
                    background: 'none',
                    padding: 0,
                    color: 'var(--purple-500)',
                    fontWeight: 700,
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Entrar
                </Box>
              </Typography>
            </>
          )}
          {error ? (
            <Typography
              sx={{
                fontSize: 13,
                color: 'var(--danger-500)',
                textAlign: 'center',
              }}
            >
              {error}
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      {phase === 'dados' ? (
        <Box
          component="form"
          noValidate
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (validateDados()) setPhase('revisao');
          }}
        >
          <StepHeader
            academyName={academyName}
            step={1}
            onBack={() => setPhase('landing')}
          />
          <Stack spacing="12px" sx={{ marginTop: '22px' }}>
            <FormField
              label="Nome completo"
              name="fullName"
              placeholder="Nome completo"
              autoComplete="name"
              value={fullName}
              onChangeText={setFullName}
              error={
                fieldError?.field === 'fullName'
                  ? fieldError.message
                  : undefined
              }
            />
            <Stack direction="row" spacing="10px">
              <FormField
                label="Data de nascimento"
                name="birthDate"
                type="text"
                placeholder="AAAA-MM-DD"
                value={birthDate}
                onChangeText={setBirthDate}
                error={
                  fieldError?.field === 'birthDate'
                    ? fieldError.message
                    : undefined
                }
              />
              <FormField
                label="Telefone"
                name="phone"
                type="tel"
                placeholder="Telefone"
                autoComplete="tel"
                value={phone}
                onChangeText={setPhone}
              />
            </Stack>
            <FormField
              label="Email"
              name="email"
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              error={
                fieldError?.field === 'email' ? fieldError.message : undefined
              }
            />
            <FormField
              label="Criar senha"
              name="password"
              type="password"
              placeholder="Criar senha"
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
              error={
                fieldError?.field === 'password'
                  ? fieldError.message
                  : undefined
              }
            />

            {isGuardian ? (
              <Stack spacing="12px">
                <Typography
                  sx={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}
                >
                  Dependentes
                </Typography>
                {dependents.map((dependent, index) => (
                  <Card key={index} variant="tinted" padding={14}>
                    <Stack spacing="10px">
                      <FormField
                        label={`Nome do dependente ${index + 1}`}
                        placeholder="Nome completo"
                        value={dependent.fullName}
                        onChangeText={(value) =>
                          setDependents((list) =>
                            list.map((d, i) =>
                              i === index ? { ...d, fullName: value } : d,
                            ),
                          )
                        }
                      />
                      <FormField
                        label="Data de nascimento"
                        placeholder="AAAA-MM-DD"
                        value={dependent.birthDate}
                        onChangeText={(value) =>
                          setDependents((list) =>
                            list.map((d, i) =>
                              i === index ? { ...d, birthDate: value } : d,
                            ),
                          )
                        }
                      />
                      {dependents.length > 1 ? (
                        <TatameButton
                          variant="ghost"
                          size="sm"
                          label="Remover"
                          onPress={() =>
                            setDependents((list) =>
                              list.filter((_, i) => i !== index),
                            )
                          }
                        />
                      ) : null}
                    </Stack>
                  </Card>
                ))}
                <TatameButton
                  variant="secondary"
                  size="sm"
                  label="Adicionar dependente"
                  onPress={() =>
                    setDependents((list) => [
                      ...list,
                      { fullName: '', birthDate: '' },
                    ])
                  }
                />
              </Stack>
            ) : (
              <Card variant="tinted" padding={14}>
                <Typography sx={{ fontSize: 12, color: 'var(--fg-2)' }}>
                  Menor de 18 anos? Peça para um responsável abrir este mesmo
                  link — ele cadastra você junto.
                </Typography>
              </Card>
            )}

            {error ? (
              <Typography sx={{ fontSize: 13, color: 'var(--danger-500)' }}>
                {error}
              </Typography>
            ) : null}
            <TatameButton
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              label="Continuar"
            />
          </Stack>
        </Box>
      ) : null}

      {phase === 'revisao' ? (
        <Box>
          <StepHeader
            academyName={academyName}
            step={2}
            onBack={() => setPhase('dados')}
          />
          <Stack spacing="14px" sx={{ marginTop: '22px' }}>
            <Card>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fg-4)',
                  marginBottom: '10px',
                }}
              >
                Resumo do vínculo
              </Typography>
              <Stack spacing="8px">
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
                    Academia
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--fg-1)',
                    }}
                  >
                    {academyName}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
                    Nome
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--fg-1)',
                    }}
                  >
                    {fullName}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
                    Email
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--fg-1)',
                    }}
                  >
                    {email}
                  </Typography>
                </Box>
                {isGuardian ? (
                  <Box
                    sx={{ display: 'flex', justifyContent: 'space-between' }}
                  >
                    <Typography sx={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
                      Dependentes
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: 'var(--fg-1)',
                      }}
                    >
                      {dependents.map((d) => d.fullName).join(', ')}
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            </Card>
            {error ? (
              <Typography sx={{ fontSize: 13, color: 'var(--danger-500)' }}>
                {error}
              </Typography>
            ) : null}
            <TatameButton
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              label="Criar conta e entrar"
              onPress={() => void submitAccept()}
            />
            <Typography
              sx={{ fontSize: 10.5, textAlign: 'center', color: 'var(--fg-4)' }}
            >
              Ao continuar você concorda com os termos de uso e a política de
              privacidade da academia.
            </Typography>
          </Stack>
        </Box>
      ) : null}

      {phase === 'email_exists' ? (
        <Stack spacing="14px" sx={{ marginTop: '20px' }}>
          <BrandLogo size="md" boxed label={academyName} />
          <Typography
            sx={{ fontSize: 24, fontWeight: 700, color: 'var(--fg-1)' }}
          >
            Você já tem conta
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'var(--fg-3)' }}>
            Já existe uma conta com o email {email}. Entre para vincular o
            convite da {academyName} à sua conta.
          </Typography>
          <TatameButton
            variant="primary"
            size="lg"
            fullWidth
            label="Entrar e aceitar convite"
            onPress={() =>
              navigate(`/login?next=${encodeURIComponent(`/convite/${token}`)}`)
            }
          />
          <TatameButton
            variant="ghost"
            size="sm"
            label="Usar outro email"
            onPress={() => setPhase('dados')}
          />
        </Stack>
      ) : null}
    </PhoneCanvas>
  );
}

function InviteErrorState({ status }: { status: number | undefined }) {
  const navigate = useNavigate();
  return (
    <PhoneCanvas>
      <Stack spacing="14px" sx={{ marginTop: '20px' }}>
        <BrandLogo size="md" boxed />
        <Typography
          sx={{ fontSize: 24, fontWeight: 700, color: 'var(--fg-1)' }}
        >
          Convite indisponível
        </Typography>
        <Typography sx={{ fontSize: 14, color: 'var(--fg-3)' }}>
          {status === 410
            ? 'Este convite expirou ou já foi utilizado. Peça um novo link para a academia.'
            : 'Não encontramos este convite. Confira o link ou peça um novo para a academia.'}
        </Typography>
        <TatameButton
          variant="secondary"
          size="lg"
          fullWidth
          label="Ir para o login"
          onPress={() => navigate('/login')}
        />
      </Stack>
    </PhoneCanvas>
  );
}

export function InvitePage() {
  const { token = '' } = useParams<'token'>();
  const query = $api.useQuery(
    'get',
    '/v1/public/invites/{token}',
    { params: { path: { token } } },
    { retry: false },
  );

  const brand = useMemo(
    () => brandFromTheme(query.data?.academy.theme ?? null),
    [query.data],
  );

  // White-label: swap the Lumira CSS vars for the academy brand while the
  // invite flow is mounted; restore the Tatame default on unmount.
  useEffect(() => {
    if (!brand) return;
    applyBrand(derivePalette(brand, 'light'));
    return () => {
      applyBrand(derivePalette(TATAME_DEFAULT_BRAND, 'light'));
    };
  }, [brand]);

  const theme = useMemo(
    () =>
      brand ? createTatameTheme(derivePalette(brand, 'light'), 'light') : null,
    [brand],
  );

  if (query.isPending) {
    return (
      <PhoneCanvas>
        <Typography
          sx={{ fontSize: 14, color: 'var(--fg-3)', marginTop: '20px' }}
        >
          Carregando convite…
        </Typography>
      </PhoneCanvas>
    );
  }

  if (query.isError || !query.data) {
    const problem = parseProblem(query.error);
    return <InviteErrorState status={problem?.status} />;
  }

  const flow = <InviteFlow token={token} invite={query.data} />;
  return theme ? <ThemeProvider theme={theme}>{flow}</ThemeProvider> : flow;
}

export default InvitePage;
