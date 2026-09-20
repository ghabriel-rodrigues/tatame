/**
 * PT-BR problem+json mapping for the enrollment mutations (ENR.18/20).
 * Clients branch on stable codes, never on human text (shared errors.ts).
 */

import { ApiErrorCodes, parseProblem } from '@tatame/shared';

const MESSAGES: Record<string, string> = {
  [ApiErrorCodes.CLASS_FULL]: 'Turma lotada — o limite de alunos foi atingido.',
  [ApiErrorCodes.ENROLLMENT_ALREADY_ENROLLED]:
    'Este aluno já está matriculado nesta turma.',
  [ApiErrorCodes.CLASS_ARCHIVED]: 'Esta turma foi arquivada.',
  [ApiErrorCodes.AUTHZ_PERMISSION_DISABLED]: 'Ação desabilitada pela academia.',
  [ApiErrorCodes.TENANT_READ_ONLY]:
    'Academia em modo somente leitura — alterações desabilitadas.',
  [ApiErrorCodes.NOT_FOUND]: 'Registro não encontrado.',
  [ApiErrorCodes.VALIDATION_FAILED]:
    'Dados inválidos. Revise e tente novamente.',
};

export const GENERIC_ERROR = 'Algo deu errado. Tente novamente.';

/** Maps an openapi-fetch error payload to the PT-BR user message. */
export function enrollmentErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  if (!problem) return GENERIC_ERROR;
  return MESSAGES[problem.code] ?? GENERIC_ERROR;
}
