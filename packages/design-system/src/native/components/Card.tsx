/**
 * Card — P0 primitive (ds-05). RN executor: base content surface.
 *
 * Anatomy: [root: rounded surface (radius-lg 20)] > children
 * Variants:
 *   - `surface` — solid bg-surface, shadow-sm (default)
 *   - `hero`    — immersive brand gradient (brand-1 -> brand-2, 150deg),
 *                 white text, shadow-md (Aluno home header)
 *   - `tinted`  — brand-tint wash (info panels)
 *   - `glass`   — GlassSurface('regular'); floating surfaces only, never
 *                 nested inside another glass surface
 * Tokens: radius.lg, shadow.sm/md, bg-surface, brand-1/2, brand-tint,
 *         glass.* (via GlassSurface).
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { shadowStyle, type ShadowLayer } from '../lib/shadows.ts';
import { GlassSurface } from './GlassSurface.tsx';

export type CardVariant = 'surface' | 'hero' | 'tinted' | 'glass';

export interface CardProps {
  variant?: CardVariant;
  children?: ReactNode;
  /** Inner padding in px (defaults to space-5 = 20). */
  padding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({
  variant = 'surface',
  children,
  padding,
  style,
  testID,
}: CardProps) {
  const theme = useTheme();
  const pad = padding ?? theme.space['5'];

  if (variant === 'glass') {
    return (
      <GlassSurface
        testID={testID}
        variant="regular"
        radius={theme.radius.lg}
        style={style}
        contentStyle={{ padding: pad }}
      >
        {children}
      </GlassSurface>
    );
  }

  if (variant === 'hero') {
    return (
      <View
        testID={testID}
        style={[
          { borderRadius: theme.radius.lg },
          shadowStyle(theme.shadow.md as ShadowLayer[]),
          style,
        ]}
      >
        <View style={{ borderRadius: theme.radius.lg, overflow: 'hidden' }}>
          <LinearGradient
            // 150deg-ish: top-left -> bottom-right with a vertical bias.
            colors={[theme.color.brand['1'], theme.color.brand['2']]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          <View style={{ padding: pad }}>{children}</View>
        </View>
      </View>
    );
  }

  const surface: ViewStyle =
    variant === 'tinted'
      ? { backgroundColor: theme.color.brand.tint }
      : {
          backgroundColor: theme.color.bg.surface,
          ...shadowStyle(theme.shadow.sm as ShadowLayer[]),
        };

  return (
    <View
      testID={testID}
      style={[{ borderRadius: theme.radius.lg, padding: pad }, surface, style]}
    >
      {children}
    </View>
  );
}

export default Card;
