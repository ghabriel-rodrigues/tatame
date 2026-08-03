/**
 * PersonaHome (AUTH.20): authenticated empty-shell home shared by the three
 * persona (inicio) tabs. Renders the session context — name, academy, role,
 * read-only state — in DS Cards; the real per-persona home content lands
 * with its own feature slices.
 */

import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Card, Text, fadeUp, useTheme } from '@tatame/design-system/native';
import { ROLE_LABELS } from '../session/role-labels';
import { isReadOnly, useSession } from '../session/session-store';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="caption">{label}</Text>
      <Text variant="label" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

export function PersonaHome() {
  const theme = useTheme();
  const { session } = useSession();
  if (!session) return null;

  const firstName = session.user.fullName.split(' ')[0] ?? session.user.fullName;
  const roleLabel = ROLE_LABELS[session.activeRole];
  const academy = session.academy;
  const readOnly = isReadOnly(session);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}
      >
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <Text variant="display">Olá, {firstName}</Text>

          {readOnly ? (
            <Card variant="tinted" testID="readonly-banner" padding={theme.space['4']}>
              <View style={{ gap: 4 }}>
                <Text variant="label" color={theme.color.warning['500']}>
                  Modo somente leitura
                </Text>
                <Text variant="caption">
                  A academia está com pagamentos pendentes. Alterações ficam desabilitadas
                  até a regularização.
                </Text>
              </View>
            </Card>
          ) : null}

          <Card variant="hero">
            <View style={{ gap: 2 }}>
              <Text variant="overline" color="rgba(255,255,255,0.8)">
                {roleLabel}
              </Text>
              <Text variant="title" color={theme.color.fg.onColor}>
                {academy?.name ?? 'Tatame'}
              </Text>
            </View>
          </Card>

          <Card>
            <View style={{ gap: theme.space['3'] }}>
              <Text variant="subtitle">Sessão</Text>
              <Row label="Nome" value={session.user.fullName} />
              <Row label="Email" value={session.user.email} />
              <Row label="Papel" value={roleLabel} />
              <Row label="Academia" value={academy?.name ?? '—'} />
              <Row label="Acesso" value={readOnly ? 'Somente leitura' : 'Completo'} />
            </View>
          </Card>

          <Text variant="caption">O conteúdo do início chega nas próximas fases.</Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
