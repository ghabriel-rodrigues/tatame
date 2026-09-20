/**
 * Enrollment display helpers (ENR.17-20). Pure formatting only — occupancy,
 * Lotada, badges and the age suggestion are server-derived; nothing here
 * recomputes rules. Mirrors the web slice's format.ts (apps/web).
 */

import type { ScheduleSlotView } from '@tatame/shared';

/** 0 = Domingo … 6 = Sábado (API weekday contract). */
export const WEEKDAY_SHORT = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
] as const;

/** Weekday chips rendered Monday-first, like the handoff (Seg … Dom). */
export const WEEKDAY_CHIP_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

function sortedDays(schedules: ScheduleSlotView[]): string[] {
  const days = [...schedules]
    .sort(
      (a, b) =>
        WEEKDAY_CHIP_ORDER.indexOf(a.weekday as 1) -
        WEEKDAY_CHIP_ORDER.indexOf(b.weekday as 1),
    )
    .map((slot) => WEEKDAY_SHORT[slot.weekday] ?? '?');
  return [...new Set(days)];
}

/** "19:00 – 20:00" from a slot's start + duration (professor-08 header). */
export function scheduleTimeRange(slot: ScheduleSlotView): string {
  const [hours = 0, minutes = 0] = slot.startTime.split(':').map(Number);
  const total = hours * 60 + minutes + slot.durationMinutes;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${slot.startTime} – ${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/** "Seg · Qua · Sex 19:00 – 20:00" — the turmas card schedule line. */
export function scheduleSummary(schedules: ScheduleSlotView[]): string {
  const first = schedules[0];
  if (!first) return 'Sem horário';
  return `${sortedDays(schedules).join(' · ')} ${scheduleTimeRange(first)}`;
}

/** "Kids · Ter e Qui 18:00" — the suggestion chip label (responsavel-08). */
export function suggestionLabel(
  name: string,
  schedules: ScheduleSlotView[],
): string {
  const first = schedules[0];
  if (!first) return name;
  const days = sortedDays(schedules);
  const joined = days.length === 2 ? days.join(' e ') : days.join(' · ');
  return `${name} · ${joined} ${first.startTime}`;
}

/** "Ter 18:00" — the next-slot tile (responsavel-02). */
export function slotLabel(slot: ScheduleSlotView): string {
  return `${WEEKDAY_SHORT[slot.weekday] ?? '?'} ${slot.startTime}`;
}

/** Two-letter monogram for the leading avatar ("Lucas Almeida" → "LA"). */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last =
    parts.length > 1
      ? (parts[parts.length - 1]?.[0] ?? '')
      : (parts[0]?.[1] ?? '');
  return `${first}${last}`.toUpperCase();
}

/** Whole-years age from an ISO birth date. */
export function ageFromBirthDate(
  birthDate: string,
  today: Date = new Date(),
): number {
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return Number.NaN;
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const WEEKDAY_LONG = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

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

/** "sábado, 1 de agosto" — the panel eyebrow (responsavel-02). */
export function longDatePt(date: Date = new Date()): string {
  return `${WEEKDAY_LONG[date.getDay()]}, ${date.getDate()} de ${MONTH_LONG[date.getMonth()]}`;
}

/** Masks raw digits as DD/MM/AAAA while the user types. */
export function maskBirthDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter((part) => part.length > 0).join('/');
}

/**
 * "DD/MM/AAAA" → ISO "AAAA-MM-DD"; null while incomplete, invalid or in the
 * future — the suggestion query only fires on a real birth date (fixes the
 * prototype's pre-filled static chip).
 */
export function parseBirthDate(
  masked: string,
  today: Date = new Date(),
): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(year, month - 1, day);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  if (!valid || date.getTime() > today.getTime()) return null;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 0-100 integer occupancy percentage (ocupação stat tile). */
export function occupancyPercent(occupancy: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((occupancy / capacity) * 100));
}
