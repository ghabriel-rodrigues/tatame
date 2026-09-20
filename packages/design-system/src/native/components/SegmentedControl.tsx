/**
 * SegmentedControl — P1 composed (ds-05). RN executor: section switcher
 * (check-in methods, professor/aluno filters). Mirrors the web executor's
 * anatomy.
 *
 * Anatomy: [root: pill track (bg-app wash)] > N × [segment button 12.5/600]
 * States: idle segment (fg-3) / selected (bg-surface fill + shadow-xs +
 *         fg-1) / disabled
 * Tokens: radius.pill, bg-app, bg-surface, shadow.xs, fg-1/fg-3, border-1.
 * A11y: `accessibilityRole="tablist"` root + `tab` segments with
 *       `accessibilityState.selected` — the handoff prototypes' segment rows.
 *
 * Cross-platform prop vocabulary: `options` ({value,label}[]), `value`,
 * `onChange`, `ariaLabel` (accessibility label on the track).
 */

import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { shadowStyle, type ShadowLayer } from '../lib/shadows.ts';
import { Text } from '../typography/Text.tsx';

export interface SegmentedControlOption<V extends string = string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string = string> {
  options: ReadonlyArray<SegmentedControlOption<V>>;
  value: V;
  onChange: (value: V) => void;
  ariaLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedControl<V extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  style,
  testID,
}: SegmentedControlProps<V>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={ariaLabel}
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          gap: 2,
          padding: 3,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.color.bg.app,
          borderWidth: 1,
          borderColor: theme.color.border['1'],
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              {
                flex: 1,
                alignItems: 'center',
                borderRadius: theme.radius.pill,
                paddingVertical: 7,
                paddingHorizontal: 14,
                backgroundColor: selected
                  ? theme.color.bg.surface
                  : 'transparent',
              },
              selected ? shadowStyle(theme.shadow.xs as ShadowLayer[]) : null,
            ]}
          >
            <Text
              variant="caption"
              weight="semibold"
              color={selected ? theme.color.fg['1'] : theme.color.fg['3']}
              style={{ fontSize: 12.5 }}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default SegmentedControl;
