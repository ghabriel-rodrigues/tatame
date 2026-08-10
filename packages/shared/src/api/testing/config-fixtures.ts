/**
 * White-label config fixtures (CFG.8-11, spec 011). Mirrors the backend
 * permission registry (`apps/api/.../permission-registry.ts`) and the
 * `/admin/academy` document so web specs and e2e read alike.
 */
import type {
  AdminAcademyResponse,
  PermissionMatrixResponse,
  ResolvedPermission,
  RoleMemberCounts,
} from '../types.js';
import { FIXTURE_ACADEMY } from './fixtures.js';

/** `/v1/admin/academy` document — brand null = default Tatame purple. */
export function makeAdminAcademy(
  overrides: Partial<AdminAcademyResponse> = {},
): AdminAcademyResponse {
  return {
    id: FIXTURE_ACADEMY.id,
    name: FIXTURE_ACADEMY.name,
    slug: FIXTURE_ACADEMY.slug,
    logoUrl: null,
    brand: null,
    autoNotificationsEnabled: true,
    ...overrides,
  };
}

/**
 * Registry-faithful resolved matrix (admin-17): one row per registry entry,
 * `allowed` starting at each `defaultAllowed`.
 */
export function makePermissionRows(): ResolvedPermission[] {
  const rows: Array<[ResolvedPermission['role'], string, string, boolean]> = [
    ['professor', 'attendance.record', 'registrar presença', true],
    ['professor', 'graduation.update', 'atualizar graduações', true],
    ['professor', 'payments.view_class', 'ver pagamentos das turmas', false],
    ['professor', 'invites.create', 'gerar convite', true],
    ['professor', 'events.create', 'criar eventos', false],
    ['student', 'checkin.self', 'check-in', true],
    ['student', 'gamification.streak', 'gamificação de aulas seguidas', true],
    ['student', 'agenda.view', 'agenda', true],
    ['student', 'store.access', 'loja', true],
    ['student', 'store.purchase', 'comprar na loja', true],
    ['guardian', 'dependents.register', 'cadastrar dependentes', true],
    ['guardian', 'payments.pay', 'pagar', true],
    ['guardian', 'events.confirm', 'confirmar eventos', true],
  ];
  return rows.map(([role, key, label, defaultAllowed]) => ({
    role,
    key,
    label,
    defaultAllowed,
    allowed: defaultAllowed,
  }));
}

/** Group-header counts per admin-17 ("N pessoas neste papel"). */
export function makeRoleMemberCounts(
  overrides: Partial<RoleMemberCounts> = {},
): RoleMemberCounts {
  return { professor: 2, student: 142, guardian: 38, ...overrides };
}

export interface PermissionMatrixFixtureOptions {
  permissions?: ResolvedPermission[];
  memberCounts?: Partial<RoleMemberCounts>;
}

export function makePermissionMatrix(
  options: PermissionMatrixFixtureOptions = {},
): PermissionMatrixResponse {
  return {
    permissions: options.permissions ?? makePermissionRows(),
    memberCounts: makeRoleMemberCounts(options.memberCounts),
  };
}
