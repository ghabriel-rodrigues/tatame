/**
 * MUI theme factory (ds-02, DS.5).
 *
 * `createTatameTheme(palette, mode)` — hand-authored mapping code that
 * consumes the GENERATED token constants (`build/web/tokens.ts`) plus the
 * DERIVED brand palette (`derivePalette()` output). The theme is never
 * written against raw hex: every value is traceable to a token or to the
 * derived brand scale (BOSS checklist item 4).
 *
 * - MUI v6+ `cssVariables` mode with `colorSchemeSelector: 'data-theme'` so
 *   the MUI variable layer flips on the same `[data-theme="dark"]` attribute
 *   as the Lumira `tokens.css` layer — the two can never disagree.
 * - One theme per `(brand, mode)` pair, memoized by the caller; the only
 *   interactive rebuild site is the admin white-label live preview.
 * - `applyBrand(derived)` must be called with the SAME `DerivedPalette`
 *   object so the Lumira vars (`--purple-*`, `--brand-*`) agree with
 *   `theme.vars`.
 */

import { createTheme, type Theme } from '@mui/material/styles';
import type { Shadows } from '@mui/material/styles';
import { tokens, darkTokens, webCss } from '../../build/web/tokens.ts';
import type { DerivedPalette, Mode } from './derive-palette.ts';
import { glassSurface, glowShadow, hexToRgba } from './glass.ts';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function req(palette: DerivedPalette, token: string): string {
  const value = palette[token];
  if (!value) {
    throw new Error(
      `createTatameTheme: derived palette is missing "${token}" — pass the output of derivePalette().`,
    );
  }
  return value;
}

function quoteFamily(name: string): string {
  return /[ A-Z]/.test(name) && !name.startsWith('-') ? `'${name}'` : name;
}

const FONT_FAMILY = tokens.font.family.body.map(quoteFamily).join(', ');

function bezier(curve: readonly [number, number, number, number]): string {
  return `cubic-bezier(${curve.join(', ')})`;
}

const EASE_OUT = bezier(tokens.motion.ease.out);
const DUR_FAST = `${tokens.motion.duration.fast}ms`;
const DUR_BASE = `${tokens.motion.duration.base}ms`;

/**
 * 25-slot MUI shadow array rebuilt from the 5 purple-tinted named levels via
 * plateau mapping (ds-02 §4): 0=none, 1=xs, 2–3=sm, 4–7=md, 8–15=lg,
 * 16–24=xl. No interpolation — only the 5 named levels exist in the design.
 * `--shadow-glow` is intentionally NOT here (see `glowShadow`).
 */
