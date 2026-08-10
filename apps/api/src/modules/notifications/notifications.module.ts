import { Module } from '@nestjs/common';
import { DbModule } from '../../infra/db/db.module.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { NotificationsFanoutListener } from './notifications-fanout.listener.js';
import { NotificationsService } from './services/notifications.service.js';

/**
 * Notifications feature module (spec 010) — strictly LISTENER-ONLY on the
 * write side (be-01): its inserts happen exclusively inside `@OnEvent`
 * handlers subscribed to the post-commit domain events of billing, events,
 * attendance, graduation and store. No emitting module imports this one, and
 * this module imports no feature module — the bus is the only coupling, so
 * a fan-out failure (caught-and-logged in the listener) can never break an
 * emitting flow.
 *
 * The read side is the persona-neutral feed API (cursor list, unread count,
 * mark-read, per-membership mute settings).
 */
@Module({
  imports: [DbModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsFanoutListener],
})
export class NotificationsFeedModule {}
