/**
 * ScreenHeader — P0 composed (ds-05). Every persona's screen opener.
 *
 * Anatomy: [root: header row] > [back? (circular ghost icon button)]
 *          [text column: eyebrow? (overline 11/600 caps, brand-2) +
 *          title (h1 25/700, tracking -0.02em) + subtitle? (body 14, fg-3)]
 *          [trailing? slot (icon buttons / avatar)]
 * Variants: with/without back, with/without eyebrow — composition, not
 *           variant strings.
 * Tokens: typography h1/overline/body1, fg-1/fg-3, brand-2, space-4.
 * A11y: `<header>` landmark, title is a real `<h1>`, back button labeled
 *       "Voltar".
 */

import type { ReactNode } from 'react';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { tokens } from '../../../build/web/tokens.ts';

export interface ScreenHeaderProps {
  title: string;
  /** Uppercase context line above the title (date, section). */
  eyebrow?: string;
  subtitle?: string;
  /** Renders the back button when provided. */
  onBack?: () => void;
  /** Trailing accessory slot (notification bell, avatar...). */
  trailing?: ReactNode;
  className?: string;
}

const Root = styled('header')({
  display: 'flex',
  alignItems: 'center',
  gap: tokens.space[3],
});

const TextColumn = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  minWidth: 0,
});

const BackIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  onBack,
  trailing,
  className,
}: ScreenHeaderProps) {
  const classes = ['ScreenHeader-root', className].filter(Boolean).join(' ');
  return (
    <Root className={classes}>
      {onBack ? (
        <IconButton
          aria-label="Voltar"
          onClick={onBack}
          className="ScreenHeader-back"
        >
          <BackIcon />
        </IconButton>
      ) : null}
      <TextColumn>
        {eyebrow ? (
          <Typography variant="overline" className="ScreenHeader-eyebrow">
            {eyebrow}
          </Typography>
        ) : null}
        <Typography variant="h1" className="ScreenHeader-title">
          {title}
        </Typography>
        {subtitle ? (
          <Typography
            variant="body1"
            color="text.secondary"
            className="ScreenHeader-subtitle"
          >
            {subtitle}
          </Typography>
        ) : null}
      </TextColumn>
      {trailing ? (
        <div className="ScreenHeader-trailing">{trailing}</div>
      ) : null}
    </Root>
  );
}

export default ScreenHeader;
