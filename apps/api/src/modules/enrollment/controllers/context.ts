import type { ClsService } from 'nestjs-cls';
import {
  requireAuthContext,
  type AuthContext,
} from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';

/** Tenant-bound auth context — every enrollment surface lives inside an academy. */
export function requireTenantContext(
  cls: ClsService,
): AuthContext & { tenantId: string } {
  const ctx = requireAuthContext(cls);
  if (!ctx.tenantId) {
    throw problem(
      403,
      ErrorCodes.AUTHZ_FORBIDDEN_ROLE,
      'No active academy context',
    );
  }
  return ctx as AuthContext & { tenantId: string };
}
