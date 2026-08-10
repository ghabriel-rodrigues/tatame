/**
 * Aluno Início (ATT.16, aluno-03/05): real home fed by GET /v1/aluno/home —
 * today-class hero ("Fazer check-in" → the ATT.15 sheet; flips to the
 * "Presença registrada" chip after check-in), live stat tiles (presença no
 * mês, aulas seguidas — hidden when the academy disabled the streak toggle,
 * graus na faixa fed by the derived belt) and the graduation card fed by
 * the real academy target (GRD.16 — supersedes the Phase-4 placeholder),
 * linking to the Graduação screen. "Próximos eventos" (EVT.10, spec 008):
 * the next 2 published events with own registration state, tapping a card
 * pushes the event detail. Ranking stays an explicit placeholder card.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { CheckCircle2, ChevronRight } from 'lucide-react-native';
import {
  BeltBar,
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
import { dueLabel, formatBRL, longDayMonthPt } from '../../../features/billing/format';
import { longDatePt, scheduleTimeRange } from '../../../features/enrollment/format';
import { InitialsAvatar, OccupancyBar, QueryState, StatTile } from '../../../features/enrollment/ui';
import { UPCOMING_EVENTS_TITLE } from '../../../features/events/copy';
import { EventCard } from '../../../features/events/ui';
import { isReadOnly, useSession } from '../../../session/session-store';

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
  const graduation = home?.graduation ?? null;
  const mensalidade = home?.mensalidade ?? null;
  const upcomingEvents = home?.upcomingEvents ?? [];

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
            {mensalidade ? (
              // Real "mensalidade em aberto" alert (BIL.16, story 7) —
              // server-derived charge data, deep-linking into the Carteira.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  mensalidade.overdue ? 'Mensalidade em atraso' : 'Mensalidade em aberto'
                }
                testID="mensalidade-alert"
                onPress={() => router.push('/carteira')}
              >
                <Card variant="tinted" padding={theme.space['4']}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.space['3'],
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        variant="label"
                        color={
                          mensalidade.overdue
                            ? theme.color.danger['500']
                            : theme.color.warning['500']
                        }
                      >
                        {mensalidade.overdue
                          ? 'Mensalidade em atraso'
                          : 'Mensalidade em aberto'}
                      </Text>
                      <Text variant="caption">
                        {formatBRL(mensalidade.amountCents)} ·{' '}
                        {mensalidade.overdue
                          ? `Venceu em ${longDayMonthPt(mensalidade.dueDate)}`
                          : dueLabel(mensalidade.dueDate)}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={theme.color.fg['4']} />
                  </View>
                </Card>
              </Pressable>
            ) : null}

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
                {graduation ? (
                  <StatTile
                    testID="tile-graus"
                    value={`${graduation.belt.degrees}`}
                    label="graus na faixa"
                  />
                ) : (
                  <StatTile testID="tile-graus" value="—" label="graus na faixa" note="Em breve" />
                )}
              </View>
            ) : null}

            {graduation ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sua graduação"
                onPress={() => router.push('/graduacao')}
              >
                <Card testID="graduation-card">
                  <View style={{ gap: theme.space['3'] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text variant="subtitle">Sua graduação</Text>
                      <ChevronRight size={16} color={theme.color.fg['4']} />
                    </View>
                    <BeltBar belt={graduation.belt} size="md" testID="home-belt" />
                    <OccupancyBar
                      testID="graduation-bar"
                      occupancy={graduation.progress.current}
                      capacity={graduation.progress.target}
                    />
                    <Text variant="caption">
                      {graduation.progress.current} de {graduation.progress.target} aulas ·{' '}
                      {graduation.progress.label}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ) : null}

            {upcomingEvents.length > 0 ? (
              // EVT.10: the next 2 published events with own state (spec 008).
              <View style={{ gap: theme.space['3'] }}>
                <Text variant="subtitle">{UPCOMING_EVENTS_TITLE}</Text>
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    item={event}
                    testID={`home-event-${event.id}`}
                    onPress={() => router.push(`/evento/${event.id}`)}
                  />
                ))}
              </View>
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
