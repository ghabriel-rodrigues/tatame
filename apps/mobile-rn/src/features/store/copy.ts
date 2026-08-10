/**
 * Fixed PT-BR copy + problem+json mapping for the store surface (spec 009).
 * Copy is pinned by the prototypes (aluno-16/17, professor-13/14); clients
 * branch on stable codes, never on human text. The store codes are mapped
 * by literal here until the shared ApiErrorCodes mirror gains them
 * (additive shared bump owned by web — same as the events slice).
 */

import { parseProblem } from '@tatame/shared';

export const STORE_SUBTITLE = 'Produtos oficiais · retirada na recepção';
export const STORE_ROW_TITLE = 'Loja da academia';
export const SEARCH_PLACEHOLDER = 'Buscar por nome ou tag (ex: kimono, treino)';
export const ALL_CHIP_LABEL = 'Tudo';
export const EMPTY_VITRINE = 'Nenhum produto encontrado';
export const EMPTY_VITRINE_CAPTION = 'Ajuste a busca ou o filtro de categoria.';
export const SIZE_LABEL = 'Tamanho';
export const QUANTITY_LABEL = 'Quantidade';
export const SOLD_OUT_LABEL = 'Esgotado';
export const PAID_SUCCESS = 'Pedido pago — retire na recepção da academia.';
export const MY_ORDERS_TITLE = 'Meus pedidos';
export const EMPTY_ORDERS = 'Nenhum pedido ainda';
export const EMPTY_ORDERS_CAPTION = 'Suas compras na loja da academia aparecem aqui.';
export const RESUME_PAYMENT_LABEL = 'Pagar';
export const CANCEL_ORDER_LABEL = 'Cancelar pedido';

/** "Loja Horizonte" (aluno-16 header). */
export function storeTitle(academyName?: string | null): string {
  return academyName ? `Loja ${academyName}` : 'Loja da academia';
}

/** Pix sheet address: "Pedido #2431 · Kimono oficial Horizonte" (spec 009). */
export function pedidoSubtitle(number: number, productName: string): string {
  return `Pedido #${number} · ${productName}`;
}

const MESSAGES: Record<string, string> = {
  'store.insufficient_stock': 'Estoque insuficiente para essa quantidade.',
  'store.size_required': 'Escolha um tamanho para continuar.',
  'store.size_invalid': 'Tamanho indisponível para este produto.',
  'store.product_not_purchasable': 'Este produto não está mais disponível na loja.',
  'store.order_not_cancelable': 'Pedido pago só pode ser cancelado pela academia.',
  'billing.charge_not_payable': 'Esta cobrança não está mais em aberto — atualize seus pedidos.',
  'tenant.read_only':
    'A academia está em modo somente leitura — novas compras estão desabilitadas.',
  'resource.not_found': 'Produto não encontrado.',
  'validation.failed': 'Dados inválidos. Revise e tente novamente.',
};

export const GENERIC_STORE_ERROR = 'Algo deu errado. Tente novamente.';

/** Maps an openapi-fetch error payload to the PT-BR user message. */
export function storeErrorMessage(error: unknown): string {
  const problem = parseProblem(error);
  if (!problem) return GENERIC_STORE_ERROR;
  return MESSAGES[problem.code] ?? GENERIC_STORE_ERROR;
}
