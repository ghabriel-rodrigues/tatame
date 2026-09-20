/**
 * TatameButton — P0 primitive (ds-05). Web executor (thin wrap over the
 * themed MuiButton; the base pill/press/glow styling lives in
 * `createTatameTheme`'s MuiButton overrides).
 *
 * Anatomy: [root: pill button] > [spinner? (loading)] [label]
 * Variants: `primary` (brand gradient + `--shadow-glow` CTA) | `secondary`
 *           (brand-tint wash) | `ghost` (transparent) | `danger`
 * Sizes: `sm` | `md` | `lg`
 * States: default / hover (shadow xs->md) / active (`scale(0.97)`) /
 *         disabled / loading (spinner + disabled, keeps width)
 * Tokens: radius.pill, shadow.{xs,md,glow}, purple scale via theme.vars,
 *         brand-tint, motion fast/out.
 *
 * Cross-platform prop vocabulary: `variant`, `size`, `label` (or children),
 * `disabled`, `loading`, `onPress` (mapped to `onClick` on web).
 */

import type { MouseEventHandler, ReactNode } from 'react';
import MuiButton from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';

export type TatameButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type TatameButtonSize = 'sm' | 'md' | 'lg';

export interface TatameButtonProps {
  variant?: TatameButtonVariant;
  size?: TatameButtonSize;
  /** Button text; `children` wins when both are given. */
  label?: string;
  children?: ReactNode;
  disabled?: boolean;
  /** Shows a spinner and disables interaction; announced via `aria-busy`. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Platform-neutral press handler (web maps it to `onClick`). */
  onPress?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

const MUI_SIZE: Record<TatameButtonSize, 'small' | 'medium' | 'large'> = {
  sm: 'small',
  md: 'medium',
  lg: 'large',
};

const Root = styled(MuiButton)(({ theme }) => {
  const v = theme.vars ?? theme;
  return {
    // `secondary` = soft brand-tint wash (NOT MUI's pink secondary slot).
    '&.TatameButton-secondary': {
      // `background` shorthand (not backgroundColor) so the theme's primary
      // gradient image is fully reset.
      background: 'var(--brand-tint)',
      color: v.palette.primary.main,
      boxShadow: 'none',
      '&:hover': { background: 'var(--purple-100)', boxShadow: 'none' },
    },
    '&.TatameButton-ghost': {
      color: v.palette.primary.main,
    },
    '&.TatameButton-danger': {
      backgroundColor: v.palette.error.main,
      color: v.palette.error.contrastText,
    },
  };
});

export function TatameButton({
  variant = 'primary',
  size = 'md',
  label,
  children,
  disabled = false,
  loading = false,
  fullWidth = false,
  onPress,
  type = 'button',
  className,
}: TatameButtonProps) {
  const muiVariant = variant === 'ghost' ? 'text' : 'contained';
  const muiColor = variant === 'danger' ? 'error' : 'primary';
  const classes = ['TatameButton-root', `TatameButton-${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Root
      className={classes}
      variant={muiVariant}
      color={muiColor}
      size={MUI_SIZE[size]}
      disabled={disabled || loading}
      fullWidth={fullWidth}
      onClick={onPress}
      type={type}
      aria-busy={loading || undefined}
      startIcon={
        loading ? (
          <CircularProgress color="inherit" size={16} thickness={5} />
        ) : undefined
      }
    >
      {children ?? label}
    </Root>
  );
}

export default TatameButton;
