/**
 * Small presentational pieces shared by the enrollment screens (ENR.17-20):
 * initials avatar, stat tile, occupancy bar and the query state fallbacks.
 * Pure display — every figure rendered here is server-derived.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Text, useTheme } from '@tatame/design-system/native';
import { initials } from './format';

/** Brand-gradient monogram circle (roster rows, dependent cards). */
export function InitialsAvatar({
  name,
  size = 34,
}: {
  name: string;
  size?: number;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={[theme.color.brand['2'], theme.color.brand.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text
          variant="caption"
          weight="bold"
          color={theme.color.fg.onColor}
          style={{ fontSize: size * 0.34 }}
        >
          {initials(name)}
        </Text>
      </LinearGradient>
    </View>
  );
}

/**
 * Stat tile (professor-08 / responsavel-02): value over a caption label,
 * optional note line (placeholder phase tags — never fake figures).
 */
export function StatTile({
  value,
  label,
  note,
  testID,
}: {
  value: string;
  label: string;
  note?: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Card
      testID={testID}
      padding={theme.space['3']}
      style={{ flex: 1, alignItems: 'center', gap: 2 }}
    >
      <Text variant="subtitle" weight="bold" numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" numberOfLines={1} style={{ fontSize: 11 }}>
        {label}
      </Text>
      {note ? (
        <Text
          variant="caption"
          color={theme.color.brand['2']}
          numberOfLines={1}
          style={{ fontSize: 10 }}
        >
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

/** Occupancy progress bar (professor-07) — fill = occupancy / capacity. */
export function OccupancyBar({
  occupancy,
  capacity,
  testID,
}: {
  occupancy: number;
  capacity: number;
  testID?: string;
}) {
  const theme = useTheme();
  const fraction = capacity > 0 ? Math.min(1, occupancy / capacity) : 0;
  return (
    <View
      testID={testID}
      style={{
        height: 6,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.color.bg.sunken,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${fraction * 100}%`,
          height: '100%',
          borderRadius: theme.radius.pill,
          backgroundColor: theme.color.brand['2'],
        }}
      />
    </View>
  );
}

/** Loading / error fallbacks for the read views (PT-BR copy). */
export function QueryState({
  loading,
  error,
  onRetryLabel = 'Puxe para atualizar ou tente novamente.',
  children,
}: {
  loading: boolean;
  error: boolean;
  onRetryLabel?: string;
  children?: ReactNode;
}) {
  if (loading) {
    return <Text variant="caption">Carregando…</Text>;
  }
  if (error) {
    return (
      <Card>
        <View style={{ gap: 4 }}>
          <Text variant="label">Não foi possível carregar.</Text>
          <Text variant="caption">{onRetryLabel}</Text>
        </View>
      </Card>
    );
  }
  return <>{children}</>;
}
