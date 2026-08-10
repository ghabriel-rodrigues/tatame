/**
 * Notifications pure logic (NOT.8-9, spec 010): the relative PT-BR
 * timestamp the aluno-20/responsavel-09 cards render top-right —
 * Hoje / Ontem / weekday short (last week) / month abbreviation (older).
 * Client-side from `createdAt` per the spec's Further Notes.
 */

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

const MONTH_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 86_400_000;

/**
 * "Hoje" (same calendar day) / "Ontem" / "Seg" (within the last 7 days) /
 * "Jun" (older) — the prototype's 11px trailing label.
 */
export function relativeDayPt(createdAt: string, now: Date = new Date()): string {
  const created = new Date(createdAt);
  const dayDiff = Math.round((startOfDay(now) - startOfDay(created)) / DAY_MS);
  if (dayDiff <= 0) return 'Hoje';
  if (dayDiff === 1) return 'Ontem';
  if (dayDiff < 7) return WEEKDAY_SHORT[created.getDay()] ?? '';
  return MONTH_SHORT[created.getMonth()] ?? '';
}
