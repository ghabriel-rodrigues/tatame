/**
 * SegmentedControl — P1 composed (ds-05). Section switcher (admin Cadastros
 * segments, professor/aluno filters).
 *
 * Anatomy: [root: pill track (bg-app wash)] > N × [segment button 12.5/600]
 * States: idle segment (fg-3) / selected (bg-surface fill + shadow-xs +
 *         fg-1) / disabled
 * Tokens: radius.pill, bg-app, bg-surface, shadow.xs, fg-1/fg-3, motion fast.
 * A11y: `role="tablist"` + `role="tab"`/`aria-selected` — the pattern of the
 *       handoff prototypes' segment rows.
 *
 * Cross-platform prop vocabulary: `options` ({value,label}[]), `value`,
 * `onChange`, `ariaLabel`.
 */

import { styled } from '@mui/material/styles';
import { tokens, webCss } from '../../../build/web/tokens.ts';

export interface SegmentedControlOption<V extends string = string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string = string> {
  options: ReadonlyArray<SegmentedControlOption<V>>;
  value: V;
  onChange: (value: V) => void;
  ariaLabel: string;
  className?: string;
}

const Track = styled('div')({
  display: 'flex',
  gap: 2,
  padding: 3,
  borderRadius: tokens.radius.pill,
  background: 'var(--bg-app)',
  border: '1px solid var(--border-1)',
  width: 'fit-content',
  maxWidth: '100%',
  overflowX: 'auto',
});

const Segment = styled('button')({
  border: 'none',
  background: 'transparent',
  borderRadius: tokens.radius.pill,
  padding: '7px 14px',
  fontSize: '12.5px',
  fontWeight: tokens.font.weight.semibold,
  fontFamily: 'inherit',
  color: 'var(--fg-3)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: `background ${tokens.motion.duration.fast}ms, color ${tokens.motion.duration.fast}ms`,
  '&[aria-selected="true"]': {
    background: 'var(--bg-surface)',
    color: 'var(--fg-1)',
    boxShadow: webCss.shadow.xs,
  },
});

export function SegmentedControl<V extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<V>) {
  const classes = ['SegmentedControl-root', className]
    .filter(Boolean)
    .join(' ');
  return (
    <Track className={classes} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <Segment
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className="SegmentedControl-segment"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Segment>
      ))}
    </Track>
  );
}

export default SegmentedControl;
