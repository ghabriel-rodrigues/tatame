/**
 * PT-BR problem+json mapping for the attendance surface (ATT.15-18).
 * Clients branch on stable codes, never on human text (shared errors.ts).
 */

import { ApiErrorCodes, parseProblem } from '@tatame/shared';

const MESSAGES: Record<string, string> = {
  [ApiErrorCodes.CHECKIN_CODE_INVALID]:
    'Código inválido ou expirado — confira com o professor o código atual.',
  [ApiErrorCodes.CHECKIN_NOT_ENROLLED]: 'Você não está matriculado nesta turma.',
  [ApiErrorCodes.CHECKIN_NO_SESSION_TODAY]: 'Nenhuma aula desta turma acontece hoje.',
  [ApiErrorCodes.CHECKIN_OUTSIDE_WINDOW]:
    'Fora da janela de check-in desta aula. Tente perto do horário do treino.',
  [ApiErrorCodes.ATTENDANCE_REVOKE_WINDOW_CLOSED]:
    'O dia desta chamada já fechou — correções agora passam pelo admin.',
  [ApiErrorCodes.TENANT_READ_ONLY]:
    'Academia em modo somente leitura — alterações desabilitadas.',
  [ApiErrorCodes.NOT_FOUND]: 'Registro não encontrado.',
  [ApiErrorCodes.VALIDATION_FAILED]: 'Dados inválidos. Revise e tente novamente.',
};

export const GENERIC_ERROR = 'Algo deu errado. Tente novamente.';

/** Maps an openapi-fetch error payload to the PT-BR user message. */
export function attendanceErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  if (!problem) return GENERIC_ERROR;
  return MESSAGES[problem.code] ?? GENERIC_ERROR;
}
