/**
 * Fixed PT-BR copy + problem+json mapping for the events surface (spec 008).
 * Copy is pinned by the prototypes; clients branch on stable codes, never on
 * human text. The event codes are mapped by literal here until the shared
 * ApiErrorCodes mirror gains them (additive shared bump owned by web).
 */

import { parseProblem } from '@tatame/shared';

export const CONFIRMED_BANNER = 'Presença confirmada — até lá!';
export const PENDING_NOTICE = 'Pagamento pendente';
export const CONFIRM_LABEL = 'Confirmar presença';
export const CANCEL_LABEL = 'Cancelar participação';
export const UPCOMING_EVENTS_TITLE = 'Próximos eventos';
export const MONTH_EVENTS_TITLE = 'Eventos do mês';
export const RESPONSAVEL_SUBTITLE = 'Confirme a participação por dependente';

/** "Inscrição · Open mat de verão" (+ " · Pedro" on the guardian variant). */
export function inscricaoSubtitle(eventName: string, dependentName?: string): string {
  return dependentName ? `Inscrição · ${eventName} · ${dependentName}` : `Inscrição · ${eventName}`;
}

const MESSAGES: Record<string, string> = {
  'event.registration_settled':
    'Inscrição paga só pode ser cancelada pela academia.',
  'event.not_published': 'Este evento não está mais disponível.',
  'tenant.read_only':
    'A academia está em modo somente leitura — novas inscrições estão desabilitadas.',
  'resource.not_found': 'Evento não encontrado.',
  'validation.failed': 'Dados inválidos. Revise e tente novamente.',
};

export const GENERIC_EVENTS_ERROR = 'Algo deu errado. Tente novamente.';

/** Maps an openapi-fetch error payload to the PT-BR user message. */
export function eventsErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  if (!problem) return GENERIC_EVENTS_ERROR;
  return MESSAGES[problem.code] ?? GENERIC_EVENTS_ERROR;
}
