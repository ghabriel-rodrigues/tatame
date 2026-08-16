/**
 * PT-BR problem+json mapping for the Dados pessoais save (REP.10, spec
 * 013). The 422s carry per-field errors — `profile.field_locked` (CPF/RG
 * write-once), `profile.field_read_only` (email/birthDate) and
 * `validation.failed` (server PT-BR messages passed through). Clients
 * branch on stable codes, never on human text.
 */

import { ApiErrorCodes, parseProblem } from '@tatame/shared';

export const PROFILE_GENERIC_ERROR = 'Algo deu errado. Tente novamente.';
export const PROFILE_SAVED_TOAST = 'Dados pessoais salvos.';

export const FIELD_LOCKED_MESSAGES: Record<string, string> = {
  cpf: 'CPF não pode ser alterado após definido.',
  rg: 'RG não pode ser alterado após definido.',
};

const TOP_LEVEL_MESSAGES: Record<string, string> = {
  [ApiErrorCodes.TENANT_READ_ONLY]:
    'Academia em modo somente leitura — alterações desabilitadas.',
  [ApiErrorCodes.VALIDATION_FAILED]: 'Revise os campos destacados.',
};

export interface ProfileSaveError {
  /** Screen-level message (banner above the form). */
  message: string;
  /** Per-field PT-BR messages keyed by the API field name. */
  fieldErrors: Record<string, string>;
}

/** Maps a PUT /v1/aluno/profile error payload to screen + field messages. */
export function profileSaveError(error: unknown): ProfileSaveError {
  const problem = parseProblem(error);
  if (!problem) return { message: PROFILE_GENERIC_ERROR, fieldErrors: {} };

  const fieldErrors: Record<string, string> = {};
  for (const entry of problem.errors ?? []) {
    if (problem.code === 'profile.field_locked') {
      fieldErrors[entry.field] = FIELD_LOCKED_MESSAGES[entry.field] ?? 'Campo bloqueado.';
    } else if (problem.code === 'profile.field_read_only') {
      fieldErrors[entry.field] = 'Campo somente leitura.';
    } else {
      // validation.failed — the service messages are already PT-BR.
      fieldErrors[entry.field] = entry.messages[0] ?? 'Valor inválido.';
    }
  }

  if (problem.code === 'profile.field_locked') {
    return {
      message: problem.detail ?? 'Documentos não podem ser alterados após definidos.',
      fieldErrors,
    };
  }
  if (problem.code === 'profile.field_read_only') {
    return {
      message: problem.detail ?? 'E-mail e data de nascimento não podem ser alterados.',
      fieldErrors,
    };
  }
  return {
    message: TOP_LEVEL_MESSAGES[problem.code] ?? PROFILE_GENERIC_ERROR,
    fieldErrors,
  };
}
