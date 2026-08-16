import { ErrorCodes, problem } from '../../../common/problem.js';
import { localDate } from '../../attendance/lib/time.js';

/**
 * Report/ranking windows (spec 013) — all computed on tenant-local days
 * (America/Sao_Paulo, the Phase-4 single-country decision). Months are
 * calendar months; semesters are calendar halves (Jan–Jun / Jul–Dec), used
 * identically by the Graduações report and the Por eventos ranking.
 */

export interface DateWindow {
  /** `YYYY-MM` for months, `YYYY-S1`/`YYYY-S2` for semesters. */
  label: string;
  /** Inclusive tenant-local first day, `YYYY-MM-DD`. */
  start: string;
  /** Exclusive tenant-local end day, `YYYY-MM-DD`. */
  endExclusive: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Validates the `month=YYYY-MM` query param; defaults to the current month. */
export function requireMonth(month?: string): string {
  if (month === undefined) return localDate().slice(0, 7);
  if (!MONTH_RE.test(month)) {
    throw problem(422, ErrorCodes.VALIDATION_FAILED, 'Invalid month — expected YYYY-MM', [
      { field: 'month', messages: ['month must match YYYY-MM'] },
    ]);
  }
  return month;
}

/** Calendar-month window containing `month` (already validated). */
export function monthWindow(month: string): DateWindow {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  return {
    label: month,
    start: `${month}-01`,
    endExclusive: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  };
}

/** Calendar-half window containing `month` (Jan–Jun / Jul–Dec). */
export function semesterWindow(month: string): DateWindow {
  const year = month.slice(0, 4);
  const first = Number(month.slice(5, 7)) <= 6;
  return first
    ? { label: `${year}-S1`, start: `${year}-01-01`, endExclusive: `${year}-07-01` }
    : { label: `${year}-S2`, start: `${year}-07-01`, endExclusive: `${Number(year) + 1}-01-01` };
}
