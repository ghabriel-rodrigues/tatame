/**
 * Billing fixtures for the RN suites (BIL.16-18). Local mirror of the
 * shared contract types (the shared testing entry pulls msw, which the RN
 * jest env does not run), shaped to the handoff screenshots aluno-12…15 and
 * responsavel-04/05 and the BIL.5 seed catalog (Mensal R$ 180 · Kids Mensal
 * R$ 150).
 */

import type {
  ChargeWithPayments,
  GuardianHistoryEntry,
  GuardianPaymentsResponse,
  HistoryEntry,
  MensalidadeAlert,
  PaymentView,
  ReceiptResponse,
  WalletPlan,
  WalletResponse,
} from '../../src/features/billing/types';
import { STUDENT_ID } from './attendance';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

export const PLAN_ID = uuid('b001', 1);
export const KIDS_PLAN_ID = uuid('b001', 2);
export const CHARGE_ID = uuid('b002', 1);
export const PEDRO_CHARGE_ID = uuid('b002', 2);
export const JULIA_CHARGE_ID = uuid('b002', 3);
export const PIX_PAYMENT_ID = uuid('b003', 1);
export const JULIA_PAYMENT_ID = uuid('b003', 2);
export const HISTORY_PAYMENT_JUL = uuid('b003', 11);
export const HISTORY_PAYMENT_JUN = uuid('b003', 12);

export function makePlanView(overrides: Partial<WalletPlan> = {}): WalletPlan {
  return {
    id: PLAN_ID,
    name: 'Mensal',
    amountCents: 18_000,
    currency: 'BRL',
    recurrence: 'monthly',
    dueDay: 10,
    isActive: true,
    ...overrides,
  };
}

export function makePixPayment(overrides: Partial<PaymentView> = {}): PaymentView {
  return {
    id: PIX_PAYMENT_ID,
    chargeId: CHARGE_ID,
    method: 'pix',
    status: 'pending',
    amountCents: 18_000,
    currency: 'BRL',
    provider: 'simulated',
    providerData: {
      qrPayload: `TATAME-SIM-PIX-${CHARGE_ID}`,
      copiaECola: `TATAME-SIM-PIX-${CHARGE_ID}`,
    } as unknown as PaymentView['providerData'],
    paidAt: null,
    receiptUrl: null,
    ...overrides,
  };
}

export const LINHA_DIGITAVEL = '34191.79001 01043.510047 91020.150008 6 84410000018000';

export function makeBoletoPayment(overrides: Partial<PaymentView> = {}): PaymentView {
  return makePixPayment({
    method: 'boleto',
    providerData: {
      linhaDigitavel: LINHA_DIGITAVEL,
      barcodePayload: LINHA_DIGITAVEL.replace(/\D/g, ''),
    } as unknown as PaymentView['providerData'],
    ...overrides,
  });
}

/** aluno-12: "Mensalidade · agosto" R$ 180,00, vence em 10 de agosto. */
export function makeOpenCharge(
  overrides: Partial<ChargeWithPayments> = {},
): ChargeWithPayments {
  return {
    id: CHARGE_ID,
    studentId: STUDENT_ID,
    guardianId: null,
    status: 'open',
    overdue: false,
    amountCents: 18_000,
    currency: 'BRL',
    dueDate: '2026-08-10',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    academyPlanId: PLAN_ID,
    payments: [],
    ...overrides,
  };
}

export function makePaidCharge(
  overrides: Partial<ChargeWithPayments> = {},
): ChargeWithPayments {
  return makeOpenCharge({
    status: 'paid',
    payments: [
      makePixPayment({ status: 'succeeded', paidAt: '2026-08-05T14:00:00.000Z' }),
    ],
    ...overrides,
  });
}

/** aluno-12 histórico: julho + junho paid via Pix. */
export function makeHistory(): HistoryEntry[] {
  return [
    {
      studentId: STUDENT_ID,
      chargeId: uuid('b002', 11),
      periodStart: '2026-07-01',
      amountCents: 18_000,
      currency: 'BRL',
      chargeStatus: 'paid',
      paymentId: HISTORY_PAYMENT_JUL,
      method: 'pix',
      paidAt: '2026-07-08T12:00:00.000Z',
      receiptUrl: null,
    },
    {
      studentId: STUDENT_ID,
      chargeId: uuid('b002', 12),
      periodStart: '2026-06-01',
      amountCents: 18_000,
      currency: 'BRL',
      chargeStatus: 'paid',
      paymentId: HISTORY_PAYMENT_JUN,
      method: 'pix',
      paidAt: '2026-06-05T12:00:00.000Z',
      receiptUrl: null,
    },
  ];
}

export interface WalletOptions {
  /** No assigned plan → clean empty state (story 8). */
  empty?: boolean;
  /** Current charge settled (Paga chip). */
  paid?: boolean;
  /** Lazy-flip overdue current charge (Em atraso chip). */
  overdue?: boolean;
  /** Active card mandate → recurrence banner (story 6). */
  recurrence?: boolean;
  history?: HistoryEntry[];
}

