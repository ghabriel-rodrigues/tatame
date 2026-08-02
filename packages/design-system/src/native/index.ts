/**
 * @tatame/design-system/native — React Native entry (stub for DS.1-4).
 *
 * Re-exports the RN token module and the platform-neutral theming API.
 * The RN ThemeProvider/useTheme runtime, Text primitive, motion presets, and
 * P0 components land with DS.7 (per rn-03 this entry must never pull web/MUI
 * code into the Metro bundle — keep web-only modules out of this graph).
 */

export {
  derivePalette,
  mixOklab,
  hexToOklab,
  oklabToHex,
  type BrandInput,
  type Mode,
  type DerivedPalette,
} from '../theme/derive-palette.ts';
export {
  PALETTE_RECIPE,
  type PaletteRecipe,
  type RecipeEntry,
  type RecipeRule,
  type RecipeBase,
} from '../theme/palette-recipe.data.ts';
export {
  TATAME_DEFAULT_BRAND,
  READY_MADE_PALETTES,
  PRESET_DISPLAY_NAMES,
  type PresetKey,
} from '../theme/presets.ts';

export { tokens, darkTokens, type Tokens, type DarkTokens } from '../../build/native/tokens.ts';
