/**
 * Temporary dev entry (DS.7): links to the login placeholder and the DS
 * showcase. Replaced by the session gate (splash -> silent refresh ->
 * role-scoped shell) in AUTH.17 (rn-04).
 */

import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BrandLogo, Card, TatameButton, Text, useTheme } from '@tatame/design-system/native';

export default function DevEntry() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.space['5'], gap: theme.space['4'] }}>
        <BrandLogo size="md" />
        <Text variant="display">Tatame</Text>
        <Text variant="body">Dev entry — substituída pelo gate de sessão (AUTH.17).</Text>
        <Card>
          <View style={{ gap: theme.space['3'] }}>
            <TatameButton fullWidth label="Login (placeholder)" onPress={() => router.push('/login')} />
            <TatameButton
              fullWidth
              variant="secondary"
              label="DS showcase (P0)"
              onPress={() => router.push('/ds-showcase')}
            />
          </View>
        </Card>
      </View>
    </SafeAreaView>
  );
}
