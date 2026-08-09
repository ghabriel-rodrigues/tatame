/**
 * Comprovante sheet (BIL.17/18, story 5/19): renders the receipt data of a
 * settled payment from GET /v1/billing/payments/:id/receipt — academy,
 * student, plan, competência, amount, method, paid date and the payment
 * identifier. Unsettled/foreign payments are a 404 server-side; the sheet
 * only ever shows server truth.
 */

import { View } from 'react-native';
import { BottomSheet, Text, useTheme } from '@tatame/design-system/native';
import { api } from '../../api/query';
import {
  METHOD_LABELS,
  formatBRL,
  mensalidadeTitle,
  monthNamePt,
  shortDayMonth,
} from './format';

export interface ReceiptSheetProps {
  open: boolean;
  onClose: () => void;
  paymentId: string | null;
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.space['3'],
        paddingVertical: theme.space['2'],
        borderBottomWidth: 1,
        borderBottomColor: theme.color.border['1'],
      }}
    >
      <Text variant="caption">{label}</Text>
      <Text variant="label" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

export function ReceiptSheet({ open, onClose, paymentId }: ReceiptSheetProps) {
  const theme = useTheme();
  const query = api.useQuery(
    'get',
    '/v1/billing/payments/{id}/receipt',
    { params: { path: { id: paymentId ?? '' } } },
    { enabled: open && !!paymentId },
  );
  const receipt = query.data;

  return (
    <BottomSheet open={open} onClose={onClose} title="Comprovante" testID="receipt-sheet">
      {query.isPending ? <Text variant="caption">Carregando comprovante…</Text> : null}
      {query.isError ? (
        <Text variant="caption" color={theme.color.danger['500']}>
          Não foi possível carregar o comprovante.
        </Text>
      ) : null}
      {receipt ? (
        <View style={{ gap: theme.space['2'] }}>
          <Text variant="title" weight="bold">
            {formatBRL(receipt.payment.amountCents)}
          </Text>
          <Text variant="caption">
            Mensalidade de {monthNamePt(receipt.charge.periodStart ?? receipt.charge.dueDate)}
            {receipt.academyName ? ` · ${receipt.academyName}` : ''}
          </Text>
          <View style={{ marginTop: theme.space['2'] }}>
            <ReceiptRow label="Aluno" value={receipt.studentName} />
            {receipt.planName ? <ReceiptRow label="Plano" value={receipt.planName} /> : null}
            <ReceiptRow label="Competência" value={mensalidadeTitle(receipt.charge)} />
            <ReceiptRow label="Método" value={METHOD_LABELS[receipt.payment.method]} />
            <ReceiptRow
              label="Pago em"
              value={receipt.payment.paidAt ? shortDayMonth(receipt.payment.paidAt) : '—'}
            />
            <ReceiptRow label="Identificador" value={receipt.payment.id.slice(0, 18)} />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}
