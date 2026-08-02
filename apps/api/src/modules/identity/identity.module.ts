import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../infra/config/app-config.js';
import { DbModule } from '../../infra/db/db.module.js';
import { NotificationsModule } from '../../infra/notifications/notifications.module.js';
import { AdminPermissionsController } from './controllers/admin-permissions.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { InvitesController } from './controllers/invites.controller.js';
import { PlatformImpersonationController } from './controllers/platform-impersonation.controller.js';
import { PublicInvitesController } from './controllers/public-invites.controller.js';
import { AcademyStatusService } from './services/academy-status.service.js';
import { AuditService } from './services/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { ImpersonationService } from './services/impersonation.service.js';
import { InviteService } from './services/invite.service.js';
import { MembershipService } from './services/membership.service.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { PasswordService } from './services/password.service.js';
import { PermissionsService } from './services/permissions.service.js';
import { SessionService } from './services/session.service.js';
import { TokenService } from './services/token.service.js';
import { TotpService } from './services/totp.service.js';

/**
 * Identity feature module (backend ticket 01): users, sessions, invites,
 * impersonation and the public convite flow. Exports exactly what the global
 * guard chain in AppModule needs — nothing else crosses the boundary.
 */
@Module({
  imports: [
    DbModule,
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtAccessSecret,
      }),
    }),
  ],
  controllers: [
    AuthController,
    PublicInvitesController,
    InvitesController,
    AdminPermissionsController,
    PlatformImpersonationController,
  ],
  providers: [
    TokenService,
    PasswordService,
    SessionService,
    MembershipService,
    AuthService,
    PasswordResetService,
    InviteService,
    TotpService,
    PermissionsService,
    AcademyStatusService,
    ImpersonationService,
    AuditService,
  ],
  exports: [TokenService, AcademyStatusService, PermissionsService, AuditService],
})
export class IdentityModule {}
