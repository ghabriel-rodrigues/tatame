/**
 * Toast — P0 composed (ds-05). Ephemeral confirmation pill.
 *
 * Anatomy: [root: fixed glass pill, horizontally centered above the bottom /
 *          tab-bar zone] > [message 13/600]
 * Behavior contract (handoff "Interactions & Behavior"): auto-hides after
 * ~2.6s (`duration` default 2600ms); announced politely via `role="status"`.
 * Motion: rises in with `dur-slow` (320ms) `ease-out`.
 * Tokens: glass.* (regular mixin), radius.pill, dur-slow/ease-out, fg-1.
 *
 * Glass rule: the toast is a floating interactive surface — it owns its
 * glass; never place it over another glass surface.
 */

import { useEffect } from 'react';
import { keyframes, styled } from '@mui/material/styles';
import { tokens } from '../../../build/web/tokens.ts';
import { glassSurface } from '../../theme/glass.ts';

export interface ToastProps {
  open: boolean;
  message: string;
  /** Called when the auto-hide timer elapses. */
  onClose?: () => void;
  /** Auto-hide delay in ms — contract default 2600 (~2.6s). */
  duration?: number;
  /** Distance from the viewport bottom in px (above the glass tab bar). */
  offsetBottom?: number;
  className?: string;
}

const rise = keyframes`
  from { opacity: 0; transform: translate(-50%, 10px); }
  to { opacity: 1; transform: translate(-50%, 0); }
`;

const Root = styled('div')(({ theme }) => {
  const v = theme.vars ?? theme;
  return {
    ...glassSurface('regular'),
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: theme.zIndex.snackbar,
    borderRadius: tokens.radius.pill,
    padding: '12px 20px',
    fontSize: '13px',
    fontWeight: tokens.font.weight.semibold,
    color: v.palette.text.primary,
    whiteSpace: 'nowrap',
    animation: `${rise} ${tokens.motion.duration.slow}ms cubic-bezier(${tokens.motion.ease.out.join(', ')})`,
  };
});

export function Toast({
  open,
  message,
  onClose,
  duration = 2600,
  offsetBottom = 96,
  className,
}: ToastProps) {
  useEffect(() => {
    if (!open || !onClose) return undefined;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, duration, onClose]);

  if (!open) return null;

  const classes = ['Toast-root', className].filter(Boolean).join(' ');
  return (
    <Root
      className={classes}
      role="status"
      aria-live="polite"
      style={{
        bottom: `calc(${offsetBottom}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {message}
    </Root>
  );
}

export default Toast;
