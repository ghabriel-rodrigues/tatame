/**
 * Ranking display helpers (REP.11, spec 013). Pure formatting over the
 * server payload — counts, positions and windows are all derived
 * server-side; bar widths are the only client-derived figure (count ÷
 * leader count, per the recorded decision).
 */

import type { RankingBy, RankingRow, ReportWindow } from './types';

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

/** Month name from the window's tenant-local first day ("2026-08-01" → "agosto"). */
export function windowMonthPt(window: ReportWindow): string {
  const month = Number(window.start.slice(5, 7));
  return MONTH_LONG[month - 1] ?? '';
}

/** Capitalized month ("Agosto") for the aluno-06 subtitle. */
export function windowMonthCapPt(window: ReportWindow): string {
  const month = windowMonthPt(window);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)}`;
}

/** "17 aulas" / "1 aula" / "4 eventos" / "1 evento" — trailing count. */
export function countLabel(count: number, by: RankingBy): string {
  if (by === 'lessons') return `${count} ${count === 1 ? 'aula' : 'aulas'}`;
  return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
}

/** "2º" — pt-BR ordinal for the home entry card. */
export function positionOrdinal(position: number): string {
  return `${position}º`;
}

/** Bar fraction scaled to the leader (0 when the leader has no count). */
export function barFraction(row: RankingRow, leaderCount: number): number {
  if (leaderCount <= 0) return 0;
  return Math.min(1, row.count / leaderCount);
}

/**
 * Header subtitle: "Agosto · sua academia" (aluno-06) / "Julho · <academia>"
 * on the lessons segment; the events segment reads the fair-window line
 * (aluno-07 / professor-06).
 */
export function rankingSubtitle(
  by: RankingBy,
  window: ReportWindow,
  academyName: string | null,
): string {
  if (by === 'events') return 'Participações em eventos no semestre';
  return `${windowMonthCapPt(window)} · ${academyName ?? 'sua academia'}`;
}
