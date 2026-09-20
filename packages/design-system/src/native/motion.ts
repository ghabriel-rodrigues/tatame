/**
 * Motion presets (rn-03 §5 / DS.7) — Reanimated builders driven by the
 * motion tokens. Apps never hand-write durations/curves (charter rule 4
 * applies to motion too).
 *
 * - `fadeUp` — screen/content entrance: fade + 10px rise, 320ms ease-out.
 * - `rise`   — bottom sheet entrance: slide from bottom, 320ms ease-out.
 * - `pop`    — success burst: scale-in on the spring curve.
 * - `usePressScale` — pressable feedback: scale 0.97, 120ms (handoff
 *   "Press: scale(0.97)").
 *
 * Presets are factories (`entering={fadeUp()}`) so each mount gets a fresh
 * builder instance.
 */

import {
  Easing,
  FadeInUp,
  SlideInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '../../build/native/tokens.ts';

const [outX1, outY1, outX2, outY2] = tokens.motion.ease.out;
const [sprX1, sprY1, sprX2, sprY2] = tokens.motion.ease.spring;

/** ease-out cubic-bezier(0.22, 1, 0.36, 1) from the motion tokens. */
export const easeOut = Easing.bezier(outX1, outY1, outX2, outY2);
/** spring cubic-bezier(0.34, 1.56, 0.64, 1) from the motion tokens. */
export const easeSpring = Easing.bezier(sprX1, sprY1, sprX2, sprY2);

export const durations = tokens.motion.duration;

/** fadeUp — fade + 10px rise, dur-slow ease-out (screen content mount). */
export const fadeUp = () =>
  FadeInUp.duration(durations.slow)
    .easing(easeOut)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });

/** rise — sheet slides up from the bottom edge, dur-slow ease-out. */
export const rise = () => SlideInDown.duration(durations.slow).easing(easeOut);

/** pop — spring scale-in (success burst, check-in confirmation). */
export const pop = () => ZoomIn.duration(durations.base).easing(easeSpring);

/**
 * Press feedback: spread onto an `Animated.View`/animated Pressable —
 * `style` + `onPressIn`/`onPressOut`. Scale 0.97 over dur-fast.
 */
export function usePressScale() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const onPressIn = () => {
    scale.value = withTiming(0.97, {
      duration: durations.fast,
      easing: easeOut,
    });
  };
  const onPressOut = () => {
    scale.value = withTiming(1, { duration: durations.fast, easing: easeOut });
  };
  return { style, onPressIn, onPressOut };
}
