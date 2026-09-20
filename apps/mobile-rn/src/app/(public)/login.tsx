/**
 * Login (AUTH.17) — pixel-faithful to the handoff (aluno-02-login): top
 * gradient wash (purple-50 -> bg-app 40%), boxed 56px BrandLogo, 26px
 * title, stacked fields, gradient pill CTA with glow, "Esqueci minha
 * senha" / "Criar conta" row and the invite-notice tinted card.
 *
 * Wired to the real API via the shared client with `body` transport
 * (rn-04): success persists the refresh token in the TokenStore, adopts the
 * access token and bootstraps `/auth/me` — the role gate then lands the
 * user in their shell. Extra steps beyond the handoff frame: the
 * multi-membership chooser, and the platform-staff TOTP challenge which on
 * mobile renders a "use o console web" notice (platform roles are web-only
 * personas — no TOTP UI in the app).
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { QrCode } from 'lucide-react-native';
import {
  ApiErrorCodes,
  isProblemCode,
  type AuthSessionResponse,
  type MembershipView,
} from '@tatame/shared';
import {
  BrandLogo,
  Card,
  FormField,
  TatameButton,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { apiClient } from '../../session/api';
import { ROLE_LABELS } from '../../session/role-labels';
import { adoptSession, switchMembership } from '../../session/session-store';
import { setAccessToken } from '../../session/token';
import { setRefreshToken } from '../../session/token-store';

type Step =
  | { kind: 'credentials' }
  | { kind: 'choose'; options: MembershipView[]; session: AuthSessionResponse }
  | { kind: 'console-redirect' };

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function settle(session: AuthSessionResponse): Promise<void> {
    if (session.memberships.length > 1) {
      // Hold the tokens without flipping the gate: the chooser must render
      // before the authed state unmounts the login screen.
      if (session.refreshToken) await setRefreshToken(session.refreshToken);
      setAccessToken(session.accessToken);
      setStep({ kind: 'choose', options: session.memberships, session });
      return;
    }
    const adopted = await adoptSession(
      session.accessToken,
      session.refreshToken,
    );
    if (!adopted)
      setError('Não foi possível carregar sua sessão. Tente novamente.');
  }

  async function submitCredentials(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const {
        data,
        error: apiError,
        response,
      } = await apiClient.POST('/v1/auth/login', {
        body: { email: email.trim(), password, transport: 'body' },
      });
      if (data) {
        if ('mfaRequired' in data) {
          // TOTP-enabled accounts are platform staff — a web-only persona.
          setStep({ kind: 'console-redirect' });
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
    } catch {
      setError('Sem conexão. Verifique sua internet e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function chooseMembership(
    step: Extract<Step, { kind: 'choose' }>,
    membership: MembershipView,
  ): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      if (membership.id === step.session.activeMembershipId) {
        const adopted = await adoptSession(step.session.accessToken);
        if (!adopted)
          setError('Não foi possível carregar sua sessão. Tente novamente.');
        return;
      }
      await switchMembership(membership.id);
    } catch {
      setError('Não foi possível entrar nessa academia. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Handoff: linear-gradient(180deg, purple-50 0%, bg-app 40%). */}
      <LinearGradient
        colors={[theme.color.purple['50'], theme.color.bg.app]}
        locations={[0, 0.4]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 96,
          paddingHorizontal: 28,
          paddingBottom: theme.space['8'],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={fadeUp()}>
          <BrandLogo size="md" boxed />

          {step.kind === 'credentials' ? (
            <View>
              <Text variant="display" style={{ fontSize: 26, marginTop: 20 }}>
                Bem-vindo de volta
              </Text>
              <Text
                variant="body"
                color={theme.color.fg['3']}
                style={{ marginTop: 6 }}
              >
                Entre para acompanhar seus treinos.
              </Text>
              <View style={{ gap: 12, marginTop: 28 }}>
                <FormField
                  label="Email"
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                />
                <FormField
                  label="Senha"
                  type="password"
                  placeholder="Senha"
                  autoComplete="current-password"
                  value={password}
                  onChangeText={setPassword}
                  error={error ?? undefined}
                />
                <TatameButton
                  fullWidth
                  size="lg"
                  label="Entrar"
                  loading={submitting}
                  style={{ marginTop: 6 }}
                  onPress={() => void submitCredentials()}
                />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 18,
                }}
              >
                <TatameButton
                  variant="ghost"
                  size="sm"
                  label="Esqueci minha senha"
                  onPress={() => router.push('/forgot-password')}
                />
                <Text
                  variant="label"
                  color={theme.color.fg['3']}
                  style={{ padding: 4 }}
                >
                  Criar conta
                </Text>
              </View>
              <Card
                variant="tinted"
                padding={theme.space['4']}
                style={{ marginTop: 48 }}
                testID="invite-notice"
              >
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <QrCode
                    size={18}
                    color={theme.color.purple['500']}
                    style={{ marginTop: 1 }}
                  />
                  <Text variant="caption" style={{ flex: 1, lineHeight: 18 }}>
                    Novo na academia? Peça ao seu professor o{' '}
                    <Text
                      variant="caption"
                      weight="bold"
                      color={theme.color.fg['2']}
                    >
                      link de convite
                    </Text>{' '}
                    — seu cadastro já entra vinculado à turma certa.
                  </Text>
                </View>
              </Card>
            </View>
          ) : null}

          {step.kind === 'choose' ? (
            <View>
              <Text variant="display" style={{ fontSize: 26, marginTop: 20 }}>
                Escolha seu perfil
              </Text>
              <Text
                variant="body"
                color={theme.color.fg['3']}
                style={{ marginTop: 6 }}
              >
                Sua conta tem mais de um vínculo. Onde você quer entrar?
              </Text>
              <View style={{ gap: 12, marginTop: 28 }}>
                {step.options.map((membership) => (
                  <TatameButton
                    key={membership.id}
                    fullWidth
                    variant="secondary"
                    size="lg"
                    disabled={submitting}
                    onPress={() => void chooseMembership(step, membership)}
                  >
                    {membership.academyName ?? 'Plataforma'} ·{' '}
                    {ROLE_LABELS[membership.role]}
                  </TatameButton>
                ))}
              </View>
              {error ? (
                <Text
                  variant="caption"
                  color={theme.color.danger['500']}
                  style={{ marginTop: 12 }}
                >
                  {error}
                </Text>
              ) : null}
            </View>
          ) : null}

          {step.kind === 'console-redirect' ? (
            <View>
              <Text variant="display" style={{ fontSize: 26, marginTop: 20 }}>
                Use o console web
              </Text>
              <Text
                variant="body"
                color={theme.color.fg['3']}
                style={{ marginTop: 6 }}
              >
                Sua conta faz parte da equipe da plataforma e usa verificação em
                duas etapas. Entre pelo console web do Tatame no navegador.
              </Text>
              <TatameButton
                fullWidth
                variant="secondary"
                size="lg"
                label="Voltar ao login"
                style={{ marginTop: 28 }}
                onPress={() => {
                  setError(null);
                  setStep({ kind: 'credentials' });
                }}
              />
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}
