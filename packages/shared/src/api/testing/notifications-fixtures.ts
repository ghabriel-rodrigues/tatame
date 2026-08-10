/**
 * Notifications fixtures (NOT.7 web slice, spec 010). Contract-typed
 * factories for the in-app feed — the default feed mirrors the NOT.2 seed
 * shape: mixed read/unread rows across all five categories, newest first,
 * with the mapping-table PT-BR copy and pre-rendered chips.
 */
import type { ApiSchemas } from '../types.js';

export type NotificationFixture = ApiSchemas['NotificationDto'];

const uuid = (counter: number) =>
  `018f0000-0000-7000-90f1-${counter.toString(16).padStart(12, '0')}`;

/** Stable event id so `event/{id}` routes can be asserted against. */
export const FIXTURE_NOTIFICATION_EVENT_ID = '018f0000-0000-7000-90f2-0000000000e7';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

let notificationCounter = 0;

export function makeNotification(
  overrides: Partial<NotificationFixture> = {},
): NotificationFixture {
  notificationCounter += 1;
  return {
    id: uuid(notificationCounter),
    category: 'payment',
    chip: 'R$',
    title: 'Mensalidade de agosto disponível',
    body: 'Vence em 05/08 · R$ 180,00',
    route: 'wallet',
    readAt: null,
    createdAt: daysAgo(0),
    ...overrides,
  };
}

/**
 * Seed-shaped feed: 2 unread (low stock + mensalidade) and 3 read rows,
 * one per remaining category, newest first. Timestamps are now-relative so
 * the client's PT-BR relative formatter stays exercised (Hoje/Ontem/…).
 */
export function makeNotificationFeed(): NotificationFixture[] {
  return [
    makeNotification({
      category: 'store',
      chip: '!',
      title: 'Estoque baixo: Mochila de treino',
      body: '3 unidades restantes (alerta em 5)',
      route: 'store',
      readAt: null,
      createdAt: daysAgo(0),
    }),
    makeNotification({
      category: 'payment',
      chip: 'R$',
      title: 'Mensalidade de agosto disponível',
      body: 'Vence em 05/08 · R$ 180,00',
      route: 'wallet',
      readAt: null,
      createdAt: daysAgo(0),
    }),
    makeNotification({
      category: 'event',
      chip: '15',
      title: 'Open mat de verão',
      body: '15/08 às 10:00 — confirme sua presença',
      route: `event/${FIXTURE_NOTIFICATION_EVENT_ID}`,
      readAt: daysAgo(1),
      createdAt: daysAgo(1),
    }),
    makeNotification({
      category: 'graduation',
      chip: '2º',
      title: 'Você recebeu o 2º grau',
      body: 'Registrado pelo Prof. Ricardo Mota',
      route: 'graduation',
      readAt: daysAgo(3),
      createdAt: daysAgo(3),
    }),
    makeNotification({
      category: 'attendance',
      chip: 'PS',
      title: 'Pedro Silveira fez check-in',
      body: 'Presença registrada às 19:12',
      route: null,
      readAt: daysAgo(9),
      createdAt: daysAgo(10),
    }),
  ];
}
