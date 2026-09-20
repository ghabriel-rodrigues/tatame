import { and, eq, isNotNull } from 'drizzle-orm';
import type { Database, DbTransaction } from '../lib/client.js';
import { withPlatform, withTenant } from '../lib/client.js';
import {
  academies,
  events,
  notifications,
  users,
  type notificationCategory,
} from '../schema/index.js';

/**
 * Notification fixtures (spec 010, NOT.2): mixed read/unread rows across all
 * five categories (`payment`/`event`/`graduation`/`attendance`/`store`) for
 * the fixture personas of both academies, so the bell badge and the
 * Notificações screens are demoable on first login. Copy mirrors the spec's
 * event → notification mapping templates (PT-BR, render-ready, amounts
 * pre-formatted from integer cents).
 *
 * Recipients are the seeded logins only (fan-out's own rule: no login, no
 * row). Bravo has no student/guardian login, so its rows land on the staff
 * logins (Bruno, Marcos) — demo-only addressing so every surface still
 * renders all five categories; runtime fan-out addressing is governed by the
 * listener, never by these fixtures.
 *
 * All rows go through `withTenant` (RLS honest). Idempotent: keyed on
 * (tenant, user, title) — skip-if-present keeps re-runs stable.
 */

type NotificationCategory = (typeof notificationCategory.enumValues)[number];

interface DevNotificationFixture {
  /** Recipient login. */
  email: string;
  category: NotificationCategory;
  chip: string | null;
  title: string;
  body: string | null;
  /** Semantic route; `event` is resolved to `event/{id}` per academy. */
  route: string | null;
  /** Days ago the notification "happened" (drives relative timestamps). */
  ageDays: number;
  read: boolean;
}

/** PT-BR month names for the mensalidade templates. */
const MONTHS_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const monthName = (offset: number): string => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return MONTHS_PT[d.getMonth()]!;
};

/** The published free fixture event both academies carry (spec 008 seeds). */
const FIXTURE_EVENT_NAME = 'Open Mat de Verao';

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 3600 * 1000);

function alphaFixtures(): DevNotificationFixture[] {
  return [
    // Ana (aluno): payment pair, the published event, her graduation, an order.
    {
      email: 'aluno@tatame.dev',
      category: 'payment',
      chip: 'R$',
      title: `Mensalidade de ${monthName(0)} disponível`,
      body: 'Vence dia 05 · R$ 180,00',
      route: 'wallet',
      ageDays: 0,
      read: false,
    },
    {
      email: 'aluno@tatame.dev',
      category: 'payment',
      chip: 'R$',
      title: 'Pagamento confirmado',
      body: `Mensalidade de ${monthName(-1)} · R$ 180,00`,
      route: 'wallet',
      ageDays: 12,
      read: true,
    },
    {
      email: 'aluno@tatame.dev',
      category: 'event',
      chip: null, // resolved to the event's day-of-month below
      title: FIXTURE_EVENT_NAME,
      body: 'Confirme sua presença',
      route: 'event',
      ageDays: 2,
      read: false,
    },
    {
      email: 'aluno@tatame.dev',
      category: 'graduation',
      chip: '2º',
      title: 'Você recebeu o 2º grau',
      body: 'Registrado pelo Prof. Paulo Professor',
      route: 'graduation',
      ageDays: 5,
      read: true,
    },
    {
      email: 'aluno@tatame.dev',
      category: 'store',
      chip: '#2427',
      title: 'Pedido #2427 entregue',
      body: 'Bom treino com o equipamento novo!',
      route: 'orders',
      ageDays: 8,
      read: true,
    },
    // Renata (responsável): guardian-billed charge, check-in, event confirm.
    {
      email: 'responsavel@tatame.dev',
      category: 'payment',
      chip: 'R$',
      title: 'Mensalidade de Kiko Kids em aberto',
      body: 'R$ 150,00 · pague com Pix em 1 toque',
      route: 'wallet',
      ageDays: 0,
      read: false,
    },
    {
      email: 'responsavel@tatame.dev',
      category: 'attendance',
      chip: 'KK',
      title: 'Kiko Kids fez check-in',
      body: 'Presença registrada às 18:03',
      route: null,
      ageDays: 1,
      read: false,
    },
    {
      email: 'responsavel@tatame.dev',
      category: 'event',
      chip: null,
      title: `Kiko Kids confirmado em ${FIXTURE_EVENT_NAME}`,
      body: 'Inscrição gratuita confirmada',
      route: 'event',
      ageDays: 3,
      read: true,
    },
    // Paulo (professor): the published event + his own store order.
    {
      email: 'professor@tatame.dev',
      category: 'event',
      chip: null,
      title: FIXTURE_EVENT_NAME,
      body: 'Confirme sua presença',
      route: 'event',
      ageDays: 2,
      read: false,
    },
    {
      email: 'professor@tatame.dev',
      category: 'store',
      chip: '#2429',
      title: 'Pedido #2429 pronto para retirada',
      body: 'Passe na recepção da academia',
      route: 'orders',
      ageDays: 2,
      read: true,
    },
    // Amanda (admin): the low-stock operational alert.
    {
      email: 'admin@tatame.dev',
      category: 'store',
      chip: '!',
      title: 'Estoque baixo: Protetor Bucal',
      body: '2 unidades restantes (alerta em 5)',
      route: 'store',
      ageDays: 1,
      read: false,
    },
    // Amanda (admin): a read graduation record (feed history demo).
    {
      email: 'admin@tatame.dev',
      category: 'graduation',
      chip: '2º',
      title: 'Ana Aluna recebeu o 2º grau na faixa Azul',
      body: 'Registrado pelo Prof. Paulo Professor',
      route: 'graduation',
      ageDays: 5,
      read: true,
    },
  ];
}

