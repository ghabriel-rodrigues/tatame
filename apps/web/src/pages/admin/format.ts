/**
 * Enrollment display helpers (ENR.13-15). Pure formatting only — occupancy,
 * Lotada and badges are server-derived; nothing here recomputes rules.
 */
import type { ClassListItem, ScheduleSlotView } from '@tatame/shared';

/** 0 = Domingo … 6 = Sábado (API weekday contract). */
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** Weekday chips rendered Monday-first, like the handoff (Seg … Dom). */
export const WEEKDAY_CHIP_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** "Seg · Qua · Sex 19:00" — the turmas list schedule summary (admin-10). */
export function scheduleSummary(schedules: ScheduleSlotView[]): string {
  if (schedules.length === 0) return 'Sem horário';
  const days = [...schedules]
    .sort((a, b) => WEEKDAY_CHIP_ORDER.indexOf(a.weekday as 1) - WEEKDAY_CHIP_ORDER.indexOf(b.weekday as 1))
    .map((slot) => WEEKDAY_SHORT[slot.weekday] ?? '?');
  const startTime = schedules[0]?.startTime ?? '';
  return `${[...new Set(days)].join(' · ')} ${startTime}`.trim();
}

/** "19:00 – 20:00" from a slot's start + duration (admin-11 header). */
export function scheduleTimeRange(slot: ScheduleSlotView): string {
  const [hours = 0, minutes = 0] = slot.startTime.split(':').map(Number);
  const total = hours * 60 + minutes + slot.durationMinutes;
  const endHours = Math.floor(total / 60) % 24;
  const endMinutes = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${slot.startTime} – ${pad(endHours)}:${pad(endMinutes)}`;
}

/** "Fundamentos · Seg · Qua · Sex 19:00 · Prof. Rafael Nunes · 24/24". */
export function classSubtitle(turma: ClassListItem): string {
  return `${scheduleSummary(turma.schedules)} · Prof. ${turma.professor.fullName} · ${turma.occupancy}/${turma.capacity}`;
}

/** Two-letter monogram for the leading avatar ("Lucas Almeida" → "LA"). */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return `${first}${last}`.toUpperCase();
}

/** Whole-years age from an ISO birth date (minor ⇒ guardian client check). */
export function ageFromBirthDate(birthDate: string, today: Date = new Date()): number {
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return Number.NaN;
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isMinor(birthDate: string): boolean {
  const age = ageFromBirthDate(birthDate);
  return Number.isFinite(age) && age < 18;
}
