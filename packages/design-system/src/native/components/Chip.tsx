/**
 * Chip — P1 primitive (ds-05). RN executor: compact pill for status badges
 * (Ativo / Pendente / Lotada) and selectable filters (weekday chips,
 * suggested-class pick).
 *
 * Anatomy: [root: pill] > [label 11-12/700]
 * Variants (`tone`): `neutral` (bg-app wash) | `brand` (brand-tint / solid
 *           when selected) | `success` | `warning` | `danger` (status-100 bg
 *           + status-500 text pairs)
 * Sizes: `sm` (badge, 11px) | `md` (tappable filter, 12.5px)
 * States: static (no `onPress`) / pressable (`accessibilityRole="button"`,
 *         selected via `accessibilityState`) / selected (solid brand fill,
 *         white label) / disabled
 * Tokens: radius.pill, success/warning/danger 100+500, brand-tint,
 *         purple-950 (selected fill), motion fast.
 *
 * Cross-platform prop vocabulary: `label`, `tone`, `size`, `selected`,
 * `disabled`, `onPress` — mirrors the web executor.
 */

import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import type { Theme } from '../theme/theme.ts';
import { Text } from '../typography/Text.tsx';

export type ChipTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  size?: ChipSize;
  /** Solid brand fill + white label (weekday picked, suggestion accepted). */
  selected?: boolean;
  disabled?: boolean;
  /** Presence makes the chip pressable (accessibility button). */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function toneColors(
  theme: Theme,
  tone: ChipTone,
): { background: string; color: string } {
  switch (tone) {
    case 'brand':
      return {
        background: theme.color.brand.tint,
        color: theme.color.brand['1'],
      };
    case 'success':
      return {
        background: theme.color.success['100'],
        color: theme.color.success['500'],
      };
    case 'warning':
      return {
        background: theme.color.warning['100'],
        color: theme.color.warning['500'],
      };
    case 'danger':
      return {
        background: theme.color.danger['100'],
        color: theme.color.danger['500'],
      };
    default:
      return { background: theme.color.bg.app, color: theme.color.fg['3'] };
  }
}

export function Chip({
  label,
  tone = 'neutral',
  size = 'sm',
  selected = false,
  disabled = false,
  onPress,
  style,
  testID,
}: ChipProps) {
  const theme = useTheme();
  const colors = toneColors(theme, tone);
  const background = selected ? theme.color.purple['950'] : colors.background;
  const color = selected ? theme.color.fg.onColor : colors.color;

  const root: ViewStyle = {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: background,
    borderWidth: 1,
    borderColor: onPress && !selected ? theme.color.border['1'] : 'transparent',
    paddingVertical: size === 'sm' ? 4 : 7,
    paddingHorizontal: size === 'sm' ? 10 : 14,
    opacity: disabled ? 0.5 : 1,
  };

  const text = (
    <Text
      variant="caption"
      weight="bold"
      color={color}
      style={{
        fontSize: size === 'sm' ? 11 : 12.5,
        lineHeight: size === 'sm' ? 14 : 16,
      }}
      numberOfLines={1}
    >
      {label}
    </Text>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        onPress={onPress}
        disabled={disabled}
        hitSlop={4}
        style={[root, style]}
        testID={testID}
      >
        {text}
      </Pressable>
    );
  }
  return (
    <View style={[root, style]} testID={testID}>
      {text}
    </View>
  );
}

export default Chip;