export function makeWallet(options: WalletOptions = {}): WalletResponse {
  if (options.empty) {
    return {
      student: { id: STUDENT_ID, fullName: 'Lucas Almeida' },
      plan: null,
      currentCharge: null,
      recurrence: { active: false, nextChargeDueDate: null },
      history: [],
    };
  }
  const charge = options.paid
    ? makePaidCharge()
    : options.overdue
      ? makeOpenCharge({ status: 'overdue', overdue: true, dueDate: '2026-07-10' })
      : makeOpenCharge();
  return {
    student: { id: STUDENT_ID, fullName: 'Lucas Almeida' },
    plan: makePlanView(),
    currentCharge: charge,
    recurrence: options.recurrence
      ? { active: true, nextChargeDueDate: '2026-09-01' }
      : { active: false, nextChargeDueDate: null },
    history: options.history ?? makeHistory(),
  };
}

/** Home alert payload (story 7) — chargeId deep-links into the Carteira. */
export function makeMensalidadeAlert(
  overrides: Partial<MensalidadeAlert> = {},
): MensalidadeAlert {
  return {
    chargeId: CHARGE_ID,
    amountCents: 18_000,
    currency: 'BRL',
    dueDate: '2026-08-10',
    overdue: false,
    periodStart: '2026-08-01',
    ...overrides,
  };
}

export const PEDRO_ID = uuid('8006', 1);
export const JULIA_ID = uuid('8006', 2);

/**
 * responsavel-04: Pedro · agosto Em aberto (Kids Mensal R$ 150, vence 10 de
 * agosto) + Júlia · agosto Paga em 02/08 via recorrência no cartão.
 */
export function makeGuardianPayments(
  overrides: Partial<GuardianPaymentsResponse> = {},
): GuardianPaymentsResponse {
  const kidsPlan = makePlanView({ id: KIDS_PLAN_ID, name: 'Kids', amountCents: 15_000 });
  const history: GuardianHistoryEntry[] = [
    {
      studentId: PEDRO_ID,
      studentName: 'Pedro Silveira',
      chargeId: uuid('b002', 21),
      periodStart: '2026-07-01',
      amountCents: 15_000,
      currency: 'BRL',
      chargeStatus: 'paid',
      paymentId: uuid('b003', 21),
      method: 'pix',
      paidAt: '2026-07-08T12:00:00.000Z',
      receiptUrl: null,
    },
    {
      studentId: JULIA_ID,
      studentName: 'Júlia Silveira',
      chargeId: uuid('b002', 22),
      periodStart: '2026-07-01',
      amountCents: 15_000,
      currency: 'BRL',
      chargeStatus: 'paid',
      paymentId: uuid('b003', 22),
      method: 'card',
      paidAt: '2026-07-02T12:00:00.000Z',
      receiptUrl: null,
    },
  ];
  return {
    dependents: [
      {
        studentId: PEDRO_ID,
        fullName: 'Pedro Silveira',
        plan: kidsPlan,
        currentCharge: makeOpenCharge({
          id: PEDRO_CHARGE_ID,
          studentId: PEDRO_ID,
          amountCents: 15_000,
          academyPlanId: KIDS_PLAN_ID,
        }),
        recurrenceActive: false,
      },
      {
        studentId: JULIA_ID,
        fullName: 'Júlia Silveira',
        plan: kidsPlan,
        currentCharge: makeOpenCharge({
          id: JULIA_CHARGE_ID,
          studentId: JULIA_ID,
          amountCents: 15_000,
          academyPlanId: KIDS_PLAN_ID,
          status: 'paid',
          payments: [
            makePixPayment({
              id: JULIA_PAYMENT_ID,
              chargeId: JULIA_CHARGE_ID,
              method: 'card',
              status: 'succeeded',
              amountCents: 15_000,
              paidAt: '2026-08-02T12:00:00.000Z',
              providerData: null,
            }),
          ],
        }),
        recurrenceActive: true,
      },
    ],
    history,
    ...overrides,
  };
}

/** Comprovante payload for the settled julho Pix payment. */
export function makeReceipt(overrides: Partial<ReceiptResponse> = {}): ReceiptResponse {
  return {
    payment: makePixPayment({
      id: HISTORY_PAYMENT_JUL,
      status: 'succeeded',
      paidAt: '2026-07-08T12:00:00.000Z',
      providerData: null,
    }),
    charge: {
      id: uuid('b002', 11),
      studentId: STUDENT_ID,
      guardianId: null,
      status: 'paid',
      overdue: false,
      amountCents: 18_000,
      currency: 'BRL',
      dueDate: '2026-07-10',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      academyPlanId: PLAN_ID,
    },
    studentName: 'Lucas Almeida',
    planName: 'Mensal',
    academyName: 'Alpha Jiu-Jitsu',
    ...overrides,
  };
}
