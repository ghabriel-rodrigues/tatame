import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { getAuthContext } from '../auth-context.js';
import { PERMISSION_KEY, PUBLIC_KEY } from '../decorators.js';
import { ErrorCodes, problem } from '../problem.js';
import { PermissionsService } from '../../modules/identity/services/permissions.service.js';

/**
 * Guard chain layer 4 (ticket 03): per-academy, per-role permission toggles.
 * Only routes carrying @RequiresPermission are checked — the toggleable
 * subset. Hard rules are structural, not toggles.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()] as const;
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ...targets,
    ]);
    if (isPublic) return true;

    const key = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ...targets,
    ]);
    if (!key) return true;

    const ctx = getAuthContext(this.cls);
    if (!ctx?.tenantId) return true; // platform tokens are never toggle-gated

    const allowed = await this.permissions.isAllowed(
      ctx.tenantId,
      ctx.role,
      key,
    );
    if (!allowed) {
      throw problem(
        403,
        ErrorCodes.AUTHZ_PERMISSION_DISABLED,
        `Permission '${key}' is disabled for role '${ctx.role}' in this academy`,
      );
    }
    return true;
  }
}
