/**
 * Domain events for the events slice (spec 008). Emitted on the
 * `@nestjs/event-emitter` bus AFTER the tenant transaction commits;
 * notifications stay a listener-only concern (delivery is its own phase), so
 * push/e-mail plugs in later without touching this module.
 *
 * Guardian variants: when the acting user is the responsável (per-dependent
 * confirmation) the same event name is emitted with `audience: 'guardian'`
 * and the guardian id populated, mirroring the billing convention.
 */

export const EVENTS_EVENT_PUBLISHED = 'events.event.published';
export const EVENTS_EVENT_CANCELED = 'events.event.canceled';
export const EVENTS_REGISTRATION_CONFIRMED = 'events.registration.confirmed';
export const EVENTS_REGISTRATION_CANCELED = 'events.registration.canceled';
export const EVENTS_ANNOUNCEMENT_REQUESTED = 'events.announcement.requested';

/** One addressee of an event-scoped notification. */
export interface EventAudienceEntry {
  studentId: string;
  /** Guardian of a minor dependent; null = the aluno addresses themself. */
  guardianId: string | null;
  audience: 'student' | 'guardian';
}

export interface EventPublishedEvent {
  tenantId: string;
  eventId: string;
  name: string;
  /** ISO instant — always present (publishing requires the date). */
  startsAt: string;
  /** NULL = gratuito. */
  priceCents: number | null;
}

/** Emitted with the registered audience so listeners can address inscritos. */
export interface EventCanceledEvent {
  tenantId: string;
  eventId: string;
  name: string;
  audience: EventAudienceEntry[];
}

export interface RegistrationEvent {
  tenantId: string;
  eventId: string;
  eventName: string;
  registrationId: string;
  studentId: string;
  /** Bill-to/confirming guardian; null = the aluno acted for themself. */
  guardianId: string | null;
  audience: 'student' | 'guardian';
  /** NULL = gratuito. */
  priceCents: number | null;
}

export type RegistrationConfirmedEvent = RegistrationEvent;

export interface RegistrationCanceledEvent extends RegistrationEvent {
  /** What undid it: self opt-out, the admin canceling the event, or a refund. */
  via: 'self' | 'event_canceled' | 'refund';
}

/** The Comunicar payload — event id + inscritos audience, nothing else. */
export interface AnnouncementRequestedEvent {
  tenantId: string;
  eventId: string;
  name: string;
  audience: EventAudienceEntry[];
}
