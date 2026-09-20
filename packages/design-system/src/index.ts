/**
 * @tatame/design-system — web entry.
 *
 * Platform-neutral theming (derivePalette, presets) plus web-only integration
 * (applyBrand). Generated Lumira token modules are re-exported for
 * convenience; they are also importable directly via
 * `@tatame/design-system/tokens`.
 *
 * MUI integration: createTatameTheme (DS.5) + the P0 web components (DS.6).
 * These require the optional peers (@mui/material, @emotion/*).
 */

export {
  createTatameTheme,
  buildShadowPlateau,
} from './theme/create-tatame-theme.ts';
export {
  glassSurface,
  glowShadow,
  hexToRgba,
  type GlassVariant,
  type CssMixin,
} from './theme/glass.ts';
export * from './components/web/index.ts';

export {
  derivePalette,
  mixOklab,
  hexToOklab,
  oklabToHex,
  type BrandInput,
  type Mode,
  type DerivedPalette,
} from './theme/derive-palette.ts';
export {
  PALETTE_RECIPE,
  type PaletteRecipe,
  type RecipeEntry,
  type RecipeRule,
  type RecipeBase,
} from './theme/palette-recipe.data.ts';
export {
  TATAME_DEFAULT_BRAND,
  READY_MADE_PALETTES,
  PRESET_DISPLAY_NAMES,
  type PresetKey,
} from './theme/presets.ts';
export { applyBrand, type CssVarTarget } from './theme/apply-brand.ts';

export {
  tokens,
  darkTokens,
  webCss,
  cssVars,
  type Tokens,
  type DarkTokens,
} from '../build/web/tokens.ts';
