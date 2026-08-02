import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { mergeMap, type Observable } from 'rxjs';
import { getAuthContext } from '../auth-context.js';
import { AuditService } from '../../modules/identity/services/audit.service.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global interceptor (ticket 03): while an impersonator is present in the CLS
 * context, every MUTATING request that completes successfully is appended to
 * the audit log (who, which academy, what, when). Reads are not logged in v1.
 */
@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ImpersonationAuditInterceptor.name);

  constructor(
    private readonly cls: ClsService,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const ctx = getAuthContext(this.cls);

    if (!ctx?.isImpersonated || READ_METHODS.has(request.method)) {
      return next.handle();
    }

    const action = `${request.method} ${request.originalUrl ?? request.url}`;
    return next.handle().pipe(
      // Awaited on purpose: the audit row must exist before the mutation's
      // response leaves the server (and before any test/verifier looks).
      mergeMap(async (value) => {
        try {
          await this.audit.append({
            tenantId: ctx.tenantId,
            actorUserId: ctx.userId,
            impersonatorUserId: ctx.impersonatorUserId ?? ctx.userId,
            action,
            targetType: 'http_request',
            targetId: null,
            metadata: { params: request.params },
          });
        } catch (error) {
          this.logger.error(
            `Failed to audit impersonated mutation: ${(error as Error).message}`,
          );
        }
        return value;
      }),
    );
  }
}
