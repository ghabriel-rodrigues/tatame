/**
 * Tenant-timezone helpers for the attendance slice (spec 004).
 *
 * v1 is single-country (charter): the tenant-local day is computed in
 * America/Sao_Paulo — mirrors the `attendance_revoke` seam (migration 0011).
 * A per-academy timezone column slots in here without a contract change.
 */

export const TENANT_TIMEZONE = 'America/Sao_Paulo';

/** Grace window after the slot's end during which check-ins are accepted. */
export const CODE_GRACE_MINUTES = 15;

/** Fallback code TTL when no schedule slot is resolvable for the day. */
export const CODE_FALLBACK_TTL_MINUTES = 60;

/** Manual check-ins open this many minutes before the slot's start. */
export const CHECKIN_EARLY_MINUTES = 30;

/** Milliseconds the tz clock is ahead of UTC at `at` (negative for SP). */
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) parts[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    // Some ICU versions render midnight as "24".
    Number(parts['hour']) % 24,
    Number(parts['minute']),
    Number(parts['second']),
  );
  return asUtc - at.getTime();
}

/** Local `YYYY-MM-DD` of `at` in the tenant timezone. */
export function localDate(at: Date = new Date(), timeZone: string = TENANT_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

/** Local weekday (0 = Sunday … 6 = Saturday) of `at` in the tenant timezone. */
export function localWeekday(at: Date = new Date(), timeZone: string = TENANT_TIMEZONE): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at);
  const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
  if (index === -1) throw new Error(`Unexpected weekday name: ${name}`);
  return index;
}

/**
 * The instant of `YYYY-MM-DD` + `HH:MM[:SS]` in the tenant timezone. One
 * offset iteration is exact for fixed-offset zones (Brazil abolished DST).
 */
export function instantAt(
  dateStr: string,
  timeStr: string,
  timeZone: string = TENANT_TIMEZONE,
): Date {
  const normalized = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const naive = new Date(`${dateStr}T${normalized}Z`);
  return new Date(naive.getTime() - tzOffsetMs(timeZone, naive));
}

/** First day (`YYYY-MM-01`) of the tenant-local month containing `at`. */
export function localMonthStart(
  at: Date = new Date(),
  timeZone: string = TENANT_TIMEZONE,
): string {
  return `${localDate(at, timeZone).slice(0, 7)}-01`;
}

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}
