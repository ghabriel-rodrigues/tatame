/**
 * TatameButton — P0 primitive (ds-05). RN executor.
 *
 * Anatomy: [root: pill pressable] > [gradient bg (primary)] [spinner?
 * (loading)] [label]
 * Variants: `primary` (brand gradient 135deg brand-1 -> brand-2 + glow) |
 *           `secondary` (brand-tint wash) | `ghost` (transparent) | `danger`
 * Sizes: `sm` | `md` | `lg`
 * States: default / pressed (`scale(0.97)` via the press motion preset) /
 *         disabled / loading (spinner + disabled, keeps the label)
 * Tokens: radius.pill, shadow.glow, brand-1/2/tint, danger-500, motion
 *         fast/out.
 *
 * Cross-platform prop vocabulary (mirrors the web executor): `variant`,
 * `size`, `label` (or children), `disabled`, `loading`, `fullWidth`,
 * `onPress`.
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { usePressScale } from '../motion.ts';
import { shadowStyle, type ShadowLayer } from '../lib/shadows.ts';
import { Text } from '../typography/Text.tsx';

export type TatameButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type TatameButtonSize = 'sm' | 'md' | 'lg';

export interface TatameButtonProps {
  variant?: TatameButtonVariant;
  size?: TatameButtonSize;
  /** Button text; `children` wins when both are given. */
  label?: string;
  children?: ReactNode;
  disabled?: boolean;
  /** Shows a spinner and disables interaction (accessibilityState.busy). */
  loading?: boolean;
  fullWidth?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Font px + paddings mirror the web executor's size overrides. */
const SIZES: Record<TatameButtonSize, { fontSize: number; padV: number; padH: number }> = {
  sm: { fontSize: 13, padV: 8, padH: 16 },
  md: { fontSize: 14, padV: 12, padH: 22 },
  lg: { fontSize: 16, padV: 15, padH: 28 },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function TatameButton({
  variant = 'primary',
  size = 'md',
  label,
  children,
  disabled = false,
  loading = false,
  fullWidth = false,
  onPress,
  style,
  testID,
}: TatameButtonProps) {
  const theme = useTheme();
  const press = usePressScale();
  const s = SIZES[size];
  const blocked = disabled || loading;

  const textColor =
    variant === 'primary' || variant === 'danger'
      ? theme.color.fg.onColor
      : theme.color.brand['1'];

  const surface: ViewStyle =
    variant === 'secondary'
      ? { backgroundColor: theme.color.brand.tint }
      : variant === 'danger'
        ? { backgroundColor: theme.color.danger['500'] }
        : variant === 'ghost'
          ? { backgroundColor: 'transparent' }
          : {}; // primary bg is the gradient layer

  // Glow lives on the outer (non-clipping) node so iOS doesn't clip it.
  const glow =
    variant === 'primary' && !blocked ? shadowStyle(theme.shadow.glow as ShadowLayer[]) : null;

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading || undefined }}
      disabled={blocked}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        press.style,
        {
          borderRadius: theme.radius.pill,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: blocked ? 0.55 : 1,
        },
        glow,
        style,
      ]}
    >
      <View style={[{ borderRadius: theme.radius.pill, overflow: 'hidden' }, surface]}>
        {variant === 'primary' ? (
          <LinearGradient
            colors={[theme.color.brand['1'], theme.color.brand['2']]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.space['2'],
            paddingVertical: s.padV,
            paddingHorizontal: s.padH,
          }}
        >
          {loading ? <ActivityIndicator size="small" color={textColor} /> : null}
          <Text
            weight="bold"
            color={textColor}
            style={{ fontSize: s.fontSize, lineHeight: Math.round(s.fontSize * 1.3) }}
          >
            {children ?? label}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default TatameButton;
