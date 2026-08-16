/**
 * Plataforma console display helpers (PLT.10-14). Pure pt-BR formatting over
 * the API's contract — every aggregate arrives server-derived, nothing here
 * recomputes truth.
 */
import { ApiErrorCodes, parseProblem, type PlatformAcademyStatus } from '@tatame/shared';

export const ACADEMY_STATUS_LABELS: Record<PlatformAcademyStatus, string> = {
  trial: 'Trial',
  active: 'Ativa',
  delinquent: 'Inadimplente',
  suspended: 'Suspensa',
};

/** Chip tones per the prototype's status colors (plataforma-03). */
export const ACADEMY_STATUS_TONES: Record<
  PlatformAcademyStatus,
  'brand' | 'success' | 'warning' | 'danger' | 'neutral'
> = {
  trial: 'brand',
  active: 'success',
  delinquent: 'danger',
  suspended: 'neutral',
};

const MONTHS_SHORT = [
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

/** "ago" from a YYYY-MM key — the chart's x labels. */
export function monthShortKey(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return MONTHS_SHORT[index] ?? month;
}

/** "desde fev 2024" from an ISO instant (plataforma-04). */
export function sinceLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `desde ${MONTHS_SHORT[date.getMonth()] ?? ''} ${date.getFullYear()}`;
}

/** "+12% vs. julho" / "-4% vs. julho" — the hero delta pill. */
export function deltaLabel(pct: number | null, previousMonth: string | undefined): string | null {
  if (pct === null || previousMonth === undefined) return null;
  const monthName = FULL_MONTHS[Number(previousMonth.slice(5, 7)) - 1] ?? '';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}% vs. ${monthName}`;
}

const FULL_MONTHS = [
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

/** "4.812" — pt-BR grouped integer (the overview tiles). */
export function formatCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

/** "Até 250 alunos" / "Alunos ilimitados" (plataforma-05). */
export function studentLimitLabel(limit: number | null): string {
  return limit === null ? 'Alunos ilimitados' : `Até ${limit} alunos`;
}

/** "52 academias" / "1 academia" / "Nenhuma academia" — the plan card line. */
export function academyCountLabel(count: number): string {
  if (count === 0) return 'Nenhuma academia';
  return count === 1 ? '1 academia' : `${count} academias`;
}

/** "214 alunos · plano Pro" — the academy row subtitle (plataforma-03). */
export function academySubtitle(input: {
  city: string | null;
  studentCount: number;
  planName: string | null;
}): string {
  const parts = [input.city ?? '—', `${input.studentCount} alunos`];
  if (input.planName) parts.push(`plano ${input.planName}`);
  return parts.join(' · ');
}

/** PT-BR copy for the platform console problem codes. */
export function platformErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  switch (problem?.code) {
    case ApiErrorCodes.PLAN_NAME_TAKEN:
      return 'Já existe um plano com esse nome.';
    case ApiErrorCodes.PLAN_NOT_FOUND:
      return 'Plano não encontrado.';
    case ApiErrorCodes.CONFLICT:
      return 'Este email já faz parte da equipe da plataforma.';
    case ApiErrorCodes.AUTHZ_FORBIDDEN_ROLE:
      return 'Seu perfil não tem permissão para esta ação.';
    case ApiErrorCodes.VALIDATION_FAILED:
      return 'Verifique os dados informados e tente novamente.';
    case ApiErrorCodes.NOT_FOUND:
      return 'Registro não encontrado.';
    default:
      return 'Algo deu errado. Tente novamente.';
  }
}
