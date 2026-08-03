/** Pure derivation helpers for the enrollment module (spec 003). */

export interface ScheduleSlotView {
  weekday: number;
  startTime: string;
  durationMinutes: number;
}

/** Completed years on `on` (defaults to today). Age is time-dependent — never stored. */
export function ageOn(birthDate: string, on: Date = new Date()): number {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = on.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** The "minor ⇒ guardian linked" rule threshold (18, mirrors the invite seam). */
export function isMinor(birthDate: string, on?: Date): boolean {
  return ageOn(birthDate, on) < 18;
}

/** Postgres `time` values come back as HH:MM:SS — clients render HH:MM. */
export function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

/** Derived Ativo/Pendente badge: pendente = record not yet claimed by a login. */
export function badgeFor(userId: string | null): 'ativo' | 'pendente' {
  return userId ? 'ativo' : 'pendente';
}

/**
 * Next occurrence among recurring weekly slots relative to `now` (server
 * derivation — clients never re-implement the recurrence math).
 */
export function nextSlot(
  schedules: ScheduleSlotView[],
  now: Date = new Date(),
): ScheduleSlotView | null {
  if (schedules.length === 0) return null;
  const nowMinutes = now.getDay() * 24 * 60 + now.getHours() * 60 + now.getMinutes();
  const week = 7 * 24 * 60;
  let best: { delta: number; slot: ScheduleSlotView } | null = null;
  for (const slot of schedules) {
    const [hours = 0, minutes = 0] = slot.startTime.split(':').map(Number);
    const slotMinutes = slot.weekday * 24 * 60 + hours * 60 + minutes;
    const delta = (slotMinutes - nowMinutes + week) % week;
    if (!best || delta < best.delta) best = { delta, slot };
  }
  return best?.slot ?? null;
}
