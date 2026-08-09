/**
 * ProfileScreen (AUTH.20): perfil tab shared by the three persona shells —
 * session identity in a DS Card plus the "Sair" action (AUTH.18 logout:
 * best-effort revoke, secure-store wipe, queryClient.clear(), back to
 * login via the role gate flip).
 */

import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Card, TatameButton, Text, fadeUp, useTheme } from '@tatame/design-system/native';
import { ROLE_LABELS } from '../session/role-labels';
import { logout, useSession } from '../session/session-store';

export interface ProfileScreenProps {
  /** Persona sections rendered between the identity card and "Sair"
   *  (aluno belt chip, professor graduações válidas — GRD.16/17). */
  children?: ReactNode;
  /** Extra content inside the identity card, under the role line. */
  identityExtra?: ReactNode;
}

export function ProfileScreen({ children, identityExtra }: ProfileScreenProps) {
  const theme = useTheme();
  const { session } = useSession();
  const [leaving, setLeaving] = useState(false);
  if (!session) return null;

  async function onLogout(): Promise<void> {
    setLeaving(true);
    // logout() always completes locally; the anon state unmounts this shell.
    await logout();
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <Text variant="display">Perfil</Text>
          <Card>
            <View style={{ gap: 4 }}>
              <Text variant="subtitle">{session.user.fullName}</Text>
              <Text variant="caption">{session.user.email}</Text>
              <Text variant="caption">
                {ROLE_LABELS[session.activeRole]}
                {session.academy ? ` · ${session.academy.name}` : ''}
              </Text>
              {identityExtra}
            </View>
          </Card>
          {children}
          <TatameButton
            fullWidth
            variant="danger"
            label="Sair"
            loading={leaving}
            onPress={() => void onLogout()}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
