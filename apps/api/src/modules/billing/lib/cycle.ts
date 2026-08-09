import type { billingRecurrence } from '@tatame/db';

export type BillingRecurrence = (typeof billingRecurrence.enumValues)[number];

/** Competência window of one plan cycle + its vencimento. All YYYY-MM-DD. */
export interface CycleWindow {
  periodStart: string;
  periodEnd: string;
  dueDate: string;
}

/** Months covered by one cycle of the recurrence. */
const CYCLE_MONTHS: Record<BillingRecurrence, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First month (1-12) of the cycle containing `month` for the recurrence. */
function cycleStartMonth(recurrence: BillingRecurrence, month: number): number {
  const len = CYCLE_MONTHS[recurrence];
  return Math.floor((month - 1) / len) * len + 1;
}

/**
 * The competência window containing the tenant-local day `todayIso`
 * (YYYY-MM-DD): calendar-aligned cycles (monthly = the month, quarterly =
 * Jan/Apr/Jul/Oct starts, semiannual = Jan/Jul, yearly = the year), with the
 * due date on the plan's `due_day` (1-28, so always a valid date) inside the
 * cycle's first month. This is the window the materialization idempotency key
 * `(tenant, student, plan, period_start)` is computed against.
 */
export function currentCycle(
  recurrence: BillingRecurrence,
  dueDay: number,
  todayIso: string,
): CycleWindow {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const startMonth = cycleStartMonth(recurrence, month);
  const len = CYCLE_MONTHS[recurrence];
  const endMonth = startMonth + len - 1;
  return {
    periodStart: `${year}-${pad(startMonth)}-01`,
    periodEnd: `${year}-${pad(endMonth)}-${pad(lastDayOfMonth(year, endMonth))}`,
    dueDate: `${year}-${pad(startMonth)}-${pad(dueDay)}`,
  };
}

/**
 * Due date of the cycle after the one containing `todayIso` — the recurrence
 * banner's "a próxima mensalidade chega em …".
 */
export function nextCycleDueDate(
  recurrence: BillingRecurrence,
  dueDay: number,
  todayIso: string,
): string {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const len = CYCLE_MONTHS[recurrence];
  const start = cycleStartMonth(recurrence, month) + len;
  const rolledYear = year + Math.floor((start - 1) / 12);
  const rolledMonth = ((start - 1) % 12) + 1;
  return `${rolledYear}-${pad(rolledMonth)}-${pad(dueDay)}`;
}

/** First day of the month `offset` months from the month of `todayIso`. */
export function monthStart(todayIso: string, offset = 0): string {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7)) - 1 + offset;
  const rolledYear = year + Math.floor(month / 12);
  const rolledMonth = ((month % 12) + 12) % 12;
  return `${rolledYear}-${pad(rolledMonth + 1)}-01`;
}

/** YYYY-MM of the month `offset` months from the month of `todayIso`. */
export function monthKey(todayIso: string, offset = 0): string {
  return monthStart(todayIso, offset).slice(0, 7);
}
