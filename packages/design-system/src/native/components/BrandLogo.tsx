/**
 * BrandLogo — P0 primitive (ds-05). RN executor: the Tatame belt mark drawn
 * with Views (never an image), frozen at white bar + dark tip + 2 white
 * stripes (same routine the BeltBar family uses). Swappable for a real
 * academy logo later (asset pipeline, ticket 09).
 *
 * Anatomy: [badge? (squircle, brand-1 bg + glow)] > [belt bar (white,
 *          rounded)] > [tip (purple-950)] > [stripe x2 (white)]
 * Variants: `boxed` (squircle badge — login screens, default) | `bare`
 *          (belt only — splash over gradient)
 * Sizes: `sm` | `md` | `lg` (login squircle = md 56; splash belt = lg)
 * Tokens: brand-1, purple-950, white, shadow.glow, radius (scaled).
 * A11y: accessibilityRole="image" with an accessible label ("Tatame").
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { shadowStyle, type ShadowLayer } from '../lib/shadows.ts';

export type BrandLogoSize = 'sm' | 'md' | 'lg';

export interface BrandLogoProps {
  size?: BrandLogoSize;
  /** `boxed` wraps the belt in the brand squircle badge. */
  boxed?: boolean;
  /** Accessible name; defaults to the product mark. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface Metrics {
  badge: number;
  badgeRadius: number;
  beltW: number;
  beltH: number;
  beltRadius: number;
  tipW: number;
  tipRight: number;
  stripeW: number;
  stripeGap: number;
}

/** Geometry from the handoff prototypes (login 56px squircle, splash belt). */
const METRICS: Record<BrandLogoSize, Metrics> = {
  sm: { badge: 40, badgeRadius: 13, beltW: 24, beltH: 7, beltRadius: 2, tipW: 8, tipRight: 4, stripeW: 1.5, stripeGap: 1.5 },
  md: { badge: 56, badgeRadius: 18, beltW: 32, beltH: 9, beltRadius: 2.5, tipW: 10, tipRight: 5, stripeW: 2, stripeGap: 2 },
  lg: { badge: 80, badgeRadius: 26, beltW: 52, beltH: 14, beltRadius: 4, tipW: 16, tipRight: 8, stripeW: 2.5, stripeGap: 2 },
};

export function BrandLogo({
  size = 'md',
  boxed = true,
  label = 'Tatame',
  style,
  testID,
}: BrandLogoProps) {
  const theme = useTheme();
  const m = METRICS[size];

  const belt = (
    <View
      testID="brandlogo-belt"
      style={{
        width: m.beltW,
        height: m.beltH,
        borderRadius: m.beltRadius,
        backgroundColor: theme.color.white,
      }}
    >
      <View
        testID="brandlogo-tip"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: m.tipRight,
          width: m.tipW,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: m.stripeGap,
          backgroundColor: theme.color.purple['950'],
        }}
      >
        <View testID="brandlogo-stripe" style={{ width: m.stripeW, height: '100%', backgroundColor: theme.color.white }} />
        <View testID="brandlogo-stripe" style={{ width: m.stripeW, height: '100%', backgroundColor: theme.color.white }} />
      </View>
    </View>
  );

  if (!boxed) {
    return (
      <View
        testID={testID}
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[{ alignSelf: 'flex-start' }, style]}
      >
        {belt}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        {
          width: m.badge,
          height: m.badge,
          borderRadius: m.badgeRadius,
          backgroundColor: theme.color.brand['1'],
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadowStyle(theme.shadow.glow as ShadowLayer[]),
        style,
      ]}
    >
      {belt}
    </View>
  );
}

export default BrandLogo;
