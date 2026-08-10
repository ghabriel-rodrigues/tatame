/**
 * Billing display helpers (BIL.16-18). Pure formatting only — amounts are
 * integer cents from the API, status/overdue are server-derived facts;
 * nothing here recomputes money rules. PT-BR copy per the handoff
 * (aluno-12…15, responsavel-04/05); code stays English per charter.
 */

import type { ChipTone } from '@tatame/design-system/native';
import type {
  ChargeView,
  ChargeWithPayments,
  PaymentMethod,
  PaymentView,
  WalletPlan,
} from './types';

const MONTH_LONG = [
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

/** "R$ 1.234,56" from integer cents (pt-BR grouping, no Intl dependency). */
export function formatBRL(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = (abs % 100).toString().padStart(2, '0');
  return `${sign}R$ ${int},${dec}`;
}

/** Month name from an ISO date/date-time string, parsed without Date (TZ-safe). */
export function monthNamePt(iso: string): string {
  const month = Number(iso.slice(5, 7));
  return MONTH_LONG[month - 1] ?? '';
}

/** "10 de agosto" from an ISO date. */
export function longDayMonthPt(iso: string): string {
  return `${Number(iso.slice(8, 10))} de ${monthNamePt(iso)}`;
}

/** "08/07" from an ISO date or date-time. */
export function shortDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "Mensalidade · agosto" — competência month, due-date fallback. */
export function mensalidadeTitle(charge: {
  periodStart?: string | null;
  dueDate: string;
}): string {
  return `Mensalidade · ${monthNamePt(charge.periodStart ?? charge.dueDate)}`;
}

/**
 * Histórico row title. Plan charges carry a competência (`periodStart`) →
 * "Mensalidade · agosto"; event/order-origin charges have none (spec
 * 008/009 — they surface in the same histórico via billing) → the neutral
 * "Pagamento avulso" instead of a fabricated mensalidade label.
 */
export function historyTitle(entry: {
  periodStart?: string | null;
  paidAt?: string | null;
}): string {
  if (entry.periodStart) return `Mensalidade · ${monthNamePt(entry.periodStart)}`;
  return 'Pagamento avulso';
}

/** "Vence em 10 de agosto" (aluno-12 mensalidade card). */
export function dueLabel(dueDate: string): string {
  return `Vence em ${longDayMonthPt(dueDate)}`;
}

export const RECURRENCE_LABELS = {
  monthly: 'mensal',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  yearly: 'anual',
} as const;

/** "Plano mensal recorrente · R$ 180,00" — the Carteira header line. */
export function planHeaderLine(plan: WalletPlan): string {
  return `Plano ${RECURRENCE_LABELS[plan.recurrence]} recorrente · ${formatBRL(plan.amountCents)}`;
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  card: 'Cartão',
};

/**
 * "Pago em 08/07 · Pix" — histórico line; the mandate variant renders
 * "Pago em 02/08 via recorrência no cartão" (story 19).
 */
export function paidLine(
  method: PaymentMethod,
  paidAt: string | null | undefined,
  viaMandate = false,
): string {
  const date = paidAt ? shortDayMonth(paidAt) : '—';
  if (viaMandate && method === 'card') return `Pago em ${date} via recorrência no cartão`;
  return `Pago em ${date} · ${METHOD_LABELS[method]}`;
}

/** Status chip mapping (Em aberto / Em atraso / Paga) — server truth only. */
export function chargeChip(charge: Pick<ChargeView, 'status' | 'overdue'>): {
  label: string;
  tone: ChipTone;
} {
  if (charge.status === 'paid') return { label: 'Paga', tone: 'success' };
  if (charge.status === 'refunded') return { label: 'Reembolsada', tone: 'neutral' };
  if (charge.status === 'canceled') return { label: 'Cancelada', tone: 'neutral' };
  if (charge.overdue || charge.status === 'overdue') return { label: 'Em atraso', tone: 'danger' };
  return { label: 'Em aberto', tone: 'warning' };
}

/** A charge accepts new payment attempts only while open/overdue. */
export function isPayable(charge: Pick<ChargeView, 'status'>): boolean {
  return charge.status === 'open' || charge.status === 'overdue';
}

/**
 * "Cobrança recorrente ativa. A próxima mensalidade chega em 1 de setembro
 * com aviso automático." (aluno-12 recurrence banner, story 6).
 */
export function recurrenceBannerLine(nextChargeDueDate?: string | null): string {
  const base = 'Cobrança recorrente ativa.';
  if (!nextChargeDueDate) return base;
  return `${base} A próxima mensalidade chega em ${longDayMonthPt(nextChargeDueDate)} com aviso automático.`;
}

/** Reads a string field from the render-ready provider snapshot. */
export function providerField(payment: PaymentView, key: string): string | null {
  const data = (payment.providerData ?? {}) as Record<string, unknown>;
  const value = data[key];
  return typeof value === 'string' ? value : null;
}

/** The simulate affordance renders ONLY for the simulated provider (story 44). */
export function isSimulated(payment: PaymentView): boolean {
  return payment.provider === 'simulated';
}

/** The settled payment of a charge (receipt target), newest attempt wins. */
export function settledPayment(charge: ChargeWithPayments): PaymentView | null {
  const settled = charge.payments.filter(
    (payment) => payment.status === 'succeeded' || payment.status === 'refunded',
  );
  return settled[settled.length - 1] ?? null;
}

/* ---------------- card form masks (display metadata only) ------------- */

/** "4242 4242 4242 4242" while typing — client-side display mask only. */
export function maskCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/** Display last4 (the ONLY number-derived field ever posted). */
export function cardLast4(masked: string): string {
  const digits = masked.replace(/\D/g, '');
  return digits.slice(-4);
}

/** "MM/AA" while typing. */
export function maskExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Card form completeness — display fields only, no brand validation. */
export function cardFormValid(fields: {
  number: string;
  holderName: string;
  expiry: string;
  cvv: string;
}): boolean {
  return (
    fields.number.replace(/\D/g, '').length >= 13 &&
    fields.holderName.trim().length > 0 &&
    /^\d{2}\/\d{2}$/.test(fields.expiry) &&
    fields.cvv.length >= 3
  );
}
