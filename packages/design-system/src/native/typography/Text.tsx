/**
 * Text — RN typography primitive (rn-03 / DS.7).
 *
 * Applies the Quicksand family/weight mapping (RN needs an explicit
 * `fontFamily` per weight) and the product type scale from the handoff:
 * screen titles 25/700 with -0.02em tracking, body 13-14, 10-12 floor for
 * labels/captions. Fonts are embedded natively by the `expo-font` config
 * plugin in the app (`@expo-google-fonts/quicksand` ttf files), so the
 * platform family names differ: iOS uses the fonts' PostScript names,
 * Android uses the embedded file basenames.
 */

import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import type { Theme } from '../theme/theme.ts';

export type FontWeightName = 'light' | 'regular' | 'medium' | 'semibold' | 'bold';

/** iOS: PostScript names embedded in the Quicksand ttf files. */
const IOS_FAMILY: Record<FontWeightName, string> = {
  light: 'Quicksand-Light',
  regular: 'Quicksand-Regular',
  medium: 'Quicksand-Medium',
  semibold: 'Quicksand-SemiBold',
  bold: 'Quicksand-Bold',
};

/** Android (and jest): file basenames from @expo-google-fonts/quicksand. */
const ANDROID_FAMILY: Record<FontWeightName, string> = {
  light: 'Quicksand_300Light',
  regular: 'Quicksand_400Regular',
  medium: 'Quicksand_500Medium',
  semibold: 'Quicksand_600SemiBold',
  bold: 'Quicksand_700Bold',
};

/** Resolve the platform Quicksand family name for a weight. */
export function quicksandFamily(weight: FontWeightName = 'regular'): string {
  return Platform.OS === 'ios' ? IOS_FAMILY[weight] : ANDROID_FAMILY[weight];
}

export type TextVariant =
  | 'display' // screen titles — 25/700, tracking tight
  | 'title' // section/card titles — 20/700, tracking tight
  | 'subtitle' // 16/600
  | 'body' // 14/400
  | 'label' // 13/600 (matches the web executor's 13px labels)
  | 'caption' // 12/400, fg-3
  | 'overline'; // 11/600, uppercase, tracking caps

interface VariantSpec {
  fontSize: number;
  weight: FontWeightName;
  lineHeightKey: 'tight' | 'snug' | 'normal' | 'relaxed';
  trackingKey: 'tight' | 'normal' | 'wide' | 'caps';
  uppercase?: boolean;
  colorOf: (theme: Theme) => string;
}

const VARIANTS: Record<TextVariant, VariantSpec> = {
  // 25 = handoff screen-title size (between xl 24 and 2xl 30; web h1 parity).
  display: { fontSize: 25, weight: 'bold', lineHeightKey: 'tight', trackingKey: 'tight', colorOf: (t) => t.color.fg['1'] },
  title: { fontSize: 20, weight: 'bold', lineHeightKey: 'snug', trackingKey: 'tight', colorOf: (t) => t.color.fg['1'] },
  subtitle: { fontSize: 16, weight: 'semibold', lineHeightKey: 'snug', trackingKey: 'normal', colorOf: (t) => t.color.fg['1'] },
  body: { fontSize: 14, weight: 'regular', lineHeightKey: 'normal', trackingKey: 'normal', colorOf: (t) => t.color.fg['2'] },
  label: { fontSize: 13, weight: 'semibold', lineHeightKey: 'snug', trackingKey: 'normal', colorOf: (t) => t.color.fg['1'] },
  caption: { fontSize: 12, weight: 'regular', lineHeightKey: 'snug', trackingKey: 'normal', colorOf: (t) => t.color.fg['3'] },
  overline: { fontSize: 11, weight: 'semibold', lineHeightKey: 'snug', trackingKey: 'caps', uppercase: true, colorOf: (t) => t.color.brand['2'] },
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** Override the variant's weight (remaps the Quicksand family). */
  weight?: FontWeightName;
  /** Override the variant's color (any resolved theme color / hex). */
  color?: string;
}

export function Text({ variant = 'body', weight, color, style, children, ...rest }: TextProps) {
  const theme = useTheme();
  const spec = VARIANTS[variant];
  const w = weight ?? spec.weight;
  const base: TextStyle = {
    fontFamily: quicksandFamily(w),
    fontSize: spec.fontSize,
    lineHeight: Math.round(spec.fontSize * theme.text.lineHeight[spec.lineHeightKey]),
    // Tracking tokens are em values — multiply by fontSize for RN px.
    letterSpacing: spec.fontSize * theme.text.tracking[spec.trackingKey],
    color: color ?? spec.colorOf(theme),
    ...(spec.uppercase ? { textTransform: 'uppercase' as const } : null),
  };
  return (
    <RNText style={[base, style]} {...rest}>
      {children}
    </RNText>
  );
}

export default Text;
