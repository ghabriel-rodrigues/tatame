/**
 * Billing display helpers (BIL.13-15). Pure pt-BR formatting over the API's
 * integer-cents contract — aggregates, statuses and delinquency all arrive
 * server-derived; nothing here recomputes money truth.
 */
import type { BillingRecurrence } from '@tatame/shared';

/** Intl emits U+00A0 after "R$"; plain spaces keep copy and tests aligned. */
function plainSpaces(text: string): string {
  return text.replace(/\u00A0/g, ' ');
}

/** "R$ 180,00" — full pt-BR currency from integer cents. */
export function formatBRL(cents: number): string {
  return plainSpaces(
    (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }),
  );
}

/** "R$ 24.360" — whole-real display (hero and tile values per the handoff). */
export function formatBRLWhole(cents: number): string {
  return plainSpaces(
    (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }),
  );
}

/** "R$ 163,4 mil" — compact display (hero "no ano", chart captions). */
export function formatBRLCompact(cents: number): string {
  return plainSpaces(
    (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1,
    }),
  );
}

/** "6,4%" — pt-BR percentage from the API's 0-100 number. */
export function formatPct(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** "julho" from a "2026-07" period. */
export function monthName(period: string): string {
  const month = Number(period.slice(5, 7));
  return MONTH_NAMES[month - 1] ?? period;
}

/** "JUL" — 3-letter chart axis label from a "2026-07" period. */
export function monthShort(period: string): string {
  return monthName(period).slice(0, 3).toUpperCase();
}

/** The "2026-08" period following a "2026-07" period. */
export function nextPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const next =
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return `${next.year}-${String(next.month).padStart(2, '0')}`;
}

/** "Dia 10 de agosto" — vencimento group header from an ISO due date. */
export function dueDayLabel(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10));
  return `Dia ${day} de ${monthName(isoDate)}`;
}

/** "05/07/2026" from an ISO date. */
export function shortDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Whole days past due from an ISO due date (0 floor — never negative). */
export function daysOverdue(
  isoDueDate: string,
  today: Date = new Date(),
): number {
  const due = new Date(`${isoDueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  const diff = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  return Math.max(diff, 0);
}

/** Handoff recurrence chips (mensal/trimestral/semestral/anual). */
export const RECURRENCE_LABELS: Record<BillingRecurrence, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
};

/** "1 cobrança" / "3 cobranças". */
export function chargesCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'cobrança' : 'cobranças'}`;
}

/** "Mensal · R$ 180,00" — plan option label on the student selects. */
export function planOptionLabel(plan: {
  name: string;
  amountCents: number;
}): string {
  return `${plan.name} · ${formatBRL(plan.amountCents)}`;
}

/**
 * Parses a pt-BR money input ("180", "180,00", "R$ 1.234,56") into integer
 * cents; null when the text is not a valid positive amount.
 */
export function parseBRLInput(text: string): number | null {
  const normalized = text
    .replace(/R\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (normalized === '' || !/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 ? cents : null;
}

/** "180,00" — prefill for the valor input from integer cents. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
