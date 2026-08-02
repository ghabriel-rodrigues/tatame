/**
 * Structured shadow tokens -> RN styles (ds-01 degradation policy).
 *
 * iOS renders the first non-inset layer via shadow* props; Android gets an
 * `elevation` heuristic (~offsetY) since it cannot express blur/spread/color
 * combinations. Inset layers (glass shine hairlines) are dropped — RN has no
 * inset shadows; `GlassSurface` reproduces them with overlay views instead.
 */

import type { ViewStyle } from 'react-native';

export interface ShadowLayer {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
}

/**
 * Map a shadow token (array of layers) to an RN style. CSS `blur` is the
 * gaussian diameter-ish value; RN `shadowRadius` is the sigma-ish radius —
 * blur/2 is the accepted approximation.
 */
export function shadowStyle(layers: readonly ShadowLayer[]): ViewStyle {
  const layer = layers.find((l) => !l.inset);
  if (!layer) return {};
  return {
    shadowColor: layer.color,
    shadowOffset: { width: layer.offsetX, height: layer.offsetY },
    shadowRadius: layer.blur / 2,
    // Opacity ships inside the token's rgba color.
    shadowOpacity: 1,
    elevation: Math.max(1, Math.round(layer.offsetY)),
  };
}
