/**
 * BeltBar — graduation primitive (ds-04 resolved anatomy, GRD.15). RN
 * executor: the jiu-jitsu belt drawn with Views (never images), keyed by
 * data — the component receives a `BeltDef`-shaped payload and never
 * switches on belt names, so future arts are catalog rows with zero
 * component changes. `BrandLogo` is this routine frozen at white + 2
 * stripes.
 *
 * Anatomy: [bar: rounded rect, fill = color.belt[colorSlug], inset
 *          belt.outline hairline (keeps Branca visible — never "fix" it
 *          with gray)] > [ponteira: right block ~22% width, fill =
 *          tipColorSlug ?? belt.tip] > [degree stripes: belt.stripe white
 *          verticals ON the ponteira, count = min(degrees, maxDegrees)]
 * Rules:   black belt arrives with tipColorSlug 'belt.red' (dan stripes are
 *          white on the red tip); red belt has maxDegrees 0 → no stripes;
 *          unknown colorSlug falls back to gray + one logged warning.
 * Sizes:   `sm` (list rows) | `md` (cards) | `lg` (hero) — height fixed per
 *          size, width fluid.
 * Chip:    `BeltChip` — pill with a frozen-sm mini belt + label (registry
 *          rows, profile rank, Graduações válidas), `dimmed` for disabled
 *          kids belts.
 *
 * Cross-platform prop vocabulary: `belt`, `size`, `label` — mirrors the
 * web executor.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import type { Theme } from '../theme/theme.ts';
import { Text } from '../typography/Text.tsx';

export type BeltBarSize = 'sm' | 'md' | 'lg';

/** `BeltDef`-shaped payload (server `currentBelt` / `BeltViewDto`). */
export interface BeltBarBelt {
  /** pt-BR display name from the catalog ("Azul"). */
  name: string;
  /** Design-token slug — "belt.blue" (or bare "blue"); never hex. */
  colorSlug: string;
  /** Ponteira override slug; null/undefined = default `belt.tip`. */
  tipColorSlug?: string | null;
  /** 0 = no degree stripes (red belt in v1). */
  maxDegrees: number;
  /** Current degrees on this belt. */
  degrees?: number;
}

export interface BeltBarProps {
  belt: BeltBarBelt;
  size?: BeltBarSize;
  /** Accessible name; defaults to "Faixa {name} · N graus". */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface Metrics {
  height: number;
  radius: number;
  stripeW: number;
  stripeGap: number;
}

/** Height fixed per size, width fluid (anatomy spec). */
const METRICS: Record<BeltBarSize, Metrics> = {
  sm: { height: 8, radius: 3, stripeW: 2, stripeGap: 2 },
  md: { height: 12, radius: 4, stripeW: 3, stripeGap: 3 },
  lg: { height: 16, radius: 6, stripeW: 4, stripeGap: 4 },
};

const warnedSlugs = new Set<string>();

/**
 * Token lookup: "belt.blue" | "blue" → color.belt.blue. Unknown slugs render
 * gray with a logged warning (defensive default — keeps old clients alive if
 * the catalog gains a color before the app updates).
 */
export function resolveBeltColor(theme: Theme, slug: string): string {
  const key = slug.startsWith('belt.') ? slug.slice('belt.'.length) : slug;
  const colors = theme.color.belt as Record<string, string>;
  const hex = colors[key];
  if (hex && key !== 'tip' && key !== 'stripe' && key !== 'outline') return hex;
  if (key === 'tip' || key === 'stripe' || key === 'outline') return colors[key] as string;
  if (!warnedSlugs.has(slug)) {
    warnedSlugs.add(slug);
    console.warn(`BeltBar: unknown belt color slug "${slug}" — falling back to gray.`);
  }
  return colors['gray'] as string;
}

function degreesLabel(degrees: number): string {
  return `${degrees} ${degrees === 1 ? 'grau' : 'graus'}`;
}

export function BeltBar({ belt, size = 'md', label, style, testID }: BeltBarProps) {
  const theme = useTheme();
  const m = METRICS[size];
  const degrees = Math.max(0, Math.min(belt.degrees ?? 0, belt.maxDegrees));
  const fill = resolveBeltColor(theme, belt.colorSlug);
  const tip = belt.tipColorSlug
    ? resolveBeltColor(theme, belt.tipColorSlug)
    : theme.color.belt.tip;
  const accessibleLabel =
    label ?? `Faixa ${belt.name}${degrees > 0 ? ` · ${degreesLabel(degrees)}` : ''}`;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibleLabel}
      testID={testID}
      style={[
        {
          height: m.height,
          alignSelf: 'stretch',
          borderRadius: m.radius,
          backgroundColor: fill,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View
        testID="beltbar-tip"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: '22%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: m.stripeGap,
          backgroundColor: tip,
        }}
      >
        {Array.from({ length: degrees }, (_, index) => (
          <View
            key={index}
            testID="beltbar-stripe"
            style={{ width: m.stripeW, height: '100%', backgroundColor: theme.color.belt.stripe }}
          />
        ))}
      </View>
      {/* Inset hairline above the tip — keeps light belts (Branca) visible. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          borderRadius: m.radius,
          borderWidth: 1,
          borderColor: theme.color.belt.outline,
        }}
      />
    </View>
  );
}

export interface BeltChipProps {
  belt: BeltBarBelt;
  /** Chip text; defaults to the belt display name. */
  label?: string;
  /** Disabled kids belt rendering (Graduações válidas, régua). */
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Belt chip variant — mini frozen-sm belt swatch + label in a pill
 * (professor-12 "Graduações válidas", registry rows, profile rank chip).
 */
export function BeltChip({ belt, label, dimmed = false, style, testID }: BeltChipProps) {
  const theme = useTheme();
  const text = label ?? belt.name;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={text}
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: theme.color.border['1'],
          backgroundColor: theme.color.bg.surface,
          paddingVertical: 4,
          paddingHorizontal: 10,
          opacity: dimmed ? 0.45 : 1,
        },
        style,
      ]}
    >
      {/* Decorative swatch — the chip itself carries the accessible name. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <BeltBar belt={belt} size="sm" style={{ width: 26, alignSelf: 'center', height: 8 }} />
      </View>
      <Text
        variant="caption"
        weight="bold"
        color={theme.color.fg['2']}
        style={{ fontSize: 11, lineHeight: 14 }}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

export default BeltBar;
