/**
 * Aluno Agenda tab (AGD.5, aluno-11): day-of-week pills (today preselected)
 * over GET /v1/aluno/agenda?weekday= — class cards with time range, turma,
 * professor, level and occupancy chips; on today, the check-in affordance
 * (button → the ATT.15 sheet, green check when present). "Eventos do mês"
 * (EVT.10, spec 008 — retires the Phase-7 empty-state debt): the current
 * month's published events as date-square cards with the own-state/valor
 * chip; tapping pushes the event detail.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { CalendarDays, Check } from 'lucide-react-native';
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
import {
  levelChipLabel,
  showCheckinButton,
  vagasLabel,
} from '../../../features/agenda/format';
import type { AlunoAgendaClass } from '../../../features/agenda/types';
import { MONTH_EVENTS_TITLE } from '../../../features/events/copy';
import { EventCard } from '../../../features/events/ui';
import { WEEKDAY_SHORT } from '../../../features/enrollment/format';
import { QueryState } from '../../../features/enrollment/ui';
import { useSession } from '../../../session/session-store';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function AgendaClassCard({ item, isToday }: { item: AlunoAgendaClass; isToday: boolean }) {
  const theme = useTheme();
  return (
    <Card padding={theme.space['4']} testID={`agenda-class-${item.classId}-${item.startTime}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }}>
        <View style={{ alignItems: 'center', minWidth: 48 }}>
          <Text variant="subtitle" weight="bold">
            {item.startTime}
          </Text>
          <Text variant="caption" style={{ fontSize: 11 }}>
            {item.endTime}
          </Text>
        </View>
        <View style={{ flex: 1, gap: theme.space['1'] }}>
          <Text variant="label" numberOfLines={1}>
            {item.className}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {item.professorName}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space['2'], flexWrap: 'wrap' }}>
            <Chip label={levelChipLabel(item)} tone="brand" />
            <Chip label={vagasLabel(item.occupancy)} tone="neutral" />
          </View>
        </View>
        {item.checkedIn ? (
          <View
            testID={`agenda-checked-${item.classId}`}
            accessibilityLabel="Presença registrada"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: theme.color.success['100'],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={18} color={theme.color.success['500']} strokeWidth={3} />
          </View>
        ) : showCheckinButton(isToday, item.checkedIn) ? (
          <TatameButton size="sm" variant="secondary" label="Check-in" onPress={openCheckinSheet} />
        ) : null}
      </View>
    </Card>
  );
}

export default function AlunoAgendaScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  // Today preselected — the default answer is "what can I train today?".
  const [weekday, setWeekday] = useState(() => new Date().getDay());
  const agendaQuery = api.useQuery('get', '/v1/aluno/agenda', {
    params: { query: { weekday } },
  });

  const agenda = agendaQuery.data;
  const classes = agenda?.classes ?? [];
  const events = agenda?.events ?? [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            title="Agenda"
            subtitle={session?.academy?.name ?? undefined}
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mês"
                onPress={() => router.push('/calendario')}
                hitSlop={6}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.color.bg.surface,
                  borderWidth: 1,
                  borderColor: theme.color.border['1'],
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                }}
              >
                <CalendarDays size={14} color={theme.color.fg['2']} />
                <Text variant="caption" weight="bold" style={{ fontSize: 12 }}>
                  Mês
                </Text>
              </Pressable>
            }
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {WEEKDAYS.map((day) => (
              <Chip
                key={day}
                size="md"
                tone="brand"
                label={WEEKDAY_SHORT[day] ?? '?'}
                selected={weekday === day}
                onPress={() => setWeekday(day)}
                testID={`day-pill-${day}`}
              />
            ))}
          </View>

          <QueryState loading={agendaQuery.isPending} error={agendaQuery.isError}>
            {agenda ? (
              <>
                {classes.length === 0 ? (
                  <Card testID="agenda-empty">
                    <View style={{ gap: 4, alignItems: 'center' }}>
                      <Text variant="label">Sem aulas neste dia</Text>
                      <Text variant="caption" style={{ textAlign: 'center' }}>
                        Bom descanso — o tatame espera você amanhã.
                      </Text>
                    </View>
                  </Card>
                ) : (
                  classes.map((item) => (
                    <AgendaClassCard
                      key={`${item.classId}-${item.startTime}`}
                      item={item}
                      isToday={agenda.isToday}
                    />
                  ))
                )}

                <Text variant="subtitle">{MONTH_EVENTS_TITLE}</Text>
                {events.length === 0 ? (
                  <Card testID="events-empty">
                    <Text variant="caption">Nenhum evento neste mês</Text>
                  </Card>
                ) : (
                  events.map((event) => (
                    <EventCard
                      key={event.id}
                      item={event}
                      testID={`agenda-event-${event.id}`}
                      onPress={() => router.push(`/evento/${event.id}`)}
                    />
                  ))
                )}
              </>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
