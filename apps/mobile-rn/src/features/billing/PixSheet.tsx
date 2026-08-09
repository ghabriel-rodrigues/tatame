/**
 * Pix payment sheet (BIL.17, aluno-13 / responsavel-05): opening creates the
 * settlement attempt and renders the provider's QR payload with the amount,
 * "Copiar código Pix" (copia-e-cola → clipboard + confirmation) and the
 * "Simular pagamento" button — rendered ONLY when the payment carries the
 * simulated provider (story 44). Settlement flips the mensalidade card via
 * the scope's query invalidations, never optimistically.
 */

import { useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { BottomSheet, TatameButton, Text, useTheme } from '@tatame/design-system/native';
import { formatBRL, isSimulated, providerField } from './format';
import { CopiedNotice, PaymentSuccess } from './ui';
import { usePendingPayment, useSimulatePayment, useSettleInvalidation, type PaymentScope } from './use-payment';

export interface PixSheetProps {
  open: boolean;
  onClose: () => void;
  scope: PaymentScope;
  chargeId: string;
  amountCents: number;
  /** "Mensalidade de agosto · Horizonte BJJ" / "· Pedro Silveira" (story 18). */
  subtitle: string;
}

export function PixSheet({ open, onClose, scope, chargeId, amountCents, subtitle }: PixSheetProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const { payment, pending, error } = usePendingPayment({ scope, chargeId, method: 'pix' });
  const invalidate = useSettleInvalidation(scope);
  const simulate = useSimulatePayment(invalidate);

  const qrPayload = payment ? providerField(payment, 'qrPayload') : null;
  const copiaECola = payment ? providerField(payment, 'copiaECola') : null;

  const copy = () => {
    if (!copiaECola) return;
    void Clipboard.setStringAsync(copiaECola);
    setCopied(true);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Pagar com Pix" subtitle={subtitle} testID="pix-sheet">
      {simulate.settled ? (
        <PaymentSuccess caption="A mensalidade foi paga via Pix." onClose={onClose} />
      ) : (
        <View style={{ gap: theme.space['4'], alignItems: 'stretch' }}>
          {pending ? <Text variant="caption">Gerando cobrança Pix…</Text> : null}
          {error ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {error}
            </Text>
          ) : null}
          {payment ? (
            <>
              <View style={{ alignItems: 'center', gap: theme.space['3'] }}>
                <View
                  testID="pix-qr"
                  style={{
                    padding: theme.space['3'],
                    borderRadius: theme.radius.lg,
                    borderWidth: 1,
                    borderColor: theme.color.border['1'],
                    backgroundColor: theme.color.bg.surface,
                  }}
                >
                  <QRCode
                    value={qrPayload ?? copiaECola ?? 'pix'}
                    size={150}
                    color={theme.color.fg['1']}
                    backgroundColor={theme.color.bg.surface}
                  />
                </View>
                <Text variant="title" weight="bold">
                  {formatBRL(amountCents)}
                </Text>
              </View>
              <TatameButton
                fullWidth
                variant="secondary"
                label="Copiar código Pix"
                disabled={!copiaECola}
                onPress={copy}
              />
              {copied ? (
                <CopiedNotice message="Código Pix copiado." onHide={() => setCopied(false)} />
              ) : null}
              {simulate.error ? (
                <Text variant="caption" color={theme.color.danger['500']}>
                  {simulate.error}
                </Text>
              ) : null}
              {isSimulated(payment) ? (
                <TatameButton
                  fullWidth
                  label="Simular pagamento"
                  loading={simulate.pending}
                  onPress={() => simulate.run(payment.id)}
                />
              ) : null}
            </>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}
