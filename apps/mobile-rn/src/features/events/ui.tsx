/**
 * Presentational pieces shared by the events surfaces (EVT.10-11): the
 * gradient date square (aluno-11 "15 AGO"), the event list card (home
 * "Próximos eventos" + agenda "Eventos do mês"), the pink "Evento" pill the
 * calendars use, and the responsável per-dependent chip (responsavel-06 —
 * check icon when confirmed). Pure display — states are server-derived.
 */

import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronRight, Clock } from 'lucide-react-native';
import {
  Card,
  Chip,
  Text,
  eventGradientColors,
  useTheme,
} from '@tatame/design-system/native';
import { dateSquare, eventDateLine, eventStateChip } from './format';
import type { AlunoEventItem, EventRegistrationState } from './types';

/** Gradient "15 / AGO" square (aluno-11); clock glyph on undated drafts. */
export function EventDateSquare({
  date,
  bannerPreset,
  size = 46,
  testID,
}: {
  date?: string | null;
  bannerPreset: string;
  size?: number;
  testID?: string;
}) {
  const theme = useTheme();
  const colors = eventGradientColors(theme, bannerPreset);
  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {date ? (
          <>
            <Text
              variant="label"
              weight="bold"
              color={theme.color.fg.onColor}
              style={{ fontSize: 16, lineHeight: 18 }}
            >
              {dateSquare(date).day}
            </Text>
            <Text
              variant="caption"
              weight="bold"
              color={theme.color.fg.onColor}
              style={{ fontSize: 9, lineHeight: 11 }}
            >
              {dateSquare(date).month}
            </Text>
          </>
        ) : (
          <Clock size={18} color={theme.color.fg.onColor} />
        )}
      </LinearGradient>
    </View>
  );
}

/**
 * Event list card (aluno-03 "Próximos eventos" / aluno-11 "Eventos do mês"):
 * date square, name, PT-BR date line and the own-state/valor trailing chip.
 */
export function EventCard({
  item,
  onPress,
  testID,
}: {
  item: Pick<
    AlunoEventItem,
    | 'id'
    | 'name'
    | 'bannerPreset'
    | 'date'
    | 'time'
    | 'priceCents'
    | 'registration'
  >;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const chip = eventStateChip(item.priceCents, item.registration);
  const body = (
    <Card padding={theme.space['4']} testID={testID}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space['3'],
        }}
      >
        <EventDateSquare date={item.date} bannerPreset={item.bannerPreset} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="label" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="caption" numberOfLines={1} style={{ fontSize: 11.5 }}>
            {eventDateLine(item.date, item.time)}
          </Text>
          <Chip
            label={chip.label}
            tone={chip.tone}
            testID={testID ? `${testID}-chip` : undefined}
          />
        </View>
        {onPress ? (
          <ChevronRight size={16} color={theme.color.fg['4']} />
        ) : null}
      </View>
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

/** Pink "Evento" pill — matches the calendars' pink-dot legend hue. */
export function EventPill({ testID }: { testID?: string }) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        borderRadius: theme.radius.pill,
        backgroundColor: theme.color.pink['100'],
        paddingVertical: 4,
        paddingHorizontal: 10,
      }}
    >
      <Text
        variant="caption"
        weight="bold"
        color={theme.color.pink['600']}
        style={{ fontSize: 11, lineHeight: 14 }}
      >
        Evento
      </Text>
    </View>
  );
}

/**
 * Per-dependent confirmation chip (responsavel-06): outline pill with the
 * child's first name; confirmed = success tint + check; pending = warning
 * tint. Tap/long-press semantics live on the screen (see eventos.tsx).
 */
export function DependentChip({
  name,
  registration,
  onPress,
  onLongPress,
  testID,
}: {
  name: string;
  registration?: EventRegistrationState | null;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const status =
    !registration || registration.status === 'canceled'
      ? 'none'
      : registration.status;
  const confirmed = status === 'confirmed';
  const pending = status === 'pending_payment';
  const background = confirmed
    ? theme.color.success['100']
    : pending
      ? theme.color.warning['100']
      : theme.color.bg.surface;
  const color = confirmed
    ? theme.color.success['500']
    : pending
      ? theme.color.warning['500']
      : theme.color.fg['2'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: confirmed }}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor:
          confirmed || pending ? 'transparent' : theme.color.border['1'],
        backgroundColor: background,
        paddingVertical: 8,
        paddingHorizontal: 14,
      }}
    >
      {confirmed ? (
        // testID on a wrapping View — the SVG icon drops unknown props.
        <View testID={testID ? `${testID}-check` : undefined}>
          <Check size={13} color={color} strokeWidth={3} />
        </View>
      ) : null}
      <Text
        variant="caption"
        weight="bold"
        color={color}
        style={{ fontSize: 12 }}
        numberOfLines={1}
      >
        {name}
      </Text>
    </Pressable>
  );
}