export function buildShadowPlateau(): Shadows {
  const s = webCss.shadow;
  const level = (i: number): string => {
    if (i === 0) return 'none';
    if (i === 1) return s.xs;
    if (i <= 3) return s.sm;
    if (i <= 7) return s.md;
    if (i <= 15) return s.lg;
    return s.xl;
  };
  return Array.from({ length: 25 }, (_, i) => level(i)) as Shadows;
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

export function createTatameTheme(
  palette: DerivedPalette,
  mode: Mode = 'light',
): Theme {
  const dark = mode === 'dark';

  // Static (non-derived) neutrals resolved per mode: base set + dark overlay.
  const gray = {
    ...tokens.color.gray,
    ...(dark ? darkTokens.color.gray : undefined),
  };
  const fg = {
    ...tokens.color.fg,
    ...(dark ? darkTokens.color.fg : undefined),
  };
  const bg = {
    ...tokens.color.bg,
    ...(dark ? darkTokens.color.bg : undefined),
  };
  const border = {
    ...tokens.color.border,
    ...(dark ? darkTokens.color.border : undefined),
  };
  const tint = {
    success: dark ? darkTokens.color.success[100] : tokens.color.success[100],
    warning: dark ? darkTokens.color.warning[100] : tokens.color.warning[100],
    danger: dark ? darkTokens.color.danger[100] : tokens.color.danger[100],
    info: tokens.color.info[100],
  };

  const white = tokens.color.white;
  const glow = glowShadow(req(palette, 'purple-500'));

  const muiPalette = {
    mode,
    primary: {
      main: req(palette, 'purple-700'),
      light: req(palette, 'purple-500'),
      dark: req(palette, 'purple-800'),
      contrastText: fg.onColor,
    },
    secondary: {
      main: req(palette, 'pink-500'),
      light: req(palette, 'pink-300'),
      dark: req(palette, 'pink-700'),
      contrastText: fg.onColor,
    },
    success: {
      main: tokens.color.success[500],
      light: tint.success,
      contrastText: fg.onColor,
    },
    warning: {
      main: tokens.color.warning[500],
      light: tint.warning,
      contrastText: fg.onColor,
    },
    error: {
      main: tokens.color.danger[500],
      light: tint.danger,
      contrastText: fg.onColor,
    },
    info: {
      main: tokens.color.info[500],
      light: tint.info,
      contrastText: fg.onColor,
    },
    text: {
      // Light: derived purple scale (fg-1/fg-2 alias purple-950/800, so a
      // tenant brand tints its text). Dark: static dark foreground set.
      primary: dark ? fg[1] : req(palette, 'purple-950'),
      secondary: dark ? fg[2] : req(palette, 'purple-800'),
      disabled: fg[4],
    },
    // Tripwire (ds-02 §2): pure black must never render — anything reaching
    // for `common.black` gets ink purple instead.
    common: { black: req(palette, 'purple-950'), white },
    divider: border[1],
    background: { default: bg.app, paper: bg.surface },
    grey: gray,
    action: {
      focus: hexToRgba(req(palette, 'purple-500'), tokens.focus.ring.alpha),
    },
  };

  return createTheme({
    cssVariables: { colorSchemeSelector: 'data-theme' },
    defaultColorScheme: mode,
    colorSchemes: { [mode]: { palette: muiPalette } },
    shape: { borderRadius: tokens.radius.md },
    shadows: buildShadowPlateau(),
    typography: {
      fontFamily: FONT_FAMILY,
      // Product scale (ds-02 §3) — px-authored, pixel-faithful handoff.
      h1: {
        fontSize: '25px',
        fontWeight: tokens.font.weight.bold,
        letterSpacing: `${tokens.text.tracking.tight}em`,
        lineHeight: tokens.text.lineHeight.tight,
      },
      h2: {
        fontSize: `${tokens.text.size.lg}px`,
        fontWeight: tokens.font.weight.bold,
        letterSpacing: `${tokens.text.tracking.tight}em`,
        lineHeight: tokens.text.lineHeight.tight,
      },
      h3: {
        fontSize: `${tokens.text.size.md}px`,
        fontWeight: tokens.font.weight.semibold,
        lineHeight: tokens.text.lineHeight.snug,
      },
      subtitle1: {
        fontSize: `${tokens.text.size.base}px`,
        fontWeight: tokens.font.weight.semibold,
        lineHeight: tokens.text.lineHeight.snug,
      },
      body1: {
        fontSize: `${tokens.text.size.sm}px`,
        fontWeight: tokens.font.weight.medium,
        lineHeight: tokens.text.lineHeight.normal,
      },
      body2: {
        fontSize: '13px',
        fontWeight: tokens.font.weight.regular,
        lineHeight: tokens.text.lineHeight.normal,
      },
      caption: {
        fontSize: `${tokens.text.size.xs}px`,
        fontWeight: tokens.font.weight.regular,
        color: fg[3],
      },
      overline: {
        fontSize: `${tokens.text.size['2xs']}px`,
        fontWeight: tokens.font.weight.semibold,
        textTransform: 'uppercase' as const,
        letterSpacing: `${tokens.text.tracking.caps}em`,
        color: req(palette, 'purple-500'),
      },
      // Sentence case everywhere — no ALL-CAPS buttons.
      button: {
        fontSize: '15px',
        fontWeight: tokens.font.weight.bold,
        textTransform: 'none' as const,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: bg.app,
            color: muiPalette.text.primary,
            fontFamily: FONT_FAMILY,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          '::selection': {
            backgroundColor: req(palette, 'purple-200'),
            color: req(palette, 'purple-950'),
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.pill,
            fontWeight: tokens.font.weight.bold,
            transition: `transform ${DUR_FAST} ${EASE_OUT}, box-shadow ${DUR_BASE} ${EASE_OUT}, background-color ${DUR_BASE} ${EASE_OUT}`,
            '&:active': { transform: 'scale(0.97)' },
          },
          // Hover elevates xs -> md (handoff "Interactions & Behavior");
          // primary CTA gets the brand gradient + glow (the only glow site).
          contained: ({ theme, ownerState }) => {
            const v = theme.vars ?? theme;
            if (ownerState.color === 'primary') {
              return {
                background: `linear-gradient(135deg, ${v.palette.primary.main}, ${v.palette.primary.light})`,
                boxShadow: glow,
                '&:hover': { boxShadow: `${glow}, ${webCss.shadow.md}` },
              };
            }
            return {
              boxShadow: webCss.shadow.xs,
              '&:hover': { boxShadow: webCss.shadow.md },
            };
          },
          sizeSmall: { fontSize: '13px', padding: '8px 16px' },
          sizeMedium: { padding: '12px 22px' },
          sizeLarge: {
            fontSize: `${tokens.text.size.base}px`,
            padding: '15px 28px',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => {
            const v = theme.vars ?? theme;
            return {
              borderRadius: tokens.radius.md,
              backgroundColor: v.palette.background.paper,
              fontSize: '15px',
              transition: `box-shadow ${DUR_BASE} ${EASE_OUT}`,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: v.palette.divider,
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'var(--border-2)',
              },
              // Focus ring from the token (purple-500 @ 40%).
              '&.Mui-focused': { boxShadow: 'var(--focus-ring)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'var(--border-strong)',
                borderWidth: 1,
              },
            };
          },
          input: { padding: '15px 16px' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.pill,
            fontWeight: tokens.font.weight.semibold,
            fontSize: `${tokens.text.size.xs}px`,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          // Glass thumb: white + glass-style inset highlight.
          thumb: {
            backgroundColor: white,
            boxShadow: `${webCss.shadow.sm}, inset 0 1px 0 rgba(255, 255, 255, 0.9)`,
          },
          switchBase: ({ theme }) => {
            const v = theme.vars ?? theme;
            return {
              '&.Mui-checked + .MuiSwitch-track': {
                backgroundColor: v.palette.primary.main,
                opacity: 1,
              },
            };
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          rounded: { borderRadius: tokens.radius.lg },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: tokens.radius.lg, boxShadow: webCss.shadow.sm },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            ...glassSurface('deep'),
            borderRadius: tokens.radius.xl,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          // Bottom sheets: glass-deep, 28px top radius, rise over scrim.
          paper: ({ ownerState }) =>
            ownerState.anchor === 'bottom'
              ? {
                  ...glassSurface('deep'),
                  borderTopLeftRadius: tokens.radius.xl,
                  borderTopRightRadius: tokens.radius.xl,
                }
              : {},
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: { backgroundColor: bg.overlay },
        },
      },
    },
  });
}
