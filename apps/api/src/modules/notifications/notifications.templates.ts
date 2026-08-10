/**
 * Pure PT-BR template helpers for the fan-out listeners (spec 010). The feed
 * is render-ready text: amounts are composed from integer cents server-side,
 * dates/times are tenant-local strings — clients never re-derive copy.
 * Product is BR-only in v1; locale-aware templates are recorded debt.
 */

const MONTHS_PT = [
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
];

/** `18000` → `R$ 180,00` (plain space — no NBSP surprises for clients). */
export function fmtMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}R$ ${whole},${fraction}`;
}

/** `2026-08-05` (tenant-local YYYY-MM-DD) → `05/08`. */
export function fmtDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

/** PT-BR month name of a tenant-local YYYY-MM-DD (mensalidade competência). */
export function monthNamePt(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  return MONTHS_PT[month - 1] ?? isoDate;
}

/** Local `dd/mm` of an ISO instant (event dates). */
export function fmtDayMonthOf(instant: Date): string {
  return `${String(instant.getDate()).padStart(2, '0')}/${String(instant.getMonth() + 1).padStart(2, '0')}`;
}

/** Local `HH:MM` of an ISO instant (check-in / event hours). */
export function fmtTime(instant: Date): string {
  return `${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`;
}

/** `Ana Aluna` → `AA` — the prototypes' initials chip (max 2 letters). */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
