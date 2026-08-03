/**
 * SessionNotice (AUTH.19): full-screen blocking layout shared by the
 * "use o console web" screen (web-only roles) and the suspended-academy
 * screen. Always offers "Sair" — a blocked session must still be able to
 * log out (spec story 38).
 */

import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import {
  BrandLogo,
  Card,
  TatameButton,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { logout } from '../session/session-store';

export interface SessionNoticeProps {
  title: string;
  body: string;
  children?: ReactNode;
}

export function SessionNotice({ title, body, children }: SessionNoticeProps) {
  const theme = useTheme();
  const [leaving, setLeaving] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.space['6'] }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <BrandLogo size="md" />
          <View style={{ gap: theme.space['1'] }}>
            <Text variant="display">{title}</Text>
            <Text variant="body" color={theme.color.fg['3']}>
              {body}
            </Text>
          </View>
          {children}
          <Card variant="tinted" padding={theme.space['4']}>
            <TatameButton
              fullWidth
              variant="ghost"
              label="Sair"
              loading={leaving}
              onPress={() => {
                setLeaving(true);
                void logout();
              }}
            />
          </Card>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
