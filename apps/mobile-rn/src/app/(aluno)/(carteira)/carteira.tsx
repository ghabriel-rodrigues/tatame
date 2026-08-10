/**
 * Aluno Carteira (BIL.16, aluno-12): real wallet fed by GET /v1/aluno/wallet
 * (the fetch itself materializes the current cycle server-side) — plan
 * header line, mensalidade card with the Em aberto/Em atraso/Paga chip and
 * the Pix/Boleto/Cartão actions (BIL.17 sheets), the "Cobrança recorrente
 * ativa" banner with the cancel action (story 6/14), the histórico of
 * settled charges with "Ver comprovante", and the clean no-plan empty state
 * (story 8 — billing never invents money).
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Repeat } from 'lucide-react-native';
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
import { billingErrorMessage } from '../../../features/billing/copy';
import {
  chargeChip,
  dueLabel,
  formatBRL,
  historyTitle,
  isPayable,
  mensalidadeTitle,
  monthNamePt,
  paidLine,
  planHeaderLine,
  recurrenceBannerLine,
  settledPayment,
  shortDayMonth,
} from '../../../features/billing/format';
import { BoletoSheet } from '../../../features/billing/BoletoSheet';
import { CardSheet } from '../../../features/billing/CardSheet';
import { PixSheet } from '../../../features/billing/PixSheet';
import { ReceiptSheet } from '../../../features/billing/ReceiptSheet';
import { HistoryRow } from '../../../features/billing/ui';
import { QueryState } from '../../../features/enrollment/ui';
import { useSession } from '../../../session/session-store';

type SheetMethod = 'pix' | 'boleto' | 'card';

export default function AlunoCarteiraScreen() {
  const theme = useTheme();
  const { session } = useSession();

  const walletQuery = api.useQuery('get', '/v1/aluno/wallet');
  const cancelMandate = api.useMutation('delete', '/v1/aluno/wallet/mandate');

  const [sheet, setSheet] = useState<SheetMethod | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [mandateError, setMandateError] = useState<string | null>(null);

  const wallet = walletQuery.data;
  const plan = wallet?.plan ?? null;
  const charge = wallet?.currentCharge ?? null;
  const recurrence = wallet?.recurrence;
  const history = wallet?.history ?? [];
  const academyName = session?.academy?.name ?? '';

  const cancelRecurrence = () => {
    if (cancelMandate.isPending) return;
    setMandateError(null);
    cancelMandate.mutate(
      {},
      {
        onSuccess: () => void walletQuery.refetch(),
        onError: (mutationError) => setMandateError(billingErrorMessage(mutationError)),
      },
    );
  };

  const chargeMonth = charge ? monthNamePt(charge.periodStart ?? charge.dueDate) : '';
  const paid = charge ? settledPayment(charge) : null;
  const chip = charge ? chargeChip(charge) : null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            title="Carteira"
            subtitle={plan ? planHeaderLine(plan) : undefined}
          />

          <QueryState loading={walletQuery.isPending} error={walletQuery.isError}>
            {wallet && !plan ? (
              <Card testID="wallet-empty">
                <View style={{ gap: 4 }}>
                  <Text variant="label">Sem plano de mensalidade</Text>
                  <Text variant="caption">
                    Quando a academia atribuir um plano a você, as cobranças aparecem
                    aqui.
                  </Text>
                </View>
              </Card>
            ) : null}

            {charge && chip ? (
              <Card testID="mensalidade-card" padding={theme.space['5']}>
                <View style={{ gap: theme.space['3'] }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text variant="label">{mensalidadeTitle(charge)}</Text>
                    <Chip label={chip.label} tone={chip.tone} testID="mensalidade-chip" />
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text variant="display" weight="bold" style={{ fontSize: 28 }}>
                      {formatBRL(charge.amountCents)}
                    </Text>
                    {isPayable(charge) ? (
                      <Text variant="caption">{dueLabel(charge.dueDate)}</Text>
                    ) : paid ? (
                      <Text variant="caption">
                        {paidLine(paid.method, paid.paidAt)}
                      </Text>
                    ) : null}
                  </View>
                  {isPayable(charge) ? (
                    <View style={{ gap: theme.space['2'] }}>
                      <TatameButton
                        fullWidth
                        label="Pagar com Pix"
                        onPress={() => setSheet('pix')}
                      />
                      <View style={{ flexDirection: 'row', gap: theme.space['2'] }}>
                        <View style={{ flex: 1 }}>
                          <TatameButton
                            fullWidth
                            variant="secondary"
                            label="Boleto"
                            onPress={() => setSheet('boleto')}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <TatameButton
                            fullWidth
                            variant="secondary"
                            label="Cartão"
                            onPress={() => setSheet('card')}
                          />
                        </View>
                      </View>
                    </View>
                  ) : paid ? (
                    <TatameButton
                      fullWidth
                      variant="secondary"
                      label="Ver comprovante"
                      onPress={() => setReceiptId(paid.id)}
                    />
                  ) : null}
                </View>
              </Card>
            ) : null}

            {plan && !charge ? (
              <Card>
                <View style={{ gap: 4 }}>
                  <Text variant="label">Nenhuma cobrança em aberto</Text>
                  <Text variant="caption">
                    A mensalidade do próximo ciclo aparece aqui quando for gerada.
                  </Text>
                </View>
              </Card>
            ) : null}

            {recurrence?.active ? (
              <Card variant="tinted" testID="recurrence-banner" padding={theme.space['4']}>
                <View style={{ gap: theme.space['2'] }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: theme.space['3'],
                    }}
                  >
                    <View
                      accessibilityElementsHidden
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: theme.color.brand.tint,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Repeat size={15} color={theme.color.brand['1']} />
                    </View>
                    <Text variant="caption" style={{ flex: 1 }}>
                      {recurrenceBannerLine(recurrence.nextChargeDueDate)}
                    </Text>
                  </View>
                  {mandateError ? (
                    <Text variant="caption" color={theme.color.danger['500']}>
                      {mandateError}
                    </Text>
                  ) : null}
                  <TatameButton
                    size="sm"
                    variant="ghost"
                    label="Cancelar recorrência"
                    loading={cancelMandate.isPending}
                    onPress={cancelRecurrence}
                  />
                </View>
              </Card>
            ) : null}

            {history.length > 0 ? (
              <View style={{ gap: theme.space['3'] }}>
                <Text variant="subtitle">Histórico</Text>
                <Card padding={theme.space['4']}>
                  {history.map((entry, index) => (
                    <HistoryRow
                      key={entry.paymentId}
                      testID={`history-${entry.paymentId}`}
                      title={historyTitle(entry)}
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

      {charge && sheet === 'pix' ? (
        <PixSheet
          open
          onClose={() => setSheet(null)}
          scope="aluno"
          chargeId={charge.id}
          amountCents={charge.amountCents}
          subtitle={`Mensalidade de ${chargeMonth}${academyName ? ` · ${academyName}` : ''}`}
        />
      ) : null}
      {charge && sheet === 'boleto' ? (
        <BoletoSheet
          open
          onClose={() => setSheet(null)}
          scope="aluno"
          chargeId={charge.id}
          subtitle={`Mensalidade de ${chargeMonth} · vence em ${shortDayMonth(charge.dueDate)} · ${formatBRL(charge.amountCents)}`}
        />
      ) : null}
      {charge && sheet === 'card' ? (
        <CardSheet
          open
          onClose={() => setSheet(null)}
          scope="aluno"
          chargeId={charge.id}
          amountCents={charge.amountCents}
          subtitle={`Mensalidade de ${chargeMonth} · ${formatBRL(charge.amountCents)}`}
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
