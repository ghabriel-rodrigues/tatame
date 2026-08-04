import { Module, ValidationPipe, type ValidationError } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClsModule } from 'nestjs-cls';
import { ProblemJsonFilter } from '../common/filters/problem-json.filter.js';
import { AcademyStatusGuard } from '../common/guards/academy-status.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ImpersonationAuditInterceptor } from '../common/interceptors/impersonation-audit.interceptor.js';
import { ErrorCodes, ProblemException } from '../common/problem.js';
import { AppConfigModule } from '../infra/config/config.module.js';
import { DbModule } from '../infra/db/db.module.js';
import { NotificationsModule } from '../infra/notifications/notifications.module.js';
import { AttendanceModule } from '../modules/attendance/attendance.module.js';
import { EnrollmentModule } from '../modules/enrollment/enrollment.module.js';
import { IdentityModule } from '../modules/identity/identity.module.js';

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): Array<{ field: string; messages: string[] }> {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/**
 * Root module. Cross-cutting registration order matters: the guard chain runs
 * in provider order — JwtAuthGuard → AcademyStatusGuard → RolesGuard →
 * PermissionsGuard (ticket 03).
 */
@Module({
  imports: [
    AppConfigModule,
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    // Domain-event bus (be-01): side effects ride events. Attendance emits
    // its check-in/revoke events post-commit for the SSE bridge (be-09).
    EventEmitterModule.forRoot(),
    DbModule,
    NotificationsModule,
    IdentityModule,
    EnrollmentModule,
    AttendanceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AcademyStatusGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: ProblemJsonFilter },
    { provide: APP_INTERCEPTOR, useClass: ImpersonationAuditInterceptor },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors) =>
          new ProblemException(
            422,
            ErrorCodes.VALIDATION_FAILED,
            'Request validation failed',
            flattenValidationErrors(errors),
          ),
      }),
    },
  ],
})
export class AppModule {}
