/**
 * Presentational pieces shared by the billing screens and sheets
 * (BIL.16-18): the green success pop (same treatment as the check-in
 * sheet), the histórico row with the "Ver comprovante" affordance, the
 * ephemeral copied notice and the deterministic boleto barcode stripes.
 * Pure display — every figure rendered here is server-derived.
 */

import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import {
  Card,
  TatameButton,
  Text,
  pop,
  useTheme,
} from '@tatame/design-system/native';
import { formatBRL } from './format';

/** Green check pop + confirmation copy (payment settled, aluno-13/15). */
export function PaymentSuccess({
  caption,
  onClose,
  testID = 'payment-success-pop',
}: {
  caption?: string;
  onClose: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.space['3'],
        paddingVertical: theme.space['2'],
      }}
    >
      <Animated.View
        entering={pop()}
        testID={testID}
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.color.success['500'],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={30} color={theme.color.fg.onColor} strokeWidth={3} />
      </Animated.View>
      <Text variant="subtitle" weight="bold">
        Pagamento confirmado
      </Text>
      {caption ? (
        <Text variant="caption" style={{ textAlign: 'center' }}>
          {caption}
        </Text>
      ) : null}
      <TatameButton fullWidth label="Fechar" onPress={onClose} />
    </View>
  );
}

/**
 * Histórico row (aluno-12 / responsavel-04): green check, title + paid
 * line, trailing amount; the whole row opens the comprovante.
 */
export function HistoryRow({
  title,
  subtitle,
  amountCents,
  onPressReceipt,
  divider = true,
  testID,
}: {
  title: string;
  subtitle: string;
  amountCents: number;
  onPressReceipt?: () => void;
  divider?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space['3'],
        paddingVertical: theme.space['3'],
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: theme.color.border['1'],
      }}
    >
      <View
        accessibilityElementsHidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: theme.color.success['100'],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={15} color={theme.color.success['500']} strokeWidth={3} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" numberOfLines={1} style={{ fontSize: 11.5 }}>
          {subtitle}
        </Text>
        {onPressReceipt ? (
          <Text
            variant="caption"
            weight="bold"
            color={theme.color.brand['1']}
            style={{ fontSize: 11 }}
          >
            Ver comprovante
          </Text>
        ) : null}
      </View>
      <Text variant="label" weight="bold">
        {formatBRL(amountCents)}
      </Text>
    </View>
  );
  if (!onPressReceipt) {
    return <View testID={testID}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver comprovante · ${title}`}
      onPress={onPressReceipt}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

/** Auto-hiding inline confirmation under the copy buttons (~2.6s, toast timing). */
export function CopiedNotice({
  message,
  onHide,
  duration = 2600,
  testID = 'copied-notice',
}: {
  message: string;
  onHide: () => void;
  duration?: number;
  testID?: string;
}) {
  const theme = useTheme();
  useEffect(() => {
    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [onHide, duration]);
  return (
    <Text
      accessibilityLiveRegion="polite"
      testID={testID}
      variant="caption"
      weight="bold"
      color={theme.color.success['500']}
      style={{ textAlign: 'center' }}
    >
      {message}
    </Text>
  );
}

/**
 * Deterministic barcode visual (aluno-14): stripe widths derived from the
 * provider's barcode payload — a render-only illustration, never scannable
 * truth (the linha digitável is the payable artifact).
 */
export function BarcodeStripes({
  payload,
  testID,
}: {
  payload: string;
  testID?: string;
}) {
  const theme = useTheme();
  const stripes = [...payload.replace(/\D/g, '').slice(0, 44)].map(
    (char, index) => ({
      key: index,
      width: (char.charCodeAt(0) % 3) + 1,
    }),
  );
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'center',
        height: 52,
        gap: 2,
      }}
    >
      {stripes.map((stripe) => (
        <View
          key={stripe.key}
          style={{ width: stripe.width, backgroundColor: theme.color.fg['1'] }}
        />
      ))}
    </View>
  );
}
