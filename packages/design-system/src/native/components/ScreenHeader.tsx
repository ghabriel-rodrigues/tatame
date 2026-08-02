/**
 * ScreenHeader — P0 composed (ds-05). RN executor: every persona's screen
 * opener.
 *
 * Anatomy: [root: header row] > [back? (circular ghost icon button)]
 *          [text column: eyebrow? (overline 11/600 caps, brand-2) +
 *          title (display 25/700, tracking -0.02em) + subtitle? (body 14,
 *          fg-3)] [trailing? slot (icon buttons / avatar)]
 * Variants: with/without back, with/without eyebrow — composition, not
 *           variant strings.
 * Tokens: type display/overline/body, fg-1/fg-3, brand-2, space-3/4.
 * A11y: title is an accessibility header; back button labeled "Voltar".
 */

import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { Text } from '../typography/Text.tsx';

export interface ScreenHeaderProps {
  title: string;
  /** Uppercase context line above the title (date, section). */
  eyebrow?: string;
  subtitle?: string;
  /** Renders the back button when provided. */
  onBack?: () => void;
  /** Trailing accessory slot (notification bell, avatar...). */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  onBack,
  trailing,
  style,
  testID,
}: ScreenHeaderProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }, style]}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={onBack}
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: theme.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.color.bg.surface,
          }}
        >
          <ChevronLeft size={20} color={theme.color.fg['1']} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Text variant="overline">{eyebrow}</Text> : null}
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color={theme.color.fg['3']}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View>{trailing}</View> : null}
    </View>
  );
}

export default ScreenHeader;
