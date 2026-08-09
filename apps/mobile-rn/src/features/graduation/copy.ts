/**
 * PT-BR problem+json mapping for the graduation mutations (GRD.17).
 * Clients branch on stable codes, never on human text. The graduation.*
 * codes are stable API codes not yet mirrored in shared errors.ts — the
 * literals here match apps/api/src/common/problem.ts.
 */

import { ApiErrorCodes, parseProblem } from '@tatame/shared';

export const GRADUATION_ERROR_CODES = {
  DEGREE_AT_MAX: 'graduation.degree_at_max',
  BELT_INVALID_TARGET: 'graduation.belt_invalid_target',
  ALREADY_REVERSED: 'graduation.already_reversed',
} as const;

const MESSAGES: Record<string, string> = {
  [GRADUATION_ERROR_CODES.DEGREE_AT_MAX]:
    'Este aluno já está no número máximo de graus da faixa atual.',
  [GRADUATION_ERROR_CODES.BELT_INVALID_TARGET]:
    'Faixa de destino inválida — verifique as graduações válidas da academia.',
  [GRADUATION_ERROR_CODES.ALREADY_REVERSED]: 'Esta graduação já foi revogada.',
  [ApiErrorCodes.AUTHZ_PERMISSION_DISABLED]: 'Ação desabilitada pela academia.',
  [ApiErrorCodes.TENANT_READ_ONLY]:
    'Academia em modo somente leitura — alterações desabilitadas.',
  [ApiErrorCodes.NOT_FOUND]: 'Registro não encontrado.',
  [ApiErrorCodes.VALIDATION_FAILED]: 'Dados inválidos. Revise e tente novamente.',
};

export const GENERIC_GRADUATION_ERROR = 'Algo deu errado. Tente novamente.';

/** Maps an openapi-fetch error payload to the PT-BR user message. */
export function graduationErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  if (!problem) return GENERIC_GRADUATION_ERROR;
  return MESSAGES[problem.code] ?? GENERIC_GRADUATION_ERROR;
}
