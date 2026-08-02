/**
 * Toast — P0 composed (ds-05). RN executor: ephemeral confirmation pill.
 *
 * Anatomy: [root: absolute glass pill, horizontally centered above the
 *          bottom / tab-bar zone] > [message 13/600]
 * Behavior contract (handoff "Interactions & Behavior"): auto-hides after
 * ~2.6s (`duration` default 2600ms); announced via accessibilityLiveRegion.
 * Motion: rises in with the `fadeUp` preset (dur-slow 320ms ease-out).
 * Tokens: glass.* (regular, via GlassSurface), radius.pill, dur-slow/
 *         ease-out, fg-1.
 *
 * Glass rule: the toast owns its glass — never place it over another glass
 * surface. `offsetBottom` is measured from the parent's bottom edge; the app
 * composes safe-area/tab-bar insets.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { fadeUp } from '../motion.ts';
import { GlassSurface } from './GlassSurface.tsx';
import { Text } from '../typography/Text.tsx';

export interface ToastProps {
  open: boolean;
  message: string;
  /** Called when the auto-hide timer elapses. */
  onClose?: () => void;
  /** Auto-hide delay in ms — contract default 2600 (~2.6s). */
  duration?: number;
  /** Distance from the parent's bottom edge (above the glass tab bar). */
  offsetBottom?: number;
  testID?: string;
}

export function Toast({
  open,
  message,
  onClose,
  duration = 2600,
  offsetBottom = 96,
  testID,
}: ToastProps) {
  const theme = useTheme();

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, duration, onClose]);

  if (!open) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: offsetBottom,
        alignItems: 'center',
      }}
    >
      <Animated.View entering={fadeUp()} accessibilityLiveRegion="polite" testID={testID}>
        <GlassSurface
          variant="regular"
          radius={theme.radius.pill}
          contentStyle={{ paddingVertical: theme.space['3'], paddingHorizontal: theme.space['5'] }}
        >
          <Text variant="label" color={theme.color.fg['1']} numberOfLines={1}>
            {message}
          </Text>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

export default Toast;
