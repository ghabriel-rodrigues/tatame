import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { getAuthContext } from '../auth-context.js';
import {
  ALLOW_SUSPENDED_KEY,
  BYPASS_READ_ONLY_KEY,
  PUBLIC_KEY,
} from '../decorators.js';
import { ErrorCodes, problem } from '../problem.js';
import { AcademyStatusService } from '../../modules/identity/services/academy-status.service.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guard chain layer 2 (ticket 03). Skipped for platform tokens (ten: null)
 * and @Public routes. Suspensa → 403 tenant.suspended except @AllowSuspended
 * (me/logout); Inadimplente → read-only 403 tenant.read_only on mutations
 * except @BypassReadOnly. Sessions are never revoked by status changes.
 */
@Injectable()
export class AcademyStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
    private readonly statuses: AcademyStatusService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const ctx = getAuthContext(this.cls);
    if (!ctx?.tenantId) return true; // platform persona — no tenant status

    const status = await this.statuses.getStatus(ctx.tenantId);

    if (status === 'suspended') {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw problem(403, ErrorCodes.TENANT_SUSPENDED, 'Academy is suspended');
      }
      return true;
    }

    if (status === 'delinquent') {
      const request = context.switchToHttp().getRequest<Request>();
      if (READ_METHODS.has(request.method)) return true;
      const bypass = this.reflector.getAllAndOverride<boolean>(BYPASS_READ_ONLY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!bypass) {
        throw problem(403, ErrorCodes.TENANT_READ_ONLY, 'Academy is in read-only mode');
      }
    }

    return true;
  }
}
