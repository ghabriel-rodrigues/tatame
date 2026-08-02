import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { getAuthContext } from '../auth-context.js';
import {
  ANY_ROLE_KEY,
  PUBLIC_KEY,
  ROLES_KEY,
  type AnyRoleName,
} from '../decorators.js';
import { ErrorCodes, problem } from '../problem.js';

/**
 * Guard chain layer 3 (ticket 03): DEFAULT DENY. A non-public route without
 * explicit @Roles/@AnyRole metadata is rejected — new endpoints cannot ship
 * without an authz stance (enforced again by the e2e route-metadata test).
 * A request carries exactly ONE active role; roles never union.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()] as const;
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [...targets]);
    if (isPublic) return true;

    const anyRole = this.reflector.getAllAndOverride<boolean>(ANY_ROLE_KEY, [...targets]);
    if (anyRole) return true;

    const roles = this.reflector.getAllAndOverride<AnyRoleName[]>(ROLES_KEY, [...targets]);
    if (!roles || roles.length === 0) {
      // Default deny: no explicit stance = no access.
      throw problem(403, ErrorCodes.AUTHZ_FORBIDDEN_ROLE, 'Route has no authorization stance');
    }

    const ctx = getAuthContext(this.cls);
    if (!ctx || !roles.includes(ctx.role)) {
      throw problem(403, ErrorCodes.AUTHZ_FORBIDDEN_ROLE, 'Active role cannot access this route');
    }
    return true;
  }
}
