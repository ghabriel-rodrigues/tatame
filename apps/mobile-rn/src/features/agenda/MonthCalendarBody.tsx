/**
 * Shared month-calendar screen body (AGD.6, aluno-08 / professor-04): back
 * header with the month title, the DS CalendarMonth grid + legend, and the
 * selected-day agenda list below — one composition, persona-parameterized
 * copy. Clients render the current month only: the prototype's chevron is
 * back navigation, month paging was never designed (spec 007). Events
 * (EVT.10-11, spec 008): the month's published events expand into the pink
 * eventDot marks and merge into the selected-day list as "Evento" entries
 * (tappable on the aluno via `onPressEvent`).
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  CalendarMonth,
  Card,
  Chip,
  ScreenHeader,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { QueryState } from '../enrollment/ui';
import { eventDayMap } from '../events/format';
import { EventPill } from '../events/ui';
import type { CalendarEventItem } from '../events/types';
import {
  dayAgendaItems,
  dayHeadingPt,
  expandMonthMarks,
  monthTitlePt,
  timeRangeLabel,
  vagasLabel,
  weekdayOf,
} from './format';
import type { CalendarResponse } from './types';

export interface MonthCalendarBodyProps {
  /** aluno tags rows "Aula"; professor shows the occupancy line. */
  persona: 'aluno' | 'professor';
  subtitle: string;
  legendClassLabel: string;
  /** Persona free-day copy (spec 007 story 18/23). */
  emptyDayCopy: string;
  data: CalendarResponse | undefined;
  loading: boolean;
  error: boolean;
  /** Aluno: tapping a day's Evento entry pushes the detail (spec 008). */
  onPressEvent?: (event: CalendarEventItem) => void;
}

export function MonthCalendarBody({
  persona,
  subtitle,
  legendClassLabel,
  emptyDayCopy,
  data,
  loading,
  error,
  onPressEvent,
}: MonthCalendarBodyProps) {
  const theme = useTheme();
  const router = useRouter();

  // Current tenant-local month per the client clock; the API echoes it back.
  const [now] = useState(() => new Date());
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [selectedDay, setSelectedDay] = useState(now.getDate());

  const buckets = data?.classesByWeekday;
  const items = buckets ? dayAgendaItems(buckets, weekdayOf(year, month, selectedDay)) : [];

  // Month's published events → pink dots + selected-day Evento entries.
  const monthKey = data?.month ?? `${year}-${`${month}`.padStart(2, '0')}`;
  const eventsByDay = eventDayMap(data?.events ?? [], monthKey);
  const dayEvents = eventsByDay[selectedDay] ?? [];
  const marks = buckets ? expandMonthMarks(buckets, year, month) : {};
  for (const day of Object.keys(eventsByDay)) {
    marks[Number(day)] = { ...marks[Number(day)], eventDot: true };
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            title={monthTitlePt(data?.month ?? `${year}-${`${month}`.padStart(2, '0')}`)}
            subtitle={subtitle}
            onBack={() => router.back()}
          />

          <QueryState loading={loading} error={error}>
            {buckets ? (
              <>
                <Card testID="calendar-card">
                  <CalendarMonth
                    year={year}
                    month={month}
                    today={now.getDate()}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                    marks={marks}
                    legend={{ classLabel: legendClassLabel, eventLabel: 'evento' }}
                  />
                </Card>

                <Text variant="subtitle" testID="selected-day-heading">
                  {dayHeadingPt(year, month, selectedDay)}
                </Text>

                {items.length === 0 && dayEvents.length === 0 ? (
                  <Text
                    variant="caption"
                    testID="free-day-copy"
                    style={{ textAlign: 'center', paddingVertical: theme.space['6'] }}
                  >
                    {emptyDayCopy}
                  </Text>
                ) : (
                  items.map((item) => (
                    <Card
                      key={`${item.classId}-${item.startTime}`}
                      padding={theme.space['4']}
                      testID={`calendar-item-${item.classId}-${item.startTime}`}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.space['3'],
                        }}
                      >
                        <View style={{ alignItems: 'center', minWidth: 44 }}>
                          <Text variant="subtitle" weight="bold">
                            {item.startTime}
                          </Text>
                          <Text variant="caption" style={{ fontSize: 11 }}>
                            {item.endTime}
                          </Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="label" numberOfLines={1}>
                            {item.className}
                          </Text>
                          <Text variant="caption" numberOfLines={1}>
                            {persona === 'professor'
                              ? `${timeRangeLabel(item.startTime, item.endTime)} · ${vagasLabel(item.occupancy)}`
                              : item.professorName}
                          </Text>
                        </View>
                        {persona === 'aluno' ? <Chip label="Aula" tone="brand" /> : null}
                      </View>
                    </Card>
                  ))
                )}

                {dayEvents.map((event) => {
                  const row = (
                    <Card
                      key={event.id}
                      padding={theme.space['4']}
                      testID={`calendar-event-${event.id}`}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.space['3'],
                        }}
                      >
                        <View style={{ alignItems: 'center', minWidth: 44 }}>
                          <Text variant="subtitle" weight="bold">
                            {event.time ?? '—'}
                          </Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="label" numberOfLines={1}>
                            {event.name}
                          </Text>
                          {event.location ? (
                            <Text variant="caption" numberOfLines={1}>
                              {event.location}
                            </Text>
                          ) : null}
                        </View>
                        <EventPill />
                      </View>
                    </Card>
                  );
                  if (!onPressEvent) return row;
                  return (
                    <Pressable
                      key={event.id}
                      accessibilityRole="button"
                      accessibilityLabel={event.name}
                      onPress={() => onPressEvent(event)}
                    >
                      {row}
                    </Pressable>
                  );
                })}
              </>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
