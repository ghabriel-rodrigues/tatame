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
  BYPASS_READ_ONLY_KEY,
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
// Billing seam (spec 006) — e2e contract tests pin the normalized-event
// handler so the Stripe swap stays a driver-only PR.
export {
  PAYMENT_PROVIDER_PORT,
  type PaymentProviderPort,
  type ProviderEvent,
} from './infra/payments/payment-provider.port.js';
export { ProviderEventsService } from './modules/billing/services/provider-events.service.js';
export { MaterializationService } from './modules/billing/services/materialization.service.js';
export {
  BILLING_CHARGE_CREATED,
  BILLING_CHARGE_OVERDUE,
  BILLING_CHARGE_PAID,
  BILLING_CHARGE_REFUNDED,
} from './modules/billing/billing.events.js';
// Events seam (spec 008) — e2e asserts announce/lifecycle emissions and the
// handler-driven registration transitions.
export {
  EVENTS_ANNOUNCEMENT_REQUESTED,
  EVENTS_EVENT_CANCELED,
  EVENTS_EVENT_PUBLISHED,
  EVENTS_REGISTRATION_CANCELED,
  EVENTS_REGISTRATION_CONFIRMED,
} from './modules/events/events.events.js';
// Store seam (spec 009) — e2e asserts the handler-driven order transitions,
// the low-stock crossing emission and the board/status lifecycle events.
export {
  STORE_ORDER_CANCELED,
  STORE_ORDER_DELIVERED,
  STORE_ORDER_PAID,
  STORE_ORDER_READY,
  STORE_PRODUCT_LOW_STOCK,
} from './modules/store/store.events.js';
// Graduation + notifications seam (spec 010) — e2e pins the award
// announcement and the listener-failure isolation contract.
export {
  GRADUATION_AWARDED,
  type GraduationAwardedEvent,
} from './modules/graduation/graduation.events.js';
export { NotificationsFanoutListener } from './modules/notifications/notifications-fanout.listener.js';
