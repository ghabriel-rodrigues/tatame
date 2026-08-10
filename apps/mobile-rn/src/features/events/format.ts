/**
 * Events pure logic (EVT.10-11, spec 008). Everything here is client-side
 * *presentation* of server truth — registration status, price semantics
 * (`priceCents NULL = gratuito`) and settlement all live on the API; these
 * helpers only map the payloads to the handoff's PT-BR labels and the
 * detail-screen button state machine (free/paid × none/pending/confirmed).
 */

import type { ChipTone } from '@tatame/design-system/native';
import { formatBRL, monthNamePt } from '../billing/format';
import type { CalendarEventItem, EventRegistrationState } from './types';

const WEEKDAY_LONG = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

const MONTH_ABBREV = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
] as const;

/** Weekday index of a tenant-local "YYYY-MM-DD" date (TZ-safe parse). */
function weekdayOfDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).getDay();
}

/** "Gratuito" / "R$ 60,00" — `priceCents NULL = gratuito` (spec 008). */
export function priceLabel(priceCents: number | null | undefined): string {
  return priceCents == null ? 'Gratuito' : formatBRL(priceCents);
}

/** Date-square content ("15" / "AGO") from a tenant-local date. */
export function dateSquare(date: string): { day: string; month: string } {
  return {
    day: `${Number(date.slice(8, 10))}`,
    month: MONTH_ABBREV[Number(date.slice(5, 7)) - 1] ?? '',
  };
}

/** "Sábado, 15 de agosto · 10:00" (aluno-10/11); "Data a definir" guard. */
export function eventDateLine(date?: string | null, time?: string | null): string {
  if (!date) return 'Data a definir';
  const label = `${WEEKDAY_LONG[weekdayOfDate(date)]}, ${Number(date.slice(8, 10))} de ${monthNamePt(date)}`;
  return time ? `${label} · ${time}` : label;
}

/** "Dom, 15 de setembro · 09:30 · Ginásio Municipal" (responsavel-06). */
export function eventShortLine(
  date?: string | null,
  time?: string | null,
  location?: string | null,
): string {
  if (!date) return 'Data a definir';
  const parts = [
    `${WEEKDAY_SHORT[weekdayOfDate(date)]}, ${Number(date.slice(8, 10))} de ${monthNamePt(date)}`,
  ];
  if (time) parts.push(time);
  if (location) parts.push(location);
  return parts.join(' · ');
}

/** Active registration status; canceled rows behave as none (row is reused). */
export function registrationStatus(
  registration?: EventRegistrationState | null,
): 'none' | 'pending' | 'confirmed' {
  if (!registration || registration.status === 'canceled') return 'none';
  return registration.status === 'confirmed' ? 'confirmed' : 'pending';
}

/** List-card trailing chip: own state wins over the valor chip. */
export function eventStateChip(
  priceCents: number | null | undefined,
  registration?: EventRegistrationState | null,
): { label: string; tone: ChipTone } {
  const status = registrationStatus(registration);
  if (status === 'confirmed') return { label: 'Confirmado', tone: 'success' };
  if (status === 'pending') return { label: 'Pagamento pendente', tone: 'warning' };
  return priceCents == null
    ? { label: 'Gratuito', tone: 'brand' }
    : { label: formatBRL(priceCents), tone: 'neutral' };
}

/** "Pagar inscrição · R$ 60,00" (spec 008 fixed copy). */
export function payLabel(priceCents: number): string {
  return `Pagar inscrição · ${formatBRL(priceCents)}`;
}

/**
 * The detail-screen button state machine (spec 008 testing decisions):
 * free/paid × none/pending/confirmed → the rendered action.
 */
export type EventDetailAction =
  | { kind: 'confirm'; label: 'Confirmar presença' }
  | { kind: 'pay'; label: string }
  | { kind: 'pending'; label: string }
  | { kind: 'confirmed' };

export function detailAction(
  priceCents: number | null | undefined,
  registration?: EventRegistrationState | null,
): EventDetailAction {
  const status = registrationStatus(registration);
  if (status === 'confirmed') return { kind: 'confirmed' };
  if (status === 'pending' && priceCents != null) {
    return { kind: 'pending', label: payLabel(priceCents) };
  }
  if (priceCents == null) return { kind: 'confirm', label: 'Confirmar presença' };
  return { kind: 'pay', label: payLabel(priceCents) };
}

/**
 * Self-cancel rule (spec 008 story 15): free or not-yet-paid only. A paid,
 * confirmed registration is undone only by the audited admin refund.
 */
export function canCancel(
  priceCents: number | null | undefined,
  registration?: EventRegistrationState | null,
): boolean {
  const status = registrationStatus(registration);
  if (status === 'none') return false;
  return priceCents == null || status === 'pending';
}

/**
 * Responsável dependent-chip mapping (spec 008 stories 18-21): what one
 * tap on the chip does for this dependent's current state.
 */
export type DependentChipAction = 'confirm' | 'pay' | 'resume-payment' | 'cancel' | 'none';

export function dependentChipAction(
  priceCents: number | null | undefined,
  registration?: EventRegistrationState | null,
): DependentChipAction {
  const status = registrationStatus(registration);
  if (priceCents == null) {
    // Free toggle per the prototype: tap confirms, tap again cancels.
    return status === 'confirmed' ? 'cancel' : 'confirm';
  }
  if (status === 'none') return 'pay';
  if (status === 'pending') return 'resume-payment';
  return 'none'; // paid + confirmed: only the admin refund undoes it
}

/** Day-of-month → events map for one rendered "YYYY-MM" month (pink dots). */
export function eventDayMap(
  events: CalendarEventItem[],
  month: string,
): Record<number, CalendarEventItem[]> {
  const map: Record<number, CalendarEventItem[]> = {};
  for (const event of events) {
    if (!event.date || !event.date.startsWith(`${month}-`)) continue;
    const day = Number(event.date.slice(8, 10));
    (map[day] ??= []).push(event);
  }
  for (const day of Object.keys(map)) {
    map[Number(day)]!.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  }
  return map;
}
