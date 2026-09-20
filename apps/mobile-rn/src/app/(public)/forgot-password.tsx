/**
 * "Esqueci minha senha" (AUTH.17) — the handoff stub, wired to
 * POST /v1/auth/password/forgot (202 always — no enumeration): the
 * acknowledgment copy is identical whether or not the email exists.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    setSubmitting(true);
    try {
      await apiClient.POST('/v1/auth/password/forgot', {
        body: { email: email.trim() },
      });
    } catch {
      // 202-always semantics: the acknowledgment never leaks failures.
    } finally {
      setSent(true);
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
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
          <Text variant="display" style={{ fontSize: 26, marginTop: 20 }}>
            Esqueci minha senha
          </Text>
          <Text
            variant="body"
            color={theme.color.fg['3']}
            style={{ marginTop: 6 }}
          >
            Informe seu email e enviaremos as instruções de redefinição.
          </Text>

          {sent ? (
            <Card
              variant="tinted"
              padding={theme.space['4']}
              style={{ marginTop: 28 }}
            >
              <Text variant="caption">
                Se o email estiver cadastrado, você receberá em instantes um
                link para redefinir a senha. Confira também a caixa de spam.
              </Text>
            </Card>
          ) : (
            <View style={{ gap: 12, marginTop: 28 }}>
              <FormField
                label="Email"
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <TatameButton
                fullWidth
                size="lg"
                label="Enviar instruções"
                loading={submitting}
                style={{ marginTop: 6 }}
                onPress={() => void submit()}
              />
            </View>
          )}

          <View style={{ alignItems: 'center', marginTop: 18 }}>
            <TatameButton
              variant="ghost"
              size="sm"
              label="Voltar ao login"
              onPress={() => router.back()}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
