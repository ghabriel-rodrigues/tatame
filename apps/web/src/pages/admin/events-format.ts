/**
 * Events display helpers (EVT.9, admin-13). Banner gradients resolve from a
 * preset-slug catalog built on Lumira tokens (no image upload in v1 — slugs
 * are catalog entries, not migrations); money/date lines are pure pt-BR
 * formatting over the API's integer-cents + tenant-local date contract.
 */
import { ApiErrorCodes, parseProblem, type ApiSchemas } from '@tatame/shared';
import { formatBRLWhole, monthName } from '../billing-format';
import { WEEKDAY_SHORT } from './format';

export type AdminEvent = ApiSchemas['AdminEventDto'];
export type CalendarEventItem = ApiSchemas['CalendarEventItemDto'];

export interface EventBannerPreset {
  slug: string;
  /** Picker chip copy (PT-BR client-side per charter). */
  label: string;
  /** Lumira-token gradient — the admin-13 card banner. */
  css: string;
}

/** Design-system gradient catalog (default = the purple→pink event gradient). */
export const EVENT_BANNER_PRESETS: EventBannerPreset[] = [
  {
    slug: 'event-purple-pink',
    label: 'Roxo e rosa',
    css: 'linear-gradient(135deg, var(--purple-700), var(--purple-500) 70%, var(--pink-500) 140%)',
  },
  {
    slug: 'event-pink-purple',
    label: 'Rosa e roxo',
    css: 'linear-gradient(135deg, var(--pink-600), var(--pink-400) 70%, var(--purple-500) 140%)',
  },
  {
    slug: 'event-deep-purple',
    label: 'Roxo profundo',
    css: 'linear-gradient(135deg, var(--purple-950), var(--purple-700) 80%, var(--purple-500) 140%)',
  },
];

export const DEFAULT_EVENT_BANNER = 'event-purple-pink';

/** Gradient CSS for a preset slug (unknown slugs fall back to the default). */
export function eventBannerCss(slug: string): string {
  const preset = EVENT_BANNER_PRESETS.find((entry) => entry.slug === slug);
  return (preset ?? EVENT_BANNER_PRESETS[0]!).css;
}

/** "Gratuito" when priceCents is null, else whole-real "R$ 120". */
export function valorChipLabel(priceCents: number | null | undefined): string {
  return priceCents == null ? 'Gratuito' : formatBRLWhole(priceCents);
}

/** "Sáb, 15 de agosto · 10:00" from tenant-local date+time ("Data a definir" on drafts). */
export function eventDateLabel(
  date: string | null | undefined,
  time: string | null | undefined,
): string {
  if (!date) return 'Data a definir';
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const day = Number(date.slice(8, 10));
  const label = `${WEEKDAY_SHORT[weekday]}, ${day} de ${monthName(date)}`;
  return time ? `${label} · ${time}` : label;
}

/**
 * The admin-13 subtitle: free → "32 confirmados", paid → "18 inscritos ·
 * R$ 2.160" (arrecadado omitted at zero), always "· Prof. X" at the end.
 */
export function inscritosLine(event: AdminEvent): string {
  const { totals } = event;
  const counts =
    event.priceCents == null && event.status === 'published'
      ? `${totals.confirmados} confirmados`
      : `${totals.inscritos} inscritos`;
  const arrecadado =
    totals.arrecadadoCents > 0
      ? ` · ${formatBRLWhole(totals.arrecadadoCents)}`
      : '';
  return `${counts}${arrecadado} · Prof. ${event.responsible.fullName}`;
}

/** PT-BR copy for the events problem codes (spec 008 stable codes). */
export function eventErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  switch (problem?.code) {
    case 'event.publish_requirements':
      return 'Defina data e local para publicar o evento.';
    case 'event.not_published':
      return 'Apenas eventos publicados aceitam esta ação.';
    case ApiErrorCodes.CONFLICT:
      return 'Evento cancelado é histórico — não pode ser alterado.';
    case ApiErrorCodes.VALIDATION_FAILED:
      return 'Verifique os dados informados e tente novamente.';
    case ApiErrorCodes.TENANT_READ_ONLY:
      return 'Academia em modo somente leitura — alterações bloqueadas.';
    default:
      return 'Algo deu errado. Tente novamente.';
  }
}