function bravoFixtures(): DevNotificationFixture[] {
  // Demo-only addressing: bravo's only logins are staff (see header note).
  return [
    {
      email: 'admin.bravo@tatame.dev',
      category: 'store',
      chip: '!',
      title: 'Estoque baixo: Protetor Bucal',
      body: '2 unidades restantes (alerta em 5)',
      route: 'store',
      ageDays: 0,
      read: false,
    },
    {
      email: 'admin.bravo@tatame.dev',
      category: 'event',
      chip: null,
      title: FIXTURE_EVENT_NAME,
      body: 'Confirme sua presença',
      route: 'event',
      ageDays: 4,
      read: true,
    },
    {
      email: 'admin.bravo@tatame.dev',
      category: 'graduation',
      chip: '2º',
      title: 'Fabio Fila recebeu o 2º grau na faixa Azul',
      body: 'Registrado pelo Prof. Marcos Multi',
      route: 'graduation',
      ageDays: 6,
      read: true,
    },
    {
      email: 'multi@tatame.dev',
      category: 'event',
      chip: null,
      title: FIXTURE_EVENT_NAME,
      body: 'Confirme sua presença',
      route: 'event',
      ageDays: 4,
      read: false,
    },
    {
      email: 'multi@tatame.dev',
      category: 'payment',
      chip: 'R$',
      title: 'Pagamento confirmado',
      body: `Mensalidade de ${monthName(-1)} · R$ 180,00`,
      route: 'wallet',
      ageDays: 9,
      read: true,
    },
    {
      email: 'multi@tatame.dev',
      category: 'attendance',
      chip: 'BB',
      title: 'Bento Bravo Jr fez check-in',
      body: 'Presença registrada às 18:05',
      route: null,
      ageDays: 1,
      read: false,
    },
    {
      email: 'multi@tatame.dev',
      category: 'store',
      chip: '#2430',
      title: 'Pedido #2430 pago',
      body: 'Protetor Bucal — retire na recepção da academia',
      route: 'orders',
      ageDays: 1,
      read: true,
    },
  ];
}

const DEV_NOTIFICATIONS: Record<string, () => DevNotificationFixture[]> = {
  'alpha-jj': alphaFixtures,
  'bravo-bjj': bravoFixtures,
};

export interface SeedNotificationHandles {
  /** RLS-enforced pool (`tatame_app`) — tenant-scoped rows go through it. */
  appDb: Database;
  /** BYPASSRLS pool (`tatame_platform`) — global lookups only. */
  platformDb: Database;
}

/**
 * Requires `seedDevFixtures` (users/memberships) and `seedEventFixtures`
 * (the published fixture event resolved for chips/routes) to have run first.
 */
export async function seedNotificationFixtures({
  appDb,
  platformDb,
}: SeedNotificationHandles): Promise<void> {
  for (const [slug, fixturesOf] of Object.entries(DEV_NOTIFICATIONS)) {
    const [academy] = await withPlatform(platformDb, (tx) =>
      tx
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.slug, slug)),
    );
    if (!academy)
      throw new Error(
        `Fixture academy ${slug} missing — run seedDevFixtures first`,
      );
    const tenantId = academy.id;

    const fixtures = fixturesOf();
    const userIdByEmail = new Map<string, string>();
    for (const email of [...new Set(fixtures.map((f) => f.email))]) {
      const [user] = await withPlatform(platformDb, (tx) =>
        tx.select({ id: users.id }).from(users).where(eq(users.email, email)),
      );
      if (!user)
        throw new Error(`Missing user ${email} — run seedDevFixtures first`);
      userIdByEmail.set(email, user.id);
    }

    await withTenant(appDb, tenantId, async (tx) => {
      // The published fixture event feeds the day-of-month chip + route.
      const [event] = await tx
        .select({ id: events.id, startsAt: events.startsAt })
        .from(events)
        .where(
          and(eq(events.name, FIXTURE_EVENT_NAME), isNotNull(events.startsAt)),
        );
      if (!event?.startsAt) {
        throw new Error(
          `Fixture event missing for ${slug} — run seedEventFixtures first`,
        );
      }
      const eventChip = String(event.startsAt.getDate());
      const eventRoute = `event/${event.id}`;

      for (const f of fixtures) {
        const userId = userIdByEmail.get(f.email)!;
        await ensureNotification(tx, {
          tenantId,
          userId,
          category: f.category,
          chip: f.category === 'event' ? eventChip : f.chip,
          title: f.title,
          body: f.body,
          route: f.route === 'event' ? eventRoute : f.route,
          createdAt: daysAgo(f.ageDays),
          readAt: f.read ? daysAgo(Math.max(f.ageDays - 1, 0)) : null,
        });
      }
    });
  }
}

/**
 * Inserts one notification keyed on (tenant, user, title) — skip-if-present
 * keeps re-runs stable. Fixtures are copy-complete (no per-row lookups).
 */
async function ensureNotification(
  tx: DbTransaction,
  n: {
    tenantId: string;
    userId: string;
    category: NotificationCategory;
    chip: string | null;
    title: string;
    body: string | null;
    route: string | null;
    createdAt: Date;
    readAt: Date | null;
  },
): Promise<void> {
  const found = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, n.tenantId),
        eq(notifications.userId, n.userId),
        eq(notifications.title, n.title),
      ),
    );
  if (found[0]) return;

  await tx.insert(notifications).values(n);
}
