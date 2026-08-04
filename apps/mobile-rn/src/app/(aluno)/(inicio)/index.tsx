/**
 * Aluno Início (ATT.16, aluno-03/05): real home fed by GET /v1/aluno/home —
 * today-class hero ("Fazer check-in" → the ATT.15 sheet; flips to the
 * "Presença registrada" chip after check-in), live stat tiles (presença no
 * mês, aulas seguidas — hidden when the academy disabled the streak toggle,
 * graus placeholder) and the graduation progress bar fed by the true lesson
 * count (the 40-lesson target is the documented placeholder until the
 * graduation slice). Ranking stays an explicit placeholder card.
 */

import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import {
  Card,
  Chip,
  ScreenHeader,
  TatameButton,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { openCheckinSheet } from '../../../features/attendance/checkin-sheet-store';
import { longDatePt, scheduleTimeRange } from '../../../features/enrollment/format';
import { InitialsAvatar, OccupancyBar, QueryState, StatTile } from '../../../features/enrollment/ui';
import { isReadOnly, useSession } from '../../../session/session-store';

/** Graduation-rules placeholder denominator (graduation slice owns it). */
const GRADUATION_TARGET_PLACEHOLDER = 40;

export default function AlunoInicioScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const homeQuery = api.useQuery('get', '/v1/aluno/home');

  if (!session) return null;
  const firstName = session.user.fullName.split(' ')[0] ?? session.user.fullName;
  const readOnly = isReadOnly(session);

  const home = homeQuery.data;
  const todayClass = home?.todayClass ?? null;
  const stats = home?.stats;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            eyebrow={longDatePt()}
            title={`Olá, ${firstName}`}
            trailing={<InitialsAvatar name={session.user.fullName} size={38} />}
          />

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

          <QueryState loading={homeQuery.isPending} error={homeQuery.isError}>
            <Card variant="hero" testID="aluno-hero">
              <View style={{ gap: theme.space['3'] }}>
                {todayClass ? (
                  <>
                    <View style={{ flexDirection: 'row' }}>
                      {todayClass.checkedIn ? (
                        <View
                          testID="hero-checked-in-chip"
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            backgroundColor: 'rgba(255,255,255,0.18)',
                            borderRadius: theme.radius.pill,
                            paddingVertical: 4,
                            paddingHorizontal: 12,
                          }}
                        >
                          <CheckCircle2 size={14} color={theme.color.fg.onColor} />
                          <Text
                            variant="caption"
                            weight="bold"
                            color={theme.color.fg.onColor}
                            style={{ fontSize: 11 }}
                          >
                            Presença registrada
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.18)',
                            borderRadius: theme.radius.pill,
                            paddingVertical: 4,
                            paddingHorizontal: 12,
                          }}
                        >
                          <Text
                            variant="caption"
                            weight="bold"
                            color={theme.color.fg.onColor}
                            style={{ fontSize: 11 }}
                          >
                            Hoje às {todayClass.slot.startTime}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ gap: 2 }}>
                      <Text variant="title" color={theme.color.fg.onColor}>
                        {todayClass.className}
                      </Text>
                      <Text variant="caption" color="rgba(255,255,255,0.8)">
                        {scheduleTimeRange(todayClass.slot)} · {todayClass.slot.durationMinutes}{' '}
                        min
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: theme.space['2'] }}>
                      {!todayClass.checkedIn ? (
                        <TatameButton
                          size="sm"
                          variant="secondary"
                          label="Fazer check-in"
                          onPress={openCheckinSheet}
                        />
                      ) : null}
                      <TatameButton
                        size="sm"
                        variant="ghost"
                        label="Ver agenda"
                        onPress={() => router.push('/agenda')}
                      />
                    </View>
                  </>
                ) : (
                  <View style={{ gap: 2 }}>
                    <Text variant="title" color={theme.color.fg.onColor}>
                      Sem aula hoje
                    </Text>
                    <Text variant="caption" color="rgba(255,255,255,0.8)">
                      Aproveite o descanso — sua agenda mostra os próximos treinos.
                    </Text>
                  </View>
                )}
              </View>
            </Card>

            {stats ? (
              <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
                <StatTile
                  testID="tile-presenca"
                  value={`${stats.monthPresencePct}%`}
                  label="presença no mês"
                />
                {stats.streak !== null ? (
                  <StatTile
                    testID="tile-streak"
                    value={`${stats.streak}`}
                    label="aulas seguidas"
                  />
                ) : null}
                <StatTile testID="tile-graus" value="—" label="graus na faixa" note="Em breve" />
              </View>
            ) : null}

            {stats ? (
              <Card testID="graduation-card">
                <View style={{ gap: theme.space['3'] }}>
                  <Text variant="subtitle">Sua graduação</Text>
                  <OccupancyBar
                    testID="graduation-bar"
                    occupancy={stats.totalLessons}
                    capacity={GRADUATION_TARGET_PLACEHOLDER}
                  />
                  <Text variant="caption">
                    {stats.totalLessons} de {GRADUATION_TARGET_PLACEHOLDER} aulas · meta padrão
                    — as regras de graduação chegam em fase futura.
                  </Text>
                </View>
              </Card>
            ) : null}

            <Card>
              <View style={{ gap: 4 }}>
                <Text variant="label">Ranking do mês</Text>
                <Text variant="caption">Em breve — chega com a fase de relatórios.</Text>
              </View>
            </Card>
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
