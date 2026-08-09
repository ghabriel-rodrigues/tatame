/**
 * Boleto payment sheet (BIL.17, aluno-14): opening creates the settlement
 * attempt and renders the provider's linha digitável with the barcode
 * illustration, "Copiar linha digitável" and "Simular compensação" — the
 * simulate affordance rendered ONLY on the simulated provider (story 44).
 * Real-life compensação is async; the SLA line is provider copy, not schema.
 */

import { useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheet, TatameButton, Text, useTheme } from '@tatame/design-system/native';
import { isSimulated, providerField } from './format';
import { BarcodeStripes, CopiedNotice, PaymentSuccess } from './ui';
import { usePendingPayment, useSimulatePayment, useSettleInvalidation, type PaymentScope } from './use-payment';

export interface BoletoSheetProps {
  open: boolean;
  onClose: () => void;
  scope: PaymentScope;
  chargeId: string;
  /** "Mensalidade de agosto · vence em 10/08 · R$ 180,00". */
  subtitle: string;
}

export function BoletoSheet({ open, onClose, scope, chargeId, subtitle }: BoletoSheetProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const { payment, pending, error } = usePendingPayment({ scope, chargeId, method: 'boleto' });
  const invalidate = useSettleInvalidation(scope);
  const simulate = useSimulatePayment(invalidate);

  const linhaDigitavel = payment ? providerField(payment, 'linhaDigitavel') : null;
  const barcodePayload = payment ? providerField(payment, 'barcodePayload') : null;

  const copy = () => {
    if (!linhaDigitavel) return;
    void Clipboard.setStringAsync(linhaDigitavel);
    setCopied(true);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Boleto bancário"
      subtitle={subtitle}
      testID="boleto-sheet"
    >
      {simulate.settled ? (
        <PaymentSuccess caption="O boleto foi compensado." onClose={onClose} />
      ) : (
        <View style={{ gap: theme.space['4'] }}>
          {pending ? <Text variant="caption">Gerando boleto…</Text> : null}
          {error ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {error}
            </Text>
          ) : null}
          {payment ? (
            <>
              <View
                style={{
                  gap: theme.space['3'],
                  padding: theme.space['4'],
                  borderRadius: theme.radius.lg,
                  borderWidth: 1,
                  borderColor: theme.color.border['1'],
                  backgroundColor: theme.color.bg.surface,
                }}
              >
                <BarcodeStripes
                  payload={barcodePayload ?? linhaDigitavel ?? ''}
                  testID="boleto-barcode"
                />
                <Text
                  variant="caption"
                  weight="bold"
                  style={{ textAlign: 'center', fontSize: 11.5 }}
                >
                  {linhaDigitavel}
                </Text>
              </View>
              <TatameButton
                fullWidth
                variant="secondary"
                label="Copiar linha digitável"
                disabled={!linhaDigitavel}
                onPress={copy}
              />
              {copied ? (
                <CopiedNotice
                  message="Linha digitável copiada."
                  onHide={() => setCopied(false)}
                />
              ) : null}
              {simulate.error ? (
                <Text variant="caption" color={theme.color.danger['500']}>
                  {simulate.error}
                </Text>
              ) : null}
              {isSimulated(payment) ? (
                <TatameButton
                  fullWidth
                  label="Simular compensação"
                  loading={simulate.pending}
                  onPress={() => simulate.run(payment.id)}
                />
              ) : null}
              <Text variant="caption" style={{ textAlign: 'center', fontSize: 11 }}>
                Boletos são compensados em até 1 dia útil após o pagamento.
              </Text>
            </>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}
