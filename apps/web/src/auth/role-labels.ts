/** PT-BR role labels — UI copy only; code and API stay on English enums. */
import type { AnyRoleName } from '@tatame/shared';

export const ROLE_LABELS: Record<AnyRoleName, string> = {
  student: 'Aluno',
  professor: 'Professor',
  admin: 'Admin',
  guardian: 'Responsável',
  owner: 'Owner',
  support: 'Suporte',
  finance: 'Financeiro',
};
