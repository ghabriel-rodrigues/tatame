/**
 * Semantic-route → shell-route map (NOT.8-9, spec 010): notification rows
 * carry a semantic deep-link hint (`wallet`, `event/{id}`, `graduation`,
 * `orders`, `store`) — DB rows never encode router paths — and each persona
 * shell maps it onto its own navigation here. Unknown or null hints are
 * inert; a hint a persona has no surface for (professor `wallet` — no
 * financial access; responsável `orders`/`store` — no loja) is inert too.
 */

import type { NotificationPersona } from './types';

type SemanticHead = 'wallet' | 'event' | 'graduation' | 'orders' | 'store';

const SHELL_ROUTES: Record<
  NotificationPersona,
  Partial<Record<SemanticHead, (id?: string) => string | null>>
> = {
  aluno: {
    wallet: () => '/carteira',
    event: (id) => (id ? `/evento/${id}` : null),
    graduation: () => '/graduacao',
    orders: () => '/loja/pedidos',
    store: () => '/loja',
  },
  professor: {
    // No per-event professor surface — the calendário month view is where
    // academy events live for this persona (professor-02/calendar).
    event: () => '/calendario',
    orders: () => '/loja/pedidos',
    store: () => '/loja',
  },
  responsavel: {
    // Guardian hints per spec 010: payer routes land on Pagamentos, child
    // graduation news on the dependents panel, event news on Eventos.
    wallet: () => '/pagamentos',
    event: () => '/eventos',
    graduation: () => '/',
  },
};

/** Resolves a semantic hint to this shell's path; null = inert row. */
export function shellRouteFor(
  persona: NotificationPersona,
  route: string | null | undefined,
): string | null {
  if (!route) return null;
  const [head, id] = route.split('/', 2);
  const resolve = SHELL_ROUTES[persona][head as SemanticHead];
  return resolve ? resolve(id) : null;
}
