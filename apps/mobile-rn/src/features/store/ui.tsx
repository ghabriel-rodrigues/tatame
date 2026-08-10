/**
 * Presentational pieces shared by the store surfaces (STO.10-11): the
 * gradient monogram tile (the prototypes' GI/RG/FX visuals — spec 009 v1
 * identity, no image upload), the vitrine grid card (aluno-16/professor-13,
 * unclipped by construction), the home strip mini card (aluno-03 "Loja da
 * academia") and the quantity stepper (aluno-17). Pure display — prices and
 * stock are server-derived.
 */

import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Minus, Plus } from 'lucide-react-native';
import {
  Card,
  Text,
  storeGradientColors,
  useTheme,
} from '@tatame/design-system/native';
import { formatBRL } from '../billing/format';
import type { ProductCard } from './types';

/** Letter monogram over a catalog gradient — the v1 product "photo". */
export function ProductTile({
  monogram,
  gradientPreset,
  height = 120,
  fontSize = 22,
  radius,
  testID,
}: {
  monogram: string;
  gradientPreset: string;
  height?: number;
  fontSize?: number;
  radius?: number;
  testID?: string;
}) {
  const theme = useTheme();
  const colors = storeGradientColors(theme, gradientPreset);
  return (
    <View
      testID={testID}
      style={{
        height,
        borderRadius: radius ?? theme.radius.md,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text
          variant="title"
          weight="bold"
          color={theme.color.fg.onColor}
          style={{ fontSize, letterSpacing: 2 }}
        >
          {monogram}
        </Text>
      </LinearGradient>
    </View>
  );
}

/**
 * Vitrine grid card (aluno-16): tile, name, price + category label. Sized
 * by the parent's 2-column row — full content, never clipped (the
 * prototype's clipped grid is fixed, not reproduced).
 */
export function ProductGridCard({
  product,
  onPress,
  testID,
}: {
  product: ProductCard;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={onPress}
      testID={testID}
      style={{ flex: 1 }}
    >
      <Card padding={theme.space['3']} style={{ gap: theme.space['3'] }}>
        <ProductTile
          monogram={product.monogram}
          gradientPreset={product.gradientPreset}
          testID={testID ? `${testID}-tile` : undefined}
        />
        <View style={{ gap: 4 }}>
          <Text variant="label" numberOfLines={2} style={{ fontSize: 12.5, minHeight: 32 }}>
            {product.name}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.space['2'],
            }}
          >
            <Text variant="label" weight="bold" color={theme.color.brand['1']}>
              {formatBRL(product.priceCents)}
            </Text>
            {product.categoryName ? (
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ fontSize: 10, flexShrink: 1 }}
              >
                {product.categoryName}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/** Home "Loja da academia" strip mini card (spec 009 story 15). */
export function StoreStripCard({
  product,
  onPress,
  testID,
}: {
  product: ProductCard;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={onPress}
      testID={testID}
      style={{ flex: 1 }}
    >
      <Card padding={theme.space['2']} style={{ gap: theme.space['2'] }}>
        <ProductTile
          monogram={product.monogram}
          gradientPreset={product.gradientPreset}
          height={72}
          fontSize={16}
        />
        <View style={{ gap: 2 }}>
          <Text variant="caption" numberOfLines={1} style={{ fontSize: 11 }}>
            {product.name}
          </Text>
          <Text variant="caption" weight="bold" style={{ fontSize: 11 }}>
            {formatBRL(product.priceCents)}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

/** Quantity stepper capped by the caller (aluno-17 "Quantidade"). */
export function QtyStepper({
  value,
  canDecrement,
  canIncrement,
  onDecrement,
  onIncrement,
  testID = 'qty-stepper',
}: {
  value: number;
  canDecrement: boolean;
  canIncrement: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const button = (
    kind: 'minus' | 'plus',
    enabled: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kind === 'minus' ? 'Diminuir quantidade' : 'Aumentar quantidade'}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={6}
      testID={`${testID}-${kind}`}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor:
          kind === 'plus' ? theme.color.purple['950'] : theme.color.bg.sunken,
        opacity: enabled ? 1 : 0.4,
      }}
    >
      {kind === 'minus' ? (
        <Minus size={14} color={theme.color.fg['2']} strokeWidth={3} />
      ) : (
        <Plus size={14} color={theme.color.fg.onColor} strokeWidth={3} />
      )}
    </Pressable>
  );
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }}
    >
      {button('minus', canDecrement, onDecrement)}
      <Text variant="label" weight="bold" testID={`${testID}-value`} style={{ minWidth: 18, textAlign: 'center' }}>
        {value}
      </Text>
      {button('plus', canIncrement, onIncrement)}
    </View>
  );
}
