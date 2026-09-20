/**
 * Notifications fixtures + stateful endpoint mock (NOT.8-9): contract-typed
 * rows mirroring the aluno-20 / responsavel-09 prototype copy — render-ready
 * PT-BR title/body/chip exactly as the backend composes them at insert time
 * — plus a tiny in-memory backend for the four notifications endpoints
 * (read-all zeroes the count; mute zeroes it too, per spec 010 story 9).
 */

import { json, type FetchHandler } from './session';
import type {
  NotificationItem,
  NotificationsPage,
} from '../../src/features/notifications/types';

let notificationCounter = 0;

export function makeNotification(
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  notificationCounter += 1;
  return {
    id: `018f0000-0000-7000-8000-${notificationCounter.toString(16).padStart(12, '0')}`,
    category: 'payment',
    chip: 'R$',
    title: 'Mensalidade de agosto disponível',
    body: 'Vence em 10 de agosto · R$ 180,00',
    route: 'wallet',
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeNotificationsPage(
  notifications: NotificationItem[],
  nextCursor: string | null = null,
): NotificationsPage {
  return { notifications, nextCursor };
}

/** Aluno feed pinned to the aluno-20 screenshot (payment/event/graduation). */
export function makeAlunoFeed(eventId: string): NotificationItem[] {
  return [
    makeNotification(),
    makeNotification({
      category: 'event',
      chip: '15',
      title: 'Open mat de verão',
      body: 'Sábado, 15 de agosto às 10:00 — confirme sua presença',
      route: `event/${eventId}`,
    }),
    makeNotification({
      category: 'graduation',
      chip: '2º',
      title: 'Você recebeu o 2º grau',
      body: 'Registrado pelo Prof. Rafael Nunes',
      route: 'graduation',
    }),
  ];
}

/** Responsável feed pinned to the responsavel-09 screenshot. */
export function makeResponsavelFeed(): NotificationItem[] {
  return [
    makeNotification({
      title: 'Mensalidade do Pedro em aberto',
      body: 'R$ 150,00 · vence em 10 de agosto · pague com Pix em 1 toque',
    }),
    makeNotification({
      category: 'graduation',
      chip: '3º',
      title: 'Pedro recebeu o 3º grau na faixa cinza',
      body: 'Registrado pela Prof. Ana Beatriz — certificado disponível',
      route: 'graduation',
    }),
    makeNotification({
      category: 'event',
      chip: '13',
      title: 'Festival Kids abriu inscrições',
      body: 'Domingo, 13 de setembro · R$ 60 por criança',
      route: 'event/018f0000-0000-7000-8000-00000000e001',
    }),
    makeNotification({
      category: 'attendance',
      chip: 'JS',
      title: 'Júlia completou 13 aulas no mês',
      body: 'Melhor frequência da turma Kids — parabéns!',
      route: null,
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Stateful endpoint mock                                              */
/* ------------------------------------------------------------------ */

export interface NotificationsLog {
  /** POST /read-all count — the screen fires exactly one per open. */
  readAllPosts: number;
  /** `cursor` query param per GET /notifications (null = first page). */
  listCursors: (string | null)[];
  /** PUT /settings request bodies, in order. */
  settingsPuts: unknown[];
}

export interface NotificationsBackendOptions {
  /** Feed pages, chained by each page's `nextCursor`. Default: one empty page. */
  pages?: NotificationsPage[];
  /** Initial unread count (the bell dot source). Default 0. */
  count?: number;
  /** Initial per-membership switch state. Default true. */
  enabled?: boolean;
}

/**
 * In-memory notifications backend for the persona suites: serves the four
 * endpoints with the spec's arithmetic — read-all zeroes the unread count,
 * muting the membership zeroes it too (rows keep serving underneath).
 */
export function notificationsHandlers(
  options: NotificationsBackendOptions = {},
): {
  handler: FetchHandler;
  log: NotificationsLog;
} {
  const pages = options.pages ?? [makeNotificationsPage([])];
  let count = options.count ?? 0;
  let enabled = options.enabled ?? true;
  const log: NotificationsLog = {
    readAllPosts: 0,
    listCursors: [],
    settingsPuts: [],
  };

  const handler: FetchHandler = ({ method, path, search, body }) => {
    if (method === 'GET' && path === '/v1/notifications') {
      const cursor = new URLSearchParams(search).get('cursor');
      log.listCursors.push(cursor);
      if (!cursor) return json(200, pages[0] ?? makeNotificationsPage([]));
      const previous = pages.findIndex((page) => page.nextCursor === cursor);
      return json(200, pages[previous + 1] ?? makeNotificationsPage([]));
    }
    if (method === 'GET' && path === '/v1/notifications/unread-count') {
      return json(200, { count });
    }
    if (method === 'POST' && path === '/v1/notifications/read-all') {
      log.readAllPosts += 1;
      const updated = count;
      count = 0;
      return json(200, { updated });
    }
    if (method === 'GET' && path === '/v1/notifications/settings') {
      return json(200, { enabled });
    }
    if (method === 'PUT' && path === '/v1/notifications/settings') {
      log.settingsPuts.push(body);
      enabled = (body as { enabled: boolean }).enabled;
      if (!enabled) count = 0; // mute kills the badge server-side
      return json(200, { enabled });
    }
    return null;
  };

  return { handler, log };
}
