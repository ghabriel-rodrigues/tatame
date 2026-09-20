/**
 * PT-BR problem+json mapping for the billing surface (BIL.16-18).
 * Clients branch on stable codes, never on human text (shared errors.ts).
 */

import { ApiErrorCodes, parseProblem } from '@tatame/shared';

const MESSAGES: Record<string, string> = {
  [ApiErrorCodes.BILLING_CHARGE_NOT_PAYABLE]:
    'Esta cobrança não está mais em aberto — atualize a carteira.',
  [ApiErrorCodes.BILLING_METHOD_MANDATE_MISMATCH]:
    'A recorrência está disponível apenas no pagamento com cartão.',
  [ApiErrorCodes.BILLING_MANDATE_ALREADY_ACTIVE]:
    'A recorrência no cartão já está ativa para esta mensalidade.',
  [ApiErrorCodes.BILLING_SIMULATE_UNAVAILABLE]:
    'A simulação de pagamento não está disponível neste ambiente.',
  [ApiErrorCodes.NOT_FOUND]: 'Registro não encontrado.',
  [ApiErrorCodes.VALIDATION_FAILED]:
    'Dados inválidos. Revise e tente novamente.',
};

export const GENERIC_BILLING_ERROR = 'Algo deu errado. Tente novamente.';

/** Maps an openapi-fetch error payload to the PT-BR user message. */
export function billingErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  if (!problem) return GENERIC_BILLING_ERROR;
  return MESSAGES[problem.code] ?? GENERIC_BILLING_ERROR;
}
