/**
 * GlassTabBar — P1 composed (ds-05 / rn-02 §3). RN executor: the floating
 * glass pill bottom bar from the handoff (Aluno/Professor/Responsável
 * shells).
 *
 * Anatomy: [root: absolute pill GlassSurface(deep), 14px side / 22px bottom
 *          insets] > [tab x2] [fab (52px gradient circle, glow)] [tab x2]
 * Tab states: active (purple-700/brand-1 pill, white icon + 12/700 label) |
 *          inactive (transparent, gray-600 icon, no label — handoff shows
 *          the label only on the active tab).
 * FAB: persona main action (check-in / chamada / cadastrar filho) — NOT a
 *          route (rn-02: "the center FAB is not a tab route"); gradient
 *          purple-600 -> pink-500 (135deg) + shadow.glow.
 * Tokens: glass.* (deep), radius.pill, brand-1, gray-600, purple-600,
 *          pink-500, shadow.glow.
 *
 * Presentational only: the app adapts react-navigation's tabBar props into
 * `items` — this component knows nothing about navigators.
 */

import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { shadowStyle, type ShadowLayer } from '../lib/shadows.ts';
import { GlassSurface } from './GlassSurface.tsx';
import { Text } from '../typography/Text.tsx';

export interface GlassTabItem {
  key: string;
  label: string;
  /** Icon renderer — receives the state-resolved color/size. */
  icon: (props: { color: string; size: number }) => ReactNode;
  active: boolean;
  onPress: () => void;
}

export interface GlassTabBarProps {
  /** Exactly 4 in the handoff shells: 2 left + FAB + 2 right. */
  items: GlassTabItem[];
  /** Center FAB — omitted renders a plain 4-tab pill. */
  fab?: {
    icon: (props: { color: string; size: number }) => ReactNode;
    accessibilityLabel: string;
    onPress: () => void;
  };
  /** Extra bottom offset (safe-area inset); default handoff 22px only. */
  offsetBottom?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function GlassTabBar({
  items,
  fab,
  offsetBottom = 0,
  style,
  testID,
}: GlassTabBarProps) {
  const theme = useTheme();
  const half = Math.ceil(items.length / 2);
  const left = fab ? items.slice(0, half) : items;
  const right = fab ? items.slice(half) : [];

  const tab = (item: GlassTabItem) => (
    <Pressable
      key={item.key}
      accessibilityRole="tab"
      accessibilityState={{ selected: item.active }}
      accessibilityLabel={item.label}
      onPress={item.onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 11,
        paddingHorizontal: 15,
        borderRadius: theme.radius.pill,
        backgroundColor: item.active ? theme.color.brand['1'] : 'transparent',
      }}
    >
      {item.icon({
        color: item.active ? theme.color.fg.onColor : theme.color.gray['600'],
        size: 20,
      })}
      {item.active ? (
        <Text
          weight="bold"
          color={theme.color.fg.onColor}
          style={{ fontSize: 12, lineHeight: 16 }}
        >
          {item.label}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <GlassSurface
      testID={testID}
      variant="deep"
      radius={theme.radius.pill}
      style={[
        {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 22 + offsetBottom,
        },
        style,
      ]}
      contentStyle={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      {left.map(tab)}
      {fab ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fab.accessibilityLabel}
          onPress={fab.onPress}
          style={[
            {
              width: 52,
              height: 52,
              borderRadius: theme.radius.pill,
            },
            shadowStyle(theme.shadow.glow as ShadowLayer[]),
          ]}
        >
          <View
            style={{
              flex: 1,
              borderRadius: theme.radius.pill,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LinearGradient
              colors={[theme.color.purple['600'], theme.color.pink['500']]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
            {fab.icon({ color: theme.color.fg.onColor, size: 22 })}
          </View>
        </Pressable>
      ) : null}
      {right.map(tab)}
    </GlassSurface>
  );
}

export default GlassTabBar;
