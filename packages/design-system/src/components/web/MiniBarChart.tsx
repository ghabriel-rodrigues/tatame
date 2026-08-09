/**
 * MiniBarChart — P2 chart (ds-05 inventory). The "Receita mensal" 6-month
 * bar series on the admin Visão financeira (admin-02). Pure CSS — no chart
 * library; heights scale against the series maximum.
 *
 * Anatomy: [root: column row] > per point [value caption 10/600 fg-3]
 *          [bar: rounded column — brand-tint wash, highlighted point gets
 *          the solid brand gradient] [label caption 10/700 fg-3 caps]
 * States: highlight (defaults to the last point — the current month).
 * Tokens: brand-1/2, brand-tint, fg-3, radius (6), space-2.
 * A11y: root is a labeled `role="img"`; each bar carries an aria-label
 *       ("JUL: R$ 24,4 mil") for assistive reading.
 *
 * Cross-platform prop vocabulary: `data`, `formatValue`, `highlightIndex`,
 * `height`, `ariaLabel` (RN/Compose/SwiftUI parity tracked as README debt).
 */

import { styled, type Theme } from '@mui/material/styles';
import { tokens } from '../../../build/web/tokens.ts';

export interface MiniBarChartPoint {
  /** Short axis label ("FEV" … "JUL"). */
  label: string;
  /** Non-negative magnitude (e.g. integer cents). */
  value: number;
}

export interface MiniBarChartProps {
  data: MiniBarChartPoint[];
  /** Caption above each bar; omit to hide the value captions. */
  formatValue?: (value: number) => string;
  /** Highlighted point; defaults to the last (current month). */
  highlightIndex?: number;
  /** Bar-area height in px. */
  height?: number;
  ariaLabel?: string;
  className?: string;
}

const MIN_BAR_HEIGHT = 4;

const Root = styled('div')({
  display: 'flex',
  alignItems: 'flex-end',
  gap: tokens.space[2],
});

const Column = styled('div')({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
});

const Bar = styled('span')(({ theme }: { theme: Theme }) => {
  const v = theme.vars ?? theme;
  return {
    display: 'block',
    width: '100%',
    maxWidth: 26,
    borderRadius: 6,
    background: 'var(--brand-tint)',
    '&.MiniBarChart-highlight': {
      background: `linear-gradient(180deg, ${v.palette.primary.main}, ${v.palette.primary.light})`,
    },
  };
});

const Caption = styled('span')({
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--fg-3)',
  whiteSpace: 'nowrap',
});

const Label = styled('span')({
  fontSize: '10px',
  fontWeight: tokens.font.weight.bold,
  color: 'var(--fg-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export function MiniBarChart({
  data,
  formatValue,
  highlightIndex,
  height = 96,
  ariaLabel,
  className,
}: MiniBarChartProps) {
  const max = Math.max(...data.map((point) => point.value), 0);
  const highlighted = highlightIndex ?? data.length - 1;
  const classes = ['MiniBarChart-root', className].filter(Boolean).join(' ');

  return (
    <Root className={classes} role="img" aria-label={ariaLabel ?? 'Gráfico de barras'}>
      {data.map((point, index) => {
        const ratio = max > 0 ? point.value / max : 0;
        const barHeight = Math.max(Math.round(ratio * height), MIN_BAR_HEIGHT);
        const formatted = formatValue ? formatValue(point.value) : String(point.value);
        return (
          <Column key={`${point.label}-${index}`} className="MiniBarChart-column">
            {formatValue ? (
              <Caption className="MiniBarChart-value">{formatted}</Caption>
            ) : null}
            <Bar
              className={[
                'MiniBarChart-bar',
                index === highlighted ? 'MiniBarChart-highlight' : null,
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ height: `${barHeight}px` }}
              aria-label={`${point.label}: ${formatted}`}
            />
            <Label className="MiniBarChart-label">{point.label}</Label>
          </Column>
        );
      })}
    </Root>
  );
}

export default MiniBarChart;
