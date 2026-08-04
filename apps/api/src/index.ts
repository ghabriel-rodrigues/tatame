// Public seam of @org/api — consumed by apps/api-e2e to boot the real app
// in-process against a Testcontainers database.
export { AppModule } from './app/app.module.js';
export { configureApp } from './app/setup.js';
export { APP_CONFIG, type AppConfig } from './infra/config/app-config.js';
export { APP_DB, PLATFORM_DB } from './infra/db/db.module.js';
export {
  NOTIFICATION_PORT,
  type NotificationPort,
  type PasswordResetNotification,
} from './infra/notifications/notification.port.js';
export { ErrorCodes } from './common/problem.js';
export {
  ACADEMY_ROLES,
  PLATFORM_ROLES,
  ANY_ROLE_KEY,
  PUBLIC_KEY,
  ROLES_KEY,
} from './common/decorators.js';
export { PERMISSION_REGISTRY } from './modules/identity/services/permission-registry.js';
export {
  StreamTicketService,
  STREAM_TICKET_TTL_SECONDS,
} from './modules/attendance/realtime/stream-ticket.service.js';
export { LiveRoomRegistry } from './modules/attendance/realtime/live-room.registry.js';
export { REFRESH_COOKIE } from './modules/identity/controllers/auth.controller.js';
export { AcademyStatusService } from './modules/identity/services/academy-status.service.js';
export { PermissionsService } from './modules/identity/services/permissions.service.js';
