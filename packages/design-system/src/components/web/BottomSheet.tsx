/**
 * BottomSheet — P1 composed (ds-05). Modal sheet rising from the bottom edge
 * (creation forms, "Mover para turma" destination picker, pickers).
 *
 * Anatomy: [scrim] [root: bottom-anchored surface, radius-xl top corners] >
 *          [grabber] [header?: title 17/700 + subtitle 12.5 fg-3] [content]
 * Behavior: dismiss via scrim tap / Esc (MUI Modal contract). Web executor
 * wraps the themed MUI Drawer (anchor bottom); sheet is centered and capped
 * at 560px on desktop so the phone-designed forms hold their proportion.
 * Tokens: radius.xl, bg-surface, shadow.md, border-2 (grabber), fg-1/fg-3.
 * A11y: `role="dialog"` (Drawer modal) labeled by the title.
 *
 * Cross-platform prop vocabulary: `open`, `onClose`, `title`, `subtitle`,
 * `children`.
 */

import type { ReactNode } from 'react';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { tokens } from '../../../build/web/tokens.ts';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}

const Sheet = styled('div')({
  width: '100%',
  maxWidth: 560,
  margin: '0 auto',
  padding: '10px 20px 28px',
  boxSizing: 'border-box',
});

const Grabber = styled('div')({
  width: 44,
  height: 5,
  borderRadius: tokens.radius.pill,
  background: 'var(--border-2)',
  margin: '0 auto 14px',
});

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: BottomSheetProps) {
  const classes = ['BottomSheet-root', className].filter(Boolean).join(' ');
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      className={classes}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': title,
          sx: {
            borderTopLeftRadius: `${tokens.radius.xl}px`,
            borderTopRightRadius: `${tokens.radius.xl}px`,
            background: 'var(--bg-surface)',
            maxHeight: '86vh',
          },
        },
      }}
    >
      <Sheet className="BottomSheet-sheet">
        <Grabber className="BottomSheet-grabber" aria-hidden />
        {title ? (
          <Typography
            component="h2"
            className="BottomSheet-title"
            sx={{ fontSize: 17, fontWeight: 700, color: 'var(--fg-1)' }}
          >
            {title}
          </Typography>
        ) : null}
        {subtitle ? (
          <Typography
            className="BottomSheet-subtitle"
            sx={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: '2px' }}
          >
            {subtitle}
          </Typography>
        ) : null}
        <div className="BottomSheet-content" style={{ marginTop: title ? 16 : 0 }}>
          {children}
        </div>
      </Sheet>
    </Drawer>
  );
}

export default BottomSheet;
