/**
 * Login placeholder (rn-02 route tree: (public)/login).
 *
 * Static composition of the P0 components against the handoff visual
 * (aluno-02-login.jpg). The real screen — auth store, silent refresh,
 * invite note behavior, "Esqueci minha senha" — is AUTH.17; do NOT wire
 * auth here.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import {
  BrandLogo,
  Card,
  FormField,
  TatameButton,
  Text,
  Toast,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';

export default function LoginPlaceholder() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [toast, setToast] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: theme.space['6'] }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <BrandLogo size="md" />
          <View style={{ gap: theme.space['1'] }}>
            <Text variant="display">Bem-vindo de volta</Text>
            <Text variant="caption">Entre para acompanhar seus treinos.</Text>
          </View>
          <FormField label="Email" type="email" value={email} onChangeText={setEmail} placeholder="Email" />
          <FormField label="Senha" type="password" value={password} onChangeText={setPassword} placeholder="Senha" />
          <TatameButton fullWidth label="Entrar" onPress={() => setToast(true)} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label" color={theme.color.brand['1']}>
              Esqueci minha senha
            </Text>
            <Text variant="label" color={theme.color.fg['3']}>
              Criar conta
            </Text>
          </View>
          <Card variant="tinted" padding={theme.space['4']}>
            <Text variant="caption">
              Novo na academia? Peça ao seu professor o link de convite — seu cadastro já entra
              vinculado à turma certa.
            </Text>
          </Card>
        </Animated.View>
      </ScrollView>
      <Toast
        open={toast}
        onClose={() => setToast(false)}
        message="Login real chega com AUTH.17"
        offsetBottom={theme.space['10']}
      />
    </SafeAreaView>
  );
}
