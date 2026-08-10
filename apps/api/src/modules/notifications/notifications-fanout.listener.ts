import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq, inArray } from 'drizzle-orm';
import {
  guardians,
  memberships,
  notifications,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import { APP_DB } from '../../infra/db/db.module.js';
import {
  ATTENDANCE_CHECKIN_RECORDED,
  type CheckinRecordedEvent,
} from '../attendance/attendance.events.js';
import {
  BILLING_CHARGE_CREATED,
  BILLING_CHARGE_OVERDUE,
  BILLING_CHARGE_PAID,
  BILLING_CHARGE_REFUNDED,
  type ChargeCreatedEvent,
  type ChargeOverdueEvent,
  type ChargePaidEvent,
  type ChargeRefundedEvent,
} from '../billing/billing.events.js';
import { isMinor } from '../enrollment/lib/derive.js';
import {
  EVENTS_ANNOUNCEMENT_REQUESTED,
  EVENTS_EVENT_CANCELED,
  EVENTS_EVENT_PUBLISHED,
  EVENTS_REGISTRATION_CANCELED,
  EVENTS_REGISTRATION_CONFIRMED,
  type AnnouncementRequestedEvent,
  type EventAudienceEntry,
  type EventCanceledEvent,
  type EventPublishedEvent,
  type RegistrationCanceledEvent,
  type RegistrationConfirmedEvent,
} from '../events/events.events.js';
import {
  GRADUATION_AWARDED,
  type GraduationAwardedEvent,
} from '../graduation/graduation.events.js';
import {
  STORE_ORDER_CANCELED,
  STORE_ORDER_DELIVERED,
  STORE_ORDER_PAID,
  STORE_ORDER_READY,
  STORE_PRODUCT_LOW_STOCK,
  type OrderCanceledEvent,
  type OrderDeliveredEvent,
  type OrderPaidEvent,
  type OrderReadyEvent,
  type ProductLowStockEvent,
} from '../store/store.events.js';
import {
  fmtDayMonth,
  fmtDayMonthOf,
  fmtMoney,
  fmtTime,
  initials,
  monthNamePt,
} from './notifications.templates.js';

/** One row the batch insert writes — render-ready per the mapping table. */
export interface NotificationRow {
  userId: string;
  category: 'payment' | 'event' | 'graduation' | 'attendance' | 'store';
  chip: string | null;
  title: string;
  body: string | null;
  route: string | null;
}

/**
 * THE fan-out write side (spec 010, NOT.4 — be-01 finally as real code):
 * every handler is an `@OnEvent` subscriber on the post-commit domain events
 * the other modules already emit. No service in any other module ever inserts
 * a notification directly, and no emitting module imports this one.
 *
 * Each handler opens its own `withTenant` context from the event's tenantId,
 * resolves recipients (null user_id = no login ⇒ skipped silently) and
 * batch-inserts synchronously — no queue in v1; in-process at-most-once is
 * the recorded contract. Every handler is wrapped catch-and-log: a fan-out
 * failure never surfaces to the emitting request (which has already
 * committed and responded anyway).
 *
 * The mute flag does NOT gate insertion — rows are always written; mute only
 * suppresses the unread count (the feed doubles as the receipt trail).
 */
@Injectable()
export class NotificationsFanoutListener {
  private readonly logger = new Logger('NotificationsFanout');

  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  // ── billing (plan-origin only — event/order money double-notify guard) ────

  @OnEvent(BILLING_CHARGE_CREATED)
  async onChargeCreated(event: ChargeCreatedEvent): Promise<void> {
    await this.safely(BILLING_CHARGE_CREATED, async () => {
      if (event.origin !== 'plan') return;
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const payer = await this.resolvePayer(tx, event);
        if (!payer) return;
        const month = monthNamePt(event.periodStart ?? event.dueDate);
        await this.write(tx, event.tenantId, [
          {
            userId: payer.userId,
            category: 'payment',
            chip: 'R$',
            title:
              event.audience === 'guardian'
                ? `Mensalidade de ${payer.studentName} disponível`
                : `Mensalidade de ${month} disponível`,
            body: `Vence em ${fmtDayMonth(event.dueDate)} · ${fmtMoney(event.amountCents)}`,
            route: 'wallet',
          },
        ]);
      });
    });
  }

  @OnEvent(BILLING_CHARGE_OVERDUE)
  async onChargeOverdue(event: ChargeOverdueEvent): Promise<void> {
    await this.safely(BILLING_CHARGE_OVERDUE, async () => {
      if (event.origin !== 'plan') return;
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const payer = await this.resolvePayer(tx, event);
        if (!payer) return;
        await this.write(tx, event.tenantId, [
          {
            userId: payer.userId,
            category: 'payment',
            chip: 'R$',
            title:
              event.audience === 'guardian'
                ? `Mensalidade de ${payer.studentName} em aberto`
                : 'Mensalidade em aberto',
            body: `${fmtMoney(event.amountCents)} · venceu em ${fmtDayMonth(event.dueDate)} · pague com Pix em 1 toque`,
            route: 'wallet',
          },
        ]);
      });
    });
  }

  @OnEvent(BILLING_CHARGE_PAID)
  async onChargePaid(event: ChargePaidEvent): Promise<void> {
    await this.safely(BILLING_CHARGE_PAID, async () => {
      if (event.origin !== 'plan') return;
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const payer = await this.resolvePayer(tx, event);
        if (!payer) return;
        const month = monthNamePt(event.periodStart ?? event.dueDate);
        await this.write(tx, event.tenantId, [
          {
            userId: payer.userId,
            category: 'payment',
            chip: 'R$',
            title: 'Pagamento confirmado',
            body: `Mensalidade de ${month} · ${fmtMoney(event.amountCents)}`,
            route: 'wallet',
          },
        ]);
      });
    });
  }

  @OnEvent(BILLING_CHARGE_REFUNDED)
  async onChargeRefunded(event: ChargeRefundedEvent): Promise<void> {
    await this.safely(BILLING_CHARGE_REFUNDED, async () => {
      if (event.origin !== 'plan') return;
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const payer = await this.resolvePayer(tx, event);
        if (!payer) return;
        const month = monthNamePt(event.periodStart ?? event.dueDate);
        await this.write(tx, event.tenantId, [
          {
            userId: payer.userId,
            category: 'payment',
            chip: 'R$',
            title: 'Pagamento estornado',
            body: `Mensalidade de ${month} · ${fmtMoney(event.amountCents)}`,
            route: 'wallet',
          },
        ]);
      });
    });
  }

  // ── events ────────────────────────────────────────────────────────────────

  @OnEvent(EVENTS_EVENT_PUBLISHED)
  async onEventPublished(event: EventPublishedEvent): Promise<void> {
    await this.safely(EVENTS_EVENT_PUBLISHED, async () => {
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        // Tenant-wide fan-out: active student/professor/guardian memberships,
        // deduplicated by user. Admins authored the event — excluded.
        const members = await tx
          .selectDistinct({ userId: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.status, 'active'),
              inArray(memberships.role, ['student', 'professor', 'guardian']),
            ),
          );
        if (members.length === 0) return;
        const startsAt = new Date(event.startsAt);
        const price = event.priceCents != null ? ` · ${fmtMoney(event.priceCents)}` : '';
        const row = {
          category: 'event' as const,
          chip: String(startsAt.getDate()),
          title: event.name,
          body: `${fmtDayMonthOf(startsAt)} às ${fmtTime(startsAt)} — confirme sua presença${price}`,
          route: `event/${event.eventId}`,
        };
        await this.write(
          tx,
          event.tenantId,
          members.map((m) => ({ userId: m.userId, ...row })),
        );
      });
    });
  }

  @OnEvent(EVENTS_EVENT_CANCELED)
  async onEventCanceled(event: EventCanceledEvent): Promise<void> {
    await this.safely(EVENTS_EVENT_CANCELED, async () => {
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const userIds = await this.resolveAudience(tx, event.audience);
        await this.write(
          tx,
          event.tenantId,
          userIds.map((userId) => ({
            userId,
            category: 'event' as const,
            chip: null,
            title: `${event.name} foi cancelado`,
            body: 'Inscrições canceladas — pagamentos serão estornados',
            route: `event/${event.eventId}`,
          })),
        );
      });
    });
  }

  @OnEvent(EVENTS_REGISTRATION_CONFIRMED)
  async onRegistrationConfirmed(event: RegistrationConfirmedEvent): Promise<void> {
    await this.safely(EVENTS_REGISTRATION_CONFIRMED, async () => {
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const target = await this.resolveActingAudience(tx, event);
        if (!target) return;
        await this.write(tx, event.tenantId, [
          {
            userId: target.userId,
            category: 'event',
            chip: null,
            title:
              event.audience === 'guardian'
                ? `${target.studentName} confirmado em ${event.eventName}`
                : `Presença confirmada — ${event.eventName}`,
            body: null,
            route: `event/${event.eventId}`,
          },
        ]);
      });
    });
  }

  @OnEvent(EVENTS_REGISTRATION_CANCELED)
  async onRegistrationCanceled(event: RegistrationCanceledEvent): Promise<void> {
    await this.safely(EVENTS_REGISTRATION_CANCELED, async () => {
      // Self opt-out is the actor's own gesture — not news.
      if (event.via === 'self') return;
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const target = await this.resolveActingAudience(tx, event);
        if (!target) return;
        await this.write(tx, event.tenantId, [
          {
            userId: target.userId,
            category: 'event',
            chip: null,
            title: `Inscrição cancelada — ${event.eventName}`,
            body:
              event.via === 'event_canceled'
                ? 'O evento foi cancelado'
                : 'Pagamento estornado',
            route: `event/${event.eventId}`,
          },
        ]);
      });
    });
  }

  @OnEvent(EVENTS_ANNOUNCEMENT_REQUESTED)
  async onAnnouncementRequested(event: AnnouncementRequestedEvent): Promise<void> {
    await this.safely(EVENTS_ANNOUNCEMENT_REQUESTED, async () => {
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const userIds = await this.resolveAudience(tx, event.audience);
        await this.write(
          tx,
          event.tenantId,
          userIds.map((userId) => ({
            userId,
            category: 'event' as const,
            chip: null,
            title: `Lembrete: ${event.name}`,
            body: 'Comunicado da academia — confira os detalhes do evento',
            route: `event/${event.eventId}`,
          })),
        );
      });
    });
  }

  // ── attendance (guardian of a checked-in minor only) ──────────────────────

  @OnEvent(ATTENDANCE_CHECKIN_RECORDED)
  async onCheckinRecorded(event: CheckinRecordedEvent): Promise<void> {
    await this.safely(ATTENDANCE_CHECKIN_RECORDED, async () => {
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const [student] = await tx
          .select({
            fullName: students.fullName,
            birthDate: students.birthDate,
            guardianUserId: guardians.userId,
          })
          .from(students)
          .innerJoin(
            guardians,
            and(
              eq(guardians.tenantId, students.tenantId),
              eq(guardians.id, students.guardianId),
            ),
          )
          .where(eq(students.id, event.studentId));
        // Adults, guardian-less students and login-less guardians: no row.
        if (!student?.guardianUserId || !isMinor(student.birthDate)) return;
        await this.write(tx, event.tenantId, [
          {
            userId: student.guardianUserId,
            category: 'attendance',
            chip: initials(student.fullName),
            title: `${student.fullName} fez check-in`,
            body: `Presença registrada às ${fmtTime(new Date(event.checkedInAt))}`,
            route: null,
          },
        ]);
      });
    });
  }

  // `attendance.revoked` deliberately has no handler — internal correction.

  // ── graduation ────────────────────────────────────────────────────────────

  @OnEvent(GRADUATION_AWARDED)
  async onGraduationAwarded(event: GraduationAwardedEvent): Promise<void> {
    await this.safely(GRADUATION_AWARDED, async () => {
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const rows: NotificationRow[] = [];
        const body = `Registrado pelo Prof. ${event.awardedByName}`;
        // Chip: the prototypes' `{n}º` grau chip; belt promotions fall back
        // to the belt's initial letter.
        const chip =
          event.kind === 'degree' ? `${event.degree}º` : event.beltName.charAt(0).toUpperCase();

        const [student] = await tx
          .select({ userId: students.userId })
          .from(students)
          .where(eq(students.id, event.studentId));
        if (student?.userId) {
          rows.push({
            userId: student.userId,
            category: 'graduation',
            chip,
            title:
              event.kind === 'degree'
                ? `Você recebeu o ${event.degree}º grau`
                : `Nova faixa: ${event.beltName}`,
            body,
            route: 'graduation',
          });
        }

        if (event.guardianId) {
          const [guardian] = await tx
            .select({ userId: guardians.userId })
            .from(guardians)
            .where(eq(guardians.id, event.guardianId));
          if (guardian?.userId) {
            rows.push({
              userId: guardian.userId,
              category: 'graduation',
              chip,
              title:
                event.kind === 'degree'
                  ? `${event.studentName} recebeu o ${event.degree}º grau na faixa ${event.beltName}`
                  : `${event.studentName} recebeu a faixa ${event.beltName}`,
              body,
              route: 'graduation',
            });
          }
        }

        await this.write(tx, event.tenantId, rows);
      });
    });
  }

  // ── store ─────────────────────────────────────────────────────────────────

  @OnEvent(STORE_ORDER_PAID)
  async onOrderPaid(event: OrderPaidEvent): Promise<void> {
    await this.safely(STORE_ORDER_PAID, async () => {
      await withTenant(this.appDb.db, event.tenantId, (tx) =>
        this.write(tx, event.tenantId, [
          {
            userId: event.buyerUserId,
            category: 'store',
            chip: 'R$',
            title: `Pedido #${event.number} pago`,
            body: `${event.productName} — retire na recepção da academia`,
            route: 'orders',
          },
        ]),
      );
    });
  }

  @OnEvent(STORE_ORDER_READY)
  async onOrderReady(event: OrderReadyEvent): Promise<void> {
    await this.safely(STORE_ORDER_READY, async () => {
      await withTenant(this.appDb.db, event.tenantId, (tx) =>
        this.write(tx, event.tenantId, [
          {
            userId: event.buyerUserId,
            category: 'store',
            chip: `#${event.number}`,
            title: `Pedido #${event.number} pronto para retirada`,
            body: 'Passe na recepção da academia',
            route: 'orders',
          },
        ]),
      );
    });
  }

  @OnEvent(STORE_ORDER_DELIVERED)
  async onOrderDelivered(event: OrderDeliveredEvent): Promise<void> {
    await this.safely(STORE_ORDER_DELIVERED, async () => {
      await withTenant(this.appDb.db, event.tenantId, (tx) =>
        this.write(tx, event.tenantId, [
          {
            userId: event.buyerUserId,
            category: 'store',
            chip: `#${event.number}`,
            title: `Pedido #${event.number} entregue`,
            body: 'Bom treino com o equipamento novo!',
            route: 'orders',
          },
        ]),
      );
    });
  }

  @OnEvent(STORE_ORDER_CANCELED)
  async onOrderCanceled(event: OrderCanceledEvent): Promise<void> {
    await this.safely(STORE_ORDER_CANCELED, async () => {
      // Buyer self-cancel of a pending order is not news — refund only.
      if (!event.refunded) return;
      await withTenant(this.appDb.db, event.tenantId, (tx) =>
        this.write(tx, event.tenantId, [
          {
            userId: event.buyerUserId,
            category: 'store',
            chip: `#${event.number}`,
            title: `Pedido #${event.number} cancelado`,
            body: 'Estorno do Pix em até 1 dia útil',
            route: 'orders',
          },
        ]),
      );
    });
  }

  @OnEvent(STORE_PRODUCT_LOW_STOCK)
  async onProductLowStock(event: ProductLowStockEvent): Promise<void> {
    await this.safely(STORE_PRODUCT_LOW_STOCK, async () => {
      await withTenant(this.appDb.db, event.tenantId, async (tx) => {
        const admins = await tx
          .selectDistinct({ userId: memberships.userId })
          .from(memberships)
          .where(and(eq(memberships.status, 'active'), eq(memberships.role, 'admin')));
        await this.write(
          tx,
          event.tenantId,
          admins.map((a) => ({
            userId: a.userId,
            category: 'store' as const,
            chip: '!',
            title: `Estoque baixo: ${event.name}`,
            body: `${event.stockQty} unidades restantes (alerta em ${event.lowStockThreshold})`,
            route: 'store',
          })),
        );
      });
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * The one batch insert (kept as an instance seam so the e2e listener-
   * failure test can force a throw here and pin the isolation contract).
   */
  async write(tx: DbTransaction, tenantId: string, rows: NotificationRow[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.insert(notifications).values(rows.map((row) => ({ tenantId, ...row })));
  }

  /**
   * Catch-and-log isolation (story 20): a fan-out failure is logged and
   * swallowed — it never reaches the emitting flow, which has already
   * committed and responded.
   */
  private async safely(eventName: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        `notification fan-out failed for ${eventName}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Billing addressee: the `audience` field picks student vs bill-to
   * guardian; login-less people (minors, unclaimed guardians) are skipped.
   * Returns the student display name for the guardian template variants.
   */
  private async resolvePayer(
    tx: DbTransaction,
    event: { audience: 'student' | 'guardian'; studentId: string | null; guardianId: string | null },
  ): Promise<{ userId: string; studentName: string } | null> {
    if (!event.studentId) return null;
    const [student] = await tx
      .select({ userId: students.userId, fullName: students.fullName })
      .from(students)
      .where(eq(students.id, event.studentId));
    if (!student) return null;

    if (event.audience === 'guardian' && event.guardianId) {
      const [guardian] = await tx
        .select({ userId: guardians.userId })
        .from(guardians)
        .where(eq(guardians.id, event.guardianId));
      if (!guardian?.userId) return null;
      return { userId: guardian.userId, studentName: student.fullName };
    }

    if (!student.userId) return null;
    return { userId: student.userId, studentName: student.fullName };
  }

  /** Event audience entries → distinct recipient user ids (no login ⇒ skip). */
  private async resolveAudience(
    tx: DbTransaction,
    audience: EventAudienceEntry[],
  ): Promise<string[]> {
    const userIds = new Set<string>();
    for (const entry of audience) {
      const target = await this.resolveActingAudience(tx, entry);
      if (target) userIds.add(target.userId);
    }
    return [...userIds];
  }

  /** One audience entry → its addressee (guardian variant per `audience`). */
  private async resolveActingAudience(
    tx: DbTransaction,
    entry: { studentId: string; guardianId: string | null; audience: 'student' | 'guardian' },
  ): Promise<{ userId: string; studentName: string } | null> {
    return this.resolvePayer(tx, entry);
  }
}
