/**
 * ListRow — P1 composed (ds-05). Registry/list line item (Cadastros rows,
 * roster rows, destination-class picker rows).
 *
 * Anatomy: [root: row] > [leading? (avatar/checkbox slot)] [text column:
 *          title 13.5/650 + subtitle? 12/500 fg-3] [trailing? slot
 *          (badge / action)] [chevron?]
 * States: static / pressable (whole row is a button) / selected (brand-tint
 *         wash)
 * Tokens: bg-surface, border-1 (divider), fg-1/fg-3, brand-tint, space-3/4.
 * A11y: pressable rows are real `<button>`s labeled by the title.
 *
 * Cross-platform prop vocabulary: `title`, `subtitle`, `leading`, `trailing`,
 * `chevron`, `selected`, `onPress`.
 */

import type { MouseEventHandler, ReactNode } from 'react';
import { styled } from '@mui/material/styles';
import { tokens } from '../../../build/web/tokens.ts';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading slot — initials avatar, checkbox... */
  leading?: ReactNode;
  /** Trailing slot — status chip, icon action... */
  trailing?: ReactNode;
  /** Renders the disclosure chevron (navigational rows). */
  chevron?: boolean;
  /** Brand-tint selected wash (multi-select mode). */
  selected?: boolean;
  /** Presence makes the whole row a button. */
  onPress?: MouseEventHandler<HTMLElement>;
  className?: string;
}

const rowStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.space[3],
  width: '100%',
  textAlign: 'left',
  padding: '12px 14px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border-1)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  '&.ListRow-pressable': {
    cursor: 'pointer',
    transition: `background ${tokens.motion.duration.fast}ms`,
    '&:hover': { background: 'var(--bg-app)' },
  },
  '&.ListRow-selected': { background: 'var(--brand-tint)' },
  '&:last-of-type': { borderBottom: 'none' },
} as const;

const RootStatic = styled('div')(rowStyles);
const RootButton = styled('button')(rowStyles);

const TextColumn = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  minWidth: 0,
});

const Title = styled('span')({
  fontSize: '13.5px',
  fontWeight: 650,
  color: 'var(--fg-1)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const Subtitle = styled('span')({
  fontSize: '12px',
  fontWeight: tokens.font.weight.medium,
  color: 'var(--fg-3)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const Chevron = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--fg-4)"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron = false,
  selected = false,
  onPress,
  className,
}: ListRowProps) {
  const classes = [
    'ListRow-root',
    onPress ? 'ListRow-pressable' : null,
    selected ? 'ListRow-selected' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {leading ? <span className="ListRow-leading">{leading}</span> : null}
      <TextColumn>
        <Title className="ListRow-title">{title}</Title>
        {subtitle ? (
          <Subtitle className="ListRow-subtitle">{subtitle}</Subtitle>
        ) : null}
      </TextColumn>
      {trailing ? <span className="ListRow-trailing">{trailing}</span> : null}
      {chevron ? <Chevron /> : null}
    </>
  );

  if (onPress) {
    return (
      <RootButton type="button" className={classes} onClick={onPress}>
        {content}
      </RootButton>
    );
  }
  return <RootStatic className={classes}>{content}</RootStatic>;
}

export default ListRow;
