import {
  TENANT_TIMEZONE,
  instantAt,
  localDate,
} from '../attendance/lib/time.js';

/**
 * Shared read shapes of the events module (spec 008). Amounts are integer
 * cents (`priceCents: null` = gratuito — clients render "Gratuito"); date and
 * time are pre-split in the tenant timezone so every client renders the same
 * date square the mat experiences (story 30).
 */

export type EventRegistrationStatus =
  'pending_payment' | 'confirmed' | 'canceled';

/** One student's registration state on one event. */
export interface EventRegistrationStateView {
  id: string;
  status: EventRegistrationStatus;
  /** The open charge to pay (pending_payment only) — drives the Pix sheet. */
  chargeId: string | null;
}

/** The gradient-banner card base every persona surface renders. */
export interface EventCardView {
  id: string;
  name: string;
  bannerPreset: string;
  location: string | null;
  /** ISO instant; null only on drafts ("Data a definir"). */
  startsAt: string | null;
  /** Tenant-local YYYY-MM-DD of startsAt. */
  date: string | null;
  /** Tenant-local HH:MM of startsAt. */
  time: string | null;
  /** NULL = gratuito. */
  priceCents: number | null;
}

/** Dated month item filling the AGD `events` contracts (spec 007 debt). */
export interface CalendarEventItemView extends EventCardView {
  /** Own state — aluno surfaces only; absent on professor/admin calendars. */
  registration?: EventRegistrationStateView | null;
}

/** Tenant-local HH:MM of an instant. */
export function localTime(
  at: Date,
  timeZone: string = TENANT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** startsAt split into the ISO instant + tenant-local date and time. */
export function eventTimeParts(startsAt: Date | null): {
  startsAt: string | null;
  date: string | null;
  time: string | null;
} {
  if (!startsAt) return { startsAt: null, date: null, time: null };
  return {
    startsAt: startsAt.toISOString(),
    date: localDate(startsAt),
    time: localTime(startsAt),
  };
}

/**
 * UTC bounds of a tenant-local `YYYY-MM` month — the AGD bucketing window
 * (an event at 23:30 local on the month's last day stays in that month even
 * though its UTC instant is already the next one).
 */
export function monthWindow(month: string): { startUtc: Date; endUtc: Date } {
  const [year, monthNum] = month.split('-').map(Number) as [number, number];
  const next =
    monthNum === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthNum + 1).padStart(2, '0')}`;
  return {
    startUtc: instantAt(`${month}-01`, '00:00'),
    endUtc: instantAt(`${next}-01`, '00:00'),
  };
}
