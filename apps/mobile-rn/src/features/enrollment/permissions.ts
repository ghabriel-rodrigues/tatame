/**
 * Client-side read of the guardian "cadastrar dependentes" toggle
 * (ENR.20, story 36). `/v1/auth/me` returns the resolved per-role toggle
 * map; the registry default for `dependents.register` is ON, so only an
 * explicit `false` hides the surface. Enforcement stays server-side
 * (authz.permission_disabled).
 */

import type { MeResponse } from '@tatame/shared';

export const DEPENDENTS_REGISTER_KEY = 'dependents.register';

export function canRegisterDependents(session: MeResponse | null): boolean {
  return session?.permissions[DEPENDENTS_REGISTER_KEY] !== false;
}
