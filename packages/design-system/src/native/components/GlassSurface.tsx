/**
 * GlassSurface — THE single glass composition point on RN (rn-03 §4).
 * Mirrors the web `glassSurface()` mixin: blur + tinted wash + 1px glass
 * border + shine gradient overlay + purple-tinted drop shadow.
 *
 * Usage rule (component specs): glass only on floating interactive surfaces
 * (tab bar, sheets, toasts, switch thumbs) — never glass-on-glass.
 *
 * - `regular` — glass.blur (20): toasts, switch thumbs.
 * - `deep`    — glass.blurStrong (24) + deeper tint: sheets, tab bar.
 *
 * Android: `expo-blur` needs `experimentalBlurMethod` to actually blur
 * (default renders the semi-transparent wash only). Documented fallback if
 * perf disappoints on low-end devices (rn-03): drop the blur method — the
 * `glass.bg` wash alone keeps the surface readable; bump the wash opacity at
 * token level, no component API change.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { shadowStyle, type ShadowLayer } from '../lib/shadows.ts';

export type GlassVariant = 'regular' | 'deep';

export interface GlassSurfaceProps {
  variant?: GlassVariant;
  /** Corner radius; defaults to radius-lg (20). Pass radius-pill for pills. */
  radius?: number;
  /** Outer style (position, margins, shadow overrides). */
  style?: StyleProp<ViewStyle>;
  /** Inner content style (padding, layout) — clipped by the glass radius. */
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

/**
 * Map the token's px blur to expo-blur's 0-100 `intensity`. Empirically
 * intensity 50 ~ a 20px CSS backdrop blur.
 */
function blurToIntensity(blurPx: number): number {
  return Math.min(100, Math.round(blurPx * 2.5));
}

export function GlassSurface({
  variant = 'regular',
  radius,
  style,
  contentStyle,
  children,
  testID,
}: GlassSurfaceProps) {
  const theme = useTheme();
  const glass = theme.glass;
  const r = radius ?? theme.radius.lg;
  const shineColors = glass.shine.stops.map((s) => s.color) as [string, string, ...string[]];
  const shineLocations = glass.shine.stops.map((s) => s.position) as [number, number, ...number[]];

  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: r,
          borderWidth: 1,
          borderColor: glass.border,
        },
        shadowStyle(glass.shadow as ShadowLayer[]),
        style,
      ]}
    >
      <View style={{ borderRadius: r - 1, overflow: 'hidden' }}>
        <BlurView
          testID="glass-blur"
          intensity={blurToIntensity(variant === 'deep' ? glass.blurStrong : glass.blur)}
          tint={theme.mode === 'dark' ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: variant === 'deep' ? glass.bgDeep : glass.bg },
          ]}
        />
        {/* Shine overlay — 135deg, under the children, over the wash. */}
        <LinearGradient
          colors={shineColors}
          locations={shineLocations}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

export default GlassSurface;
