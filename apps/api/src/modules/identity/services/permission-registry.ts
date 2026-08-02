import type { AcademyRole } from '../../../common/decorators.js';

/**
 * Toggleable permission registry (ticket 03 — the admin-17 screen). Absent
 * row in `role_permissions` = the default below. Everything NOT listed here
 * is role-fixed and can never be toggled (hard rules are structural: the
 * billing surface simply has no professor controller).
 */
export interface PermissionDefinition {
  role: AcademyRole;
  key: string;
  /** PT-BR handoff label — client copy, mirrored here for the admin screen. */
  label: string;
  defaultAllowed: boolean;
}

export const PERMISSION_REGISTRY: readonly PermissionDefinition[] = [
  { role: 'professor', key: 'attendance.record', label: 'registrar presença', defaultAllowed: true },
  { role: 'professor', key: 'graduation.update', label: 'atualizar graduações', defaultAllowed: true },
  { role: 'professor', key: 'payments.view_class', label: 'ver pagamentos das turmas', defaultAllowed: false },
  { role: 'professor', key: 'invites.create', label: 'gerar convite', defaultAllowed: true },
  { role: 'professor', key: 'events.create', label: 'criar eventos', defaultAllowed: false },
  { role: 'student', key: 'checkin.self', label: 'check-in', defaultAllowed: true },
  { role: 'student', key: 'agenda.view', label: 'agenda', defaultAllowed: true },
  { role: 'student', key: 'store.access', label: 'loja', defaultAllowed: true },
  { role: 'student', key: 'store.purchase', label: 'comprar na loja', defaultAllowed: true },
  { role: 'guardian', key: 'dependents.register', label: 'cadastrar dependentes', defaultAllowed: true },
  { role: 'guardian', key: 'payments.pay', label: 'pagar', defaultAllowed: true },
  { role: 'guardian', key: 'events.confirm', label: 'confirmar eventos', defaultAllowed: true },
] as const;

export function findDefinition(role: string, key: string): PermissionDefinition | undefined {
  return PERMISSION_REGISTRY.find((d) => d.role === role && d.key === key);
}
