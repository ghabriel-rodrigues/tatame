/**
 * @tatame/design-system/native — React Native entry (DS.7).
 *
 * Theming runtime (ThemeProvider/useTheme/createTheme), Text primitive,
 * motion presets, and the P0 components. Per rn-03 this entry must never
 * pull web/MUI code into the Metro bundle — keep web-only modules out of
 * this graph. Native deps (expo-blur, expo-linear-gradient, reanimated,
 * lucide-react-native) are peerDependencies installed in the app via
 * `expo install`.
 */

/* Theming runtime */
export {
  ThemeProvider,
  useTheme,
  type ThemeProviderProps,
} from './theme/ThemeProvider.tsx';
export {
  createTheme,
  type Theme,
  type ThemeTokens,
  type CreateThemeOptions,
} from './theme/theme.ts';

/* Typography primitive */
export {
  Text,
  quicksandFamily,
  type TextProps,
  type TextVariant,
  type FontWeightName,
} from './typography/Text.tsx';

/* Motion presets */
export {
  fadeUp,
  rise,
  pop,
  usePressScale,
  easeOut,
  easeSpring,
  durations,
} from './motion.ts';

/* Helpers */
export { shadowStyle, type ShadowLayer } from './lib/shadows.ts';
export { hexToRgba } from './lib/color.ts';
export {
  eventGradientColors,
  EVENT_GRADIENT_DEFAULT,
} from './lib/event-gradients.ts';
export {
  storeGradientColors,
  storeGalleryPresets,
  STORE_GRADIENT_DEFAULT,
  STORE_GRADIENT_PRESETS,
} from './lib/store-gradients.ts';

/* P0 components */
export * from './components/index.ts';

/* Platform-neutral theming API (canonical executors) */
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

/* Generated Lumira token modules (RN target) */
export {
  tokens,
  darkTokens,
  type Tokens,
  type DarkTokens,
} from '../../build/native/tokens.ts';
