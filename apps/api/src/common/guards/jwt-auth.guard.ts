import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { setAuthContext, type AuthContext } from '../auth-context.js';
import { DENY_IMPERSONATED_KEY, PUBLIC_KEY } from '../decorators.js';
import { ErrorCodes, problem } from '../problem.js';
import { TokenService } from '../../modules/identity/services/token.service.js';

/**
 * Guard chain layer 1 (ticket 03): verifies the bearer JWT (@Public bypass)
 * and populates the CLS auth context — the single source `withTenant` reads.
 * Also enforces the impersonated-token restrictions (@DenyImpersonated).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw problem(401, ErrorCodes.AUTH_UNAUTHENTICATED, 'Missing bearer token');
    }

    let claims;
    try {
      claims = this.tokens.verifyAccessToken(token);
    } catch {
      throw problem(401, ErrorCodes.AUTH_TOKEN_EXPIRED, 'Invalid or expired access token');
    }

    const ctx: AuthContext = {
      userId: claims.sub,
      sessionId: claims.sid,
      membershipId: claims.mem ?? null,
      tenantId: claims.ten ?? null,
      role: claims.rol,
      impersonatorUserId: claims.act?.sub ?? null,
      isImpersonated: claims.imp === true,
    };

    const denyImpersonated = this.reflector.getAllAndOverride<boolean>(DENY_IMPERSONATED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (denyImpersonated && ctx.isImpersonated) {
      throw problem(
        403,
        ErrorCodes.AUTHZ_IMPERSONATION_RESTRICTED,
        'This action is not available in an impersonated session',
      );
    }

    setAuthContext(this.cls, ctx);
    (request as Request & { authContext?: AuthContext }).authContext = ctx;
    return true;
  }
}
