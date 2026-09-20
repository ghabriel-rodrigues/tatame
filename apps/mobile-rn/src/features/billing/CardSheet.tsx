/**
 * Cartão payment sheet (BIL.17, aluno-15): número / nome impresso /
 * validade / CVV fields with the "Usar este cartão na recorrência mensal"
 * toggle above "Pagar R$ …". The number is masked client-side for display,
 * but ONLY display metadata (holder name + last4) is ever posted — the
 * backend rule for the simulated provider. Card settles inline through the
 * normalized-event handler; the recurrence toggle creates the mandate in
 * the same gesture (story 12/13).
 */

import { useState } from 'react';
import { Switch, View } from 'react-native';
import {
  BottomSheet,
  FormField,
  TatameButton,
  Text,
  useTheme,
} from '@tatame/design-system/native';
import { billingErrorMessage } from './copy';
import {
  cardFormValid,
  cardLast4,
  formatBRL,
  maskCardNumber,
  maskExpiry,
} from './format';
import { PaymentSuccess } from './ui';
import {
  useCreatePayment,
  useSettleInvalidation,
  type PaymentScope,
} from './use-payment';

export interface CardSheetProps {
  open: boolean;
  onClose: () => void;
  scope: PaymentScope;
  chargeId: string;
  amountCents: number;
  /** "Mensalidade de agosto · R$ 180,00". */
  subtitle: string;
}

export function CardSheet({
  open,
  onClose,
  scope,
  chargeId,
  amountCents,
  subtitle,
}: CardSheetProps) {
  const theme = useTheme();

  const [number, setNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [recurrence, setRecurrence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mandateCreated: boolean } | null>(
    null,
  );

  const create = useCreatePayment(scope);
  const invalidate = useSettleInvalidation(scope);

  const pay = () => {
    if (create.isPending) return;
    setError(null);
    create.mutate(
      {
        params: { path: { id: chargeId } },
        body: {
          method: 'card',
          recurrence,
          // Display metadata ONLY — the full number never leaves the device.
          card: { holderName: holderName.trim(), last4: cardLast4(number) },
        },
      },
      {
        onSuccess: (response) => {
          setResult({ mandateCreated: response.mandateCreated });
          invalidate();
        },
        onError: (mutationError) =>
          setError(billingErrorMessage(mutationError)),
      },
    );
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Pagar com cartão"
      subtitle={subtitle}
      testID="card-sheet"
    >
      {result ? (
        <PaymentSuccess
          caption={
            result.mandateCreated
              ? 'Recorrência mensal ativada neste cartão — as próximas mensalidades são pagas automaticamente.'
              : 'A mensalidade foi paga no cartão.'
          }
          onClose={onClose}
        />
      ) : (
        <View style={{ gap: theme.space['3'] }}>
          <FormField
            label="Número do cartão"
            type="number"
            placeholder="0000 0000 0000 0000"
            value={number}
            onChangeText={(raw) => setNumber(maskCardNumber(raw))}
          />
          <FormField
            label="Nome impresso no cartão"
            placeholder="Como aparece no cartão"
            value={holderName}
            onChangeText={setHolderName}
          />
          <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Validade (MM/AA)"
                type="number"
                placeholder="MM/AA"
                value={expiry}
                onChangeText={(raw) => setExpiry(maskExpiry(raw))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="CVV"
                type="password"
                placeholder="000"
                value={cvv}
                onChangeText={(raw) =>
                  setCvv(raw.replace(/\D/g, '').slice(0, 4))
                }
              />
            </View>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.space['3'],
              paddingVertical: 4,
            }}
          >
            <Text variant="label" style={{ flex: 1 }}>
              Usar este cartão na recorrência mensal
            </Text>
            <Switch
              testID="recurrence-toggle"
              accessibilityLabel="Usar este cartão na recorrência mensal"
              value={recurrence}
              onValueChange={setRecurrence}
              trackColor={{
                false: theme.color.border['2'],
                true: theme.color.brand['2'],
              }}
              thumbColor={theme.color.fg.onColor}
            />
          </View>
          {error ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {error}
            </Text>
          ) : null}
          <TatameButton
            fullWidth
            label={`Pagar ${formatBRL(amountCents)}`}
            disabled={!cardFormValid({ number, holderName, expiry, cvv })}
            loading={create.isPending}
            onPress={pay}
          />
        </View>
      )}
    </BottomSheet>
  );
}
