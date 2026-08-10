/**
 * Professor dashboard (ATT.18, professor-02): live tiles from
 * GET /v1/professor/dashboard — alunos hoje, presença média and the real
 * "eventos futuros" count (EVT.11, spec 008 story 22) — plus the next-class
 * hero with its checked-in count and "Iniciar chamada" (→ ATT.17 live
 * chamada), and the read-only "Eventos futuros" list (date square, name,
 * "N confirmados · gratuito/R$ X" — academy-wide data, no professor event
 * actions by design). "Próximos da graduação" stays an explicit placeholder
 * owned by its slice.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import {
  Card,
  ScreenHeader,
  TatameButton,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { greetingPt } from '../../../features/attendance/format';
import { longDatePt } from '../../../features/enrollment/format';
import { InitialsAvatar, QueryState, StatTile } from '../../../features/enrollment/ui';
import { confirmadosLine, eventDateLine } from '../../../features/events/format';
import { EventDateSquare } from '../../../features/events/ui';
import { NotificationBell } from '../../../features/notifications/ui';
import { isReadOnly, useSession } from '../../../session/session-store';

export default function ProfessorInicioScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const dashboardQuery = api.useQuery('get', '/v1/professor/dashboard');

  if (!session) return null;
  const firstName = session.user.fullName.split(' ')[0] ?? session.user.fullName;
  const readOnly = isReadOnly(session);
  const dashboard = dashboardQuery.data;
  const nextClass = dashboard?.nextClass ?? null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            eyebrow={longDatePt()}
            title={`${greetingPt()}, ${firstName}`}
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['2'] }}>
                {/* AGD.6: month view one tap from Início (spec 007 story 20). */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Calendário"
                  onPress={() => router.push('/calendario')}
                  hitSlop={6}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: theme.radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.color.bg.surface,
                    borderWidth: 1,
                    borderColor: theme.color.border['1'],
                  }}
                >
                  <CalendarDays size={18} color={theme.color.fg['2']} />
                </Pressable>
                {/* NOT.9: bell with the pink unread dot, left of the avatar. */}
                <NotificationBell />
                <InitialsAvatar name={session.user.fullName} size={38} />
              </View>
            }
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

          <QueryState loading={dashboardQuery.isPending} error={dashboardQuery.isError}>
            {dashboard ? (
              <>
                <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
                  <StatTile
                    testID="tile-alunos-hoje"
                    value={`${dashboard.alunosHoje}`}
                    label="alunos hoje"
                  />
                  <StatTile
                    testID="tile-presenca-media"
                    value={`${dashboard.presencaMediaPct}%`}
                    label="presença média"
                  />
                  <StatTile
                    testID="tile-eventos"
                    value={`${dashboard.upcomingEventsCount ?? 0}`}
                    label="eventos futuros"
                  />
                </View>

                <Card variant="hero" testID="professor-hero">
                  <View style={{ gap: theme.space['3'] }}>
                    {nextClass ? (
                      <>
                        <View style={{ flexDirection: 'row' }}>
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
                              Próxima aula · hoje {nextClass.slot.startTime}
                            </Text>
                          </View>
                        </View>
                        <View style={{ gap: 2 }}>
                          <Text variant="title" color={theme.color.fg.onColor}>
                            {nextClass.className}
                          </Text>
                          <Text variant="caption" color="rgba(255,255,255,0.8)">
                            {nextClass.checkedInCount} confirmados
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: theme.space['2'] }}>
                          <TatameButton
                            size="sm"
                            variant="secondary"
                            label="Iniciar chamada"
                            onPress={() => router.push(`/chamada/${nextClass.classId}`)}
                          />
                          <TatameButton
                            size="sm"
                            variant="ghost"
                            label="Ver turmas"
                            onPress={() => router.push('/turmas')}
                          />
                        </View>
                      </>
                    ) : (
                      <View style={{ gap: 2 }}>
                        <Text variant="title" color={theme.color.fg.onColor}>
                          Sem próxima aula hoje
                        </Text>
                        <Text variant="caption" color="rgba(255,255,255,0.8)">
                          Suas turmas mostram os horários da semana.
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>

                {(dashboard.upcomingEvents ?? []).length > 0 ? (
                  // EVT.11 (story 22): read-only academy events from Início.
                  <View style={{ gap: theme.space['3'] }}>
                    <Text variant="subtitle">Eventos futuros</Text>
                    {dashboard.upcomingEvents.map((event) => (
                      <Card
                        key={event.id}
                        padding={theme.space['4']}
                        testID={`professor-event-${event.id}`}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: theme.space['3'],
                          }}
                        >
                          <EventDateSquare date={event.date} bannerPreset={event.bannerPreset} />
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text variant="label" numberOfLines={1}>
                              {event.name}
                            </Text>
                            <Text variant="caption" numberOfLines={1} style={{ fontSize: 11.5 }}>
                              {eventDateLine(event.date, event.time)}
                            </Text>
                            <Text variant="caption" numberOfLines={1} style={{ fontSize: 11.5 }}>
                              {confirmadosLine(event.confirmedCount, event.priceCents)}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    ))}
                  </View>
                ) : null}

                <Card>
                  <View style={{ gap: 4 }}>
                    <Text variant="label">Próximos da graduação</Text>
                    <Text variant="caption">Em breve — chega com a fase de graduação.</Text>
                  </View>
                </Card>
              </>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
