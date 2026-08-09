/**
 * CalendarMonth — P2 composed (ds-05 inventory). RN executor: the month
 * grid shared by the persona calendars (aluno-08, professor-04, admin-14).
 *
 * Anatomy: [root] > [weekday header row (single letters, Sunday-first)]
 *          [7-column day grid: day cell = number square + dot row]
 *          [legend? (dot + caption per kind)]
 * States: day idle / today (brand-tint square) / selected (solid brand
 *         square, white number, `accessibilityState.selected`) / marked
 *         (class dot brand-2, event dot brand-accent).
 * Tokens: radius.md, brand-1/2/tint/accent, fg-1/3, space scale — dot
 *         colors come from the theme, never hardcoded hex.
 * A11y: day cells are buttons labeled "Dia N".
 *
 * The component renders exactly the month it is given — month paging was
 * never designed (spec 007). Dot expansion from recurrence buckets is the
 * caller's job; this executor only paints per-day marks.
 */

import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { Text } from '../typography/Text.tsx';

/** Sunday-first single-letter header, per the handoff calendars. */
const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

export interface CalendarMonthMarks {
  /** Purple recurrence dot ("sua aula" / "aula recorrente"). */
  classDot?: boolean;
  /** Pink event dot — none in v1, contract ready for the events phase. */
  eventDot?: boolean;
}

export interface CalendarMonthProps {
  year: number;
  /** 1-12 (calendar month, not Date index). */
  month: number;
  /** Day-of-month emphasized as today; null when the shown month is not the current one. */
  today?: number | null;
  /** Day-of-month currently selected. */
  selectedDay?: number | null;
  onSelectDay?: (day: number) => void;
  /** Per-day dot marks keyed by day-of-month. */
  marks?: Record<number, CalendarMonthMarks>;
  /** Legend captions; omitted = no legend row. */
  legend?: { classLabel: string; eventLabel: string };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function Dot({ color, testID }: { color: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }}
    />
  );
}

export function CalendarMonth({
  year,
  month,
  today = null,
  selectedDay = null,
  onSelectDay,
  marks = {},
  legend,
  style,
  testID,
}: CalendarMonthProps) {
  const theme = useTheme();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View testID={testID} style={[{ gap: theme.space['2'] }, style]}>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_LETTERS.map((letter, index) => (
          <View key={index} style={{ width: `${100 / 7}%`, alignItems: 'center' }}>
            <Text variant="caption" color={theme.color.fg['4']} weight="bold" style={{ fontSize: 11 }}>
              {letter}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`blank-${index}`} style={{ width: `${100 / 7}%`, height: 44 }} />;
          }
          const selected = day === selectedDay;
          const isToday = day === today;
          const dayMarks = marks[day] ?? {};
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={`Dia ${day}`}
              accessibilityState={{ selected }}
              onPress={onSelectDay ? () => onSelectDay(day) : undefined}
              style={{ width: `${100 / 7}%`, height: 44, alignItems: 'center' }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: theme.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected
                    ? theme.color.brand['1']
                    : isToday
                      ? theme.color.brand.tint
                      : 'transparent',
                }}
              >
                <Text
                  variant="caption"
                  weight={selected || isToday ? 'bold' : 'medium'}
                  color={
                    selected
                      ? theme.color.fg.onColor
                      : isToday
                        ? theme.color.brand['1']
                        : theme.color.fg['2']
                  }
                  style={{ fontSize: 13 }}
                >
                  {day}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' }}>
                {dayMarks.classDot ? (
                  <Dot color={theme.color.brand['2']} testID={`class-dot-${day}`} />
                ) : null}
                {dayMarks.eventDot ? (
                  <Dot color={theme.color.brand.accent} testID={`event-dot-${day}`} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {legend ? (
        <View style={{ flexDirection: 'row', gap: theme.space['4'], paddingTop: theme.space['1'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dot color={theme.color.brand['2']} testID="legend-class-dot" />
            <Text variant="caption" style={{ fontSize: 11 }}>
              {legend.classLabel}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dot color={theme.color.brand.accent} testID="legend-event-dot" />
            <Text variant="caption" style={{ fontSize: 11 }}>
              {legend.eventLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default CalendarMonth;
