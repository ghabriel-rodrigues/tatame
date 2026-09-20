/**
 * ListRow — P1 composed (ds-05). RN executor: registry/list line item
 * (roster rows, picker rows, dependents rows).
 *
 * Anatomy: [root: row] > [leading? (avatar/checkbox slot)] [text column:
 *          title 13.5/650 + subtitle? 12/500 fg-3] [trailing? slot
 *          (badge / action)] [chevron?]
 * States: static / pressable (whole row is a button) / selected (brand-tint
 *         wash)
 * Tokens: bg-surface, border-1 (divider), fg-1/fg-3, brand-tint, space-3/4.
 * A11y: pressable rows are accessibility buttons labeled by the title.
 *
 * Cross-platform prop vocabulary: `title`, `subtitle`, `leading`,
 * `trailing`, `chevron`, `selected`, `onPress` — mirrors the web executor.
 * RN addition: `divider` (no `:last-child` selector — the caller turns the
 * bottom hairline off on the final row).
 */

import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { Text } from '../typography/Text.tsx';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading slot — initials avatar, checkbox... */
  leading?: ReactNode;
  /** Trailing slot — status chip, icon action... */
  trailing?: ReactNode;
  /** Renders the disclosure chevron (navigational rows). */
  chevron?: boolean;
  /** Brand-tint selected wash (multi-select mode). */
  selected?: boolean;
  /** Presence makes the whole row a button. */
  onPress?: () => void;
  /** Bottom hairline divider (default on; disable on the last row). */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron = false,
  selected = false,
  onPress,
  divider = true,
  style,
  testID,
}: ListRowProps) {
  const theme = useTheme();

  const root: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space['3'],
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: selected ? theme.color.brand.tint : 'transparent',
    borderBottomWidth: divider ? 1 : 0,
    borderBottomColor: theme.color.border['1'],
  };

  const content = (
    <>
      {leading ? <View>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          variant="label"
          weight="semibold"
          style={{ fontSize: 13.5 }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {trailing}
        </View>
      ) : null}
      {chevron ? <ChevronRight size={14} color={theme.color.fg['4']} /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={[root, style]}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[root, style]} testID={testID}>
      {content}
    </View>
  );
}

export default ListRow;
