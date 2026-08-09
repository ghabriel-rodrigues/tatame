/**
 * Payment-flow plumbing shared by the three sheets (BIL.17/18): the
 * scope-aware create-payment mutation (aluno wallet vs responsável
 * per-dependent path) and the post-settlement invalidation list — wallet +
 * home alert for the aluno, payments + dependent cards for the responsável.
 * Server truth only: settlement lands via refetch, never optimistic.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/query';
import { billingErrorMessage } from './copy';
import type { PaymentCreatedResponse, PaymentView } from './types';

/** Which persona surface the sheet was opened from. */
export type PaymentScope = 'aluno' | 'responsavel';

/** Create-payment mutation for the scope's endpoint (same body/response). */
export function useCreatePayment(scope: PaymentScope) {
  const aluno = api.useMutation('post', '/v1/aluno/wallet/charges/{id}/payments');
  const responsavel = api.useMutation('post', '/v1/responsavel/payments/charges/{id}/payments');
  return scope === 'aluno' ? aluno : responsavel;
}

/**
 * Pix/boleto sheets: opens the settlement attempt on mount (the sheet is
 * mounted per attempt) and exposes the render-ready provider payload.
 */
export function usePendingPayment(options: {
  scope: PaymentScope;
  chargeId: string;
  method: 'pix' | 'boleto';
}): { payment: PaymentView | null; pending: boolean; error: string | null } {
  const create = useCreatePayment(options.scope);
  const [created, setCreated] = useState<PaymentCreatedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    create.mutate(
      { params: { path: { id: options.chargeId } }, body: { method: options.method } },
      {
        onSuccess: setCreated,
        onError: (mutationError) => setError(billingErrorMessage(mutationError)),
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only: one attempt per sheet mount

  return { payment: created?.payment ?? null, pending: create.isPending, error };
}

/**
 * "Simular pagamento" / "Simular compensação" (story 10/11): settles the
 * pending attempt through the simulate endpoint, then runs the scope's
 * invalidations so settlement lands via refetch.
 */
export function useSimulatePayment(onSettled: () => void): {
  run: (paymentId: string) => void;
  settled: boolean;
  pending: boolean;
  error: string | null;
} {
  const simulate = api.useMutation('post', '/v1/billing/payments/{id}/simulate');
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (paymentId: string) => {
    if (simulate.isPending || settled) return;
    setError(null);
    simulate.mutate(
      { params: { path: { id: paymentId } } },
      {
        onSuccess: () => {
          setSettled(true);
          onSettled();
        },
        onError: (mutationError) => setError(billingErrorMessage(mutationError)),
      },
    );
  };

  return { run, settled, pending: simulate.isPending, error };
}

/** Invalidates every money-displaying query of the scope after settlement. */
export function useSettleInvalidation(scope: PaymentScope): () => void {
  const queryClient = useQueryClient();
  return () => {
    if (scope === 'aluno') {
      void queryClient.invalidateQueries({ queryKey: ['get', '/v1/aluno/wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['get', '/v1/aluno/home'] });
    } else {
      void queryClient.invalidateQueries({ queryKey: ['get', '/v1/responsavel/payments'] });
      void queryClient.invalidateQueries({ queryKey: ['get', '/v1/responsavel/dependents'] });
    }
  };
}
