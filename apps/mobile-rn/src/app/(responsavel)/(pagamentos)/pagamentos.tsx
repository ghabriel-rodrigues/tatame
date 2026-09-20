/**
 * Responsável Pagamentos (BIL.18, responsavel-04/05): one card per
 * dependent from GET /v1/responsavel/payments (the fetch materializes the
 * dependents' current cycle) — "Pedro · agosto" with the amount, the
 * Em aberto/Em atraso/Paga chip and the plan subtitle; "Pagar com Pix"
 * opens the BIL.17 Pix sheet addressed to that child (story 18) with the
 * same simulate gating; settled cards show the paid line ("via recorrência
 * no cartão" when the mandate settled it — story 19) and "Ver comprovante";
 * plus the consolidated histórico across dependents (story 20).
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import {
  Card,
  Chip,
  ScreenHeader,
  TatameButton,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import {
  RECURRENCE_LABELS,
  chargeChip,
  dueLabel,
  formatBRL,
  isPayable,
  monthNamePt,
  paidLine,
  settledPayment,
} from '../../../features/billing/format';
import { PixSheet } from '../../../features/billing/PixSheet';
import { ReceiptSheet } from '../../../features/billing/ReceiptSheet';
import { HistoryRow } from '../../../features/billing/ui';
import type { DependentPayments } from '../../../features/billing/types';
import { QueryState } from '../../../features/enrollment/ui';

function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

function DependentChargeCard({
  dependent,
  onPayPix,
  onReceipt,
}: {
  dependent: DependentPayments;
  onPayPix: (chargeId: string, month: string, amountCents: number) => void;
  onReceipt: (paymentId: string) => void;
}) {
  const theme = useTheme();
  const charge = dependent.currentCharge ?? null;
  const plan = dependent.plan ?? null;

  if (!plan) {
    return (
      <Card testID={`dependent-charge-${dependent.studentId}`}>
        <View style={{ gap: 4 }}>
          <Text variant="label">{dependent.fullName}</Text>
          <Text variant="caption">Sem plano de mensalidade.</Text>
        </View>
      </Card>
    );
  }
  if (!charge) {
    return (
      <Card testID={`dependent-charge-${dependent.studentId}`}>
        <View style={{ gap: 4 }}>
          <Text variant="label">{dependent.fullName}</Text>
          <Text variant="caption">Nenhuma cobrança em aberto.</Text>
        </View>
      </Card>
    );
  }

  const chip = chargeChip(charge);
  const month = monthNamePt(charge.periodStart ?? charge.dueDate);
  const paid = settledPayment(charge);
  const paidViaMandate = dependent.recurrenceActive && paid?.method === 'card';

  return (
    <Card
      testID={`dependent-charge-${dependent.studentId}`}
      padding={theme.space['5']}
    >
      <View style={{ gap: theme.space['3'] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text variant="label">{`${firstName(dependent.fullName)} · ${month}`}</Text>
          <Chip label={chip.label} tone={chip.tone} />
        </View>
        <View style={{ gap: 2 }}>
          <Text variant="display" weight="bold" style={{ fontSize: 26 }}>
            {formatBRL(charge.amountCents)}
          </Text>
          {isPayable(charge) ? (
            <Text variant="caption">
              {dueLabel(charge.dueDate)} · plano {plan.name}{' '}
              {RECURRENCE_LABELS[plan.recurrence]}
            </Text>
          ) : paid ? (
            <Text variant="caption">
              {paidLine(paid.method, paid.paidAt, paidViaMandate)}
            </Text>
          ) : null}
        </View>
        {isPayable(charge) ? (
          <TatameButton
            fullWidth
            label="Pagar com Pix"
            onPress={() => onPayPix(charge.id, month, charge.amountCents)}
          />
        ) : paid ? (
          <TatameButton
            fullWidth
            variant="secondary"
            label="Ver comprovante"
            onPress={() => onReceipt(paid.id)}
          />
        ) : null}
      </View>
    </Card>
  );
}

export default function ResponsavelPagamentosScreen() {
  const theme = useTheme();
  const query = api.useQuery('get', '/v1/responsavel/payments');

  const [pixTarget, setPixTarget] = useState<{
    chargeId: string;
    subtitle: string;
    amountCents: number;
  } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const dependents = query.data?.dependents ?? [];
  const history = query.data?.history ?? [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['5'],
          paddingBottom: 130,
        }}
      >
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            title="Pagamentos"
            subtitle="Mensalidades dos seus dependentes"
          />

          <QueryState loading={query.isPending} error={query.isError}>
            {dependents.length === 0 ? (
              <Card>
                <View style={{ gap: 4 }}>
                  <Text variant="label">Nenhuma mensalidade por aqui</Text>
                  <Text variant="caption">
                    As cobranças dos seus dependentes aparecem aqui quando a
                    academia atribuir um plano.
                  </Text>
                </View>
              </Card>
            ) : (
              dependents.map((dependent) => (
                <DependentChargeCard
                  key={dependent.studentId}
                  dependent={dependent}
                  onPayPix={(chargeId, month, amountCents) =>
                    setPixTarget({
                      chargeId,
                      amountCents,
                      subtitle: `Mensalidade de ${month} · ${dependent.fullName}`,
                    })
                  }
                  onReceipt={setReceiptId}
                />
              ))
            )}

            {history.length > 0 ? (
              <View style={{ gap: theme.space['3'] }}>
                <Text variant="subtitle">Histórico</Text>
                <Card padding={theme.space['4']}>
                  {history.map((entry, index) => (
                    <HistoryRow
                      key={entry.paymentId}
                      testID={`history-${entry.paymentId}`}
                      title={`${firstName(entry.studentName)} · ${monthNamePt(entry.periodStart ?? entry.paidAt ?? '')}`}
                      subtitle={paidLine(entry.method, entry.paidAt)}
                      amountCents={entry.amountCents}
                      divider={index < history.length - 1}
                      onPressReceipt={() => setReceiptId(entry.paymentId)}
                    />
                  ))}
                </Card>
              </View>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>

      {pixTarget ? (
        <PixSheet
          open
          onClose={() => setPixTarget(null)}
          scope="responsavel"
          chargeId={pixTarget.chargeId}
          amountCents={pixTarget.amountCents}
          subtitle={pixTarget.subtitle}
        />
      ) : null}
      <ReceiptSheet
        open={receiptId !== null}
        onClose={() => setReceiptId(null)}
        paymentId={receiptId}
      />
    </SafeAreaView>
  );
}
