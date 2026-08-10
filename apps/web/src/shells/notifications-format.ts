/**
 * NOT.7 pure logic: the semantic-route → admin-console map and the PT-BR
 * relative timestamp (Hoje/Ontem/weekday/month) rendered on feed cards.
 * Route hints are semantic (`wallet`, `event/{id}`, `store`, …) — DB rows
 * never encode router paths; each shell maps what makes sense locally and
 * leaves the rest inert (spec 010). The admin console has no wallet.
 */

/** Admin-relevant semantic routes; anything else (wallet, unknown) is inert. */
const ADMIN_ROUTE_MAP: Record<string, string> = {
  store: '/admin/loja',
  orders: '/admin/loja',
  graduation: '/admin/graduacao',
};

export function adminRouteFor(route: string | null | undefined): string | null {
  if (!route) return null;
  if (route.startsWith('event/')) return '/admin/eventos';
  return ADMIN_ROUTE_MAP[route] ?? null;
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Hoje · Ontem · weekday (< 7 days) · "5 de ago" beyond that (spec 010). */
export function relativeNotificationTime(createdAt: string, now: Date = new Date()): string {
  const then = new Date(createdAt);
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 7) return WEEKDAYS[then.getDay()] ?? 'Hoje';
  return `${then.getDate()} de ${MONTHS[then.getMonth()]}`;
}
