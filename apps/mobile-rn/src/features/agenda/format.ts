/**
 * Agenda & calendar pure logic (AGD.5-6, spec 007). Everything here is
 * client-side *expansion* of server truth, never a rule recompute: the API
 * returns weekly recurrence buckets and per-item flags; these helpers turn
 * them into month dots, day lists and PT-BR labels. Mirrors the prototype's
 * own AULAS_SEM-keyed logic.
 */

import type { CalendarBuckets, CalendarClassItem } from './types';

type LevelFields = {
  ageMin: number | null;
  ageMax: number | null;
  minBelt?: { name: string } | null;
  maxBelt?: { name: string } | null;
};

/**
 * Level chip label, composed exactly like the existing turma surfaces:
 * belt range, Kids age range, or "Todas as faixas" (spec 007 contract note).
 */
export function levelChipLabel(item: LevelFields): string {
  const min = item.minBelt ?? null;
  const max = item.maxBelt ?? null;
  if (min && max) return min.name === max.name ? min.name : `${min.name} a ${max.name}`;
  if (min || max) return (min ?? max)!.name;
  if (item.ageMin !== null && item.ageMax !== null) {
    return `${item.ageMin} a ${item.ageMax} anos`;
  }
  return 'Todas as faixas';
}

/** "12 de 20 vagas" — occupancy is always N de M (capacity is NOT NULL). */
export function vagasLabel(occupancy: { active: number; capacity: number }): string {
  return `${occupancy.active} de ${occupancy.capacity} vagas`;
}

/** "19:00 – 20:00" from the server-derived start/end pair. */
export function timeRangeLabel(startTime: string, endTime: string): string {
  return `${startTime} – ${endTime}`;
}

/** The check-in affordance rule (spec 007 story 6-9): button iff today and unchecked. */
export function showCheckinButton(isToday: boolean, checkedIn: boolean): boolean {
  return isToday && !checkedIn;
}

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

const WEEKDAY_LONG = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

/** "Agosto 2026" from the echoed "YYYY-MM" month (calendar header). */
export function monthTitlePt(month: string): string {
  const [, monthPart] = month.split('-');
  const index = Number(monthPart) - 1;
  const name = MONTH_LONG[index] ?? '';
  const [yearPart] = month.split('-');
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${yearPart}`;
}

/** "Domingo, 2 de agosto" — the selected-day heading (aluno-08/professor-04). */
export function dayHeadingPt(year: number, month: number, day: number): string {
  const weekday = WEEKDAY_LONG[new Date(year, month - 1, day).getDay()] ?? '';
  return `${weekday}, ${day} de ${MONTH_LONG[month - 1] ?? ''}`;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
type Weekday = (typeof WEEKDAYS)[number];

/** API weekday (0 = Sunday … 6 = Saturday) of a calendar date. */
export function weekdayOf(year: number, month: number, day: number): Weekday {
  return new Date(year, month - 1, day).getDay() as Weekday;
}

/**
 * Weekday buckets → per-day dot marks over the rendered month (spec 007:
 * "class dot iff that weekday's bucket is non-empty"). Events carry no
 * dates in this phase, so no event dots are expanded yet — the marks shape
 * is ready for them.
 */
export function expandMonthMarks(
  buckets: CalendarBuckets,
  year: number,
  month: number,
): Record<number, { classDot: boolean }> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const marks: Record<number, { classDot: boolean }> = {};
  for (let day = 1; day <= daysInMonth; day += 1) {
    if ((buckets[weekdayOf(year, month, day)] ?? []).length > 0) {
      marks[day] = { classDot: true };
    }
  }
  return marks;
}

/**
 * Selected-day agenda: the weekday's bucket sorted by start time (spec 007
 * story 17/26 — events merge in when their phase lands).
 */
export function dayAgendaItems(buckets: CalendarBuckets, weekday: Weekday): CalendarClassItem[] {
  return [...(buckets[weekday] ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
}
