/**
 * Client-side read of the professor "atualizar graduações" toggle
 * (GRD.17, story 15). `/v1/auth/me` returns the resolved per-role toggle
 * map; the registry default for `graduation.update` is ON, so only an
 * explicit `false` hides the award actions. Enforcement stays server-side
 * (authz.permission_disabled).
 */

import type { MeResponse } from '@tatame/shared';

export const GRADUATION_UPDATE_KEY = 'graduation.update';

export function canUpdateGraduations(session: MeResponse | null): boolean {
  return session?.permissions[GRADUATION_UPDATE_KEY] !== false;
}
