/**
 * EmptyState — P1 composed (ds-05). Zero-data panel for lists and rosters.
 *
 * Anatomy: [root: centered column] > [icon? slot] [title 15/700]
 *          [description? 13 fg-3] [action? slot]
 * Tokens: fg-1/fg-3, space-4/5.
 * A11y: plain text content — no live region (empty is a steady state).
 *
 * Cross-platform prop vocabulary: `title`, `description`, `icon`, `action`.
 */

import type { ReactNode } from 'react';
import { styled } from '@mui/material/styles';
import { tokens } from '../../../build/web/tokens.ts';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Decorative leading slot (emoji/icon). */
  icon?: ReactNode;
  /** Call-to-action slot (usually a TatameButton). */
  action?: ReactNode;
  className?: string;
}

const Root = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: tokens.space[2],
  padding: '32px 20px',
  textAlign: 'center',
});

const Title = styled('p')({
  margin: 0,
  fontSize: '15px',
  fontWeight: tokens.font.weight.bold,
  color: 'var(--fg-1)',
});

const Description = styled('p')({
  margin: 0,
  fontSize: '13px',
  color: 'var(--fg-3)',
  maxWidth: 360,
});

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  const classes = ['EmptyState-root', className].filter(Boolean).join(' ');
  return (
    <Root className={classes}>
      {icon ? (
        <span className="EmptyState-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <Title className="EmptyState-title">{title}</Title>
      {description ? (
        <Description className="EmptyState-description">{description}</Description>
      ) : null}
      {action ? <span className="EmptyState-action">{action}</span> : null}
    </Root>
  );
}

export default EmptyState;
