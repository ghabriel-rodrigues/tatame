/**
 * Product detail (STO.10, aluno-17/professor-14): full-bleed gradient
 * banner with the monogram and category chip, "Foto N de 3" indicator with
 * 3 thumbnail variants (deterministic catalog-neighbor derivation — spec
 * 009: gallery is derivation, not schema), name + price, description, #tag
 * chips, size pills (required iff the product has sizes), quantity stepper
 * capped at stock, and "Comprar com Pix · R$ X" → POST /store/orders →
 * the EXISTING Pix sheet + simulate rails addressed "Pedido #NNNN ·
 * <produto>" → "Pedido pago — retire na recepção da academia." Settlement
 * lands via refetch, never optimistically. professor-14's "desconto de
 * equipe" line is dropped per spec (no discount engine — recorded).
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';
import {
  Chip,
  TatameButton,
  Text,
  fadeUp,
  storeGalleryPresets,
  storeGradientColors,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../api/query';
import { PixSheet } from '../billing/PixSheet';
import { formatBRL } from '../billing/format';
import { QueryState } from '../enrollment/ui';
import {
  PAID_SUCCESS,
  QUANTITY_LABEL,
  SIZE_LABEL,
  SOLD_OUT_LABEL,
  pedidoSubtitle,
  storeErrorMessage,
} from './copy';
import { galleryLabel, purchaseState, stockLine } from './format';
import { QtyStepper } from './ui';
import type { StoreOrder } from './types';

export function ProductDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = id ?? '';

  const detailQuery = api.useQuery('get', '/v1/store/products/{id}', {
    params: { path: { id: productId } },
  });
  const createOrder = api.useMutation('post', '/v1/store/orders');

  const [photoIndex, setPhotoIndex] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [pixOrder, setPixOrder] = useState<{
    order: StoreOrder;
    chargeId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const product = detailQuery.data;
  const state = product ? purchaseState(product, size, quantity) : null;
  const gallery = storeGalleryPresets(product?.gradientPreset);
  const bannerPreset = gallery[photoIndex] ?? gallery[0];
  const bannerColors = storeGradientColors(theme, bannerPreset);

  /** Every storefront surface that renders this product/order (spec 009). */
  const invalidateStoreQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: ['get', '/v1/store/products'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['get', '/v1/store/products/{id}'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['get', '/v1/store/orders'],
    });
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/aluno/home'] });
  };

  const buy = () => {
    if (!product || !state?.canBuy || createOrder.isPending) return;
    setError(null);
    createOrder.mutate(
      {
        body: {
          productId: product.id,
          ...(state.needsSize ? { size } : {}),
          quantity,
        },
      },
      {
        onSuccess: (data) => {
          invalidateStoreQueries();
          setPixOrder({ order: data.order, chargeId: data.chargeId });
        },
        onError: (mutationError) => setError(storeErrorMessage(mutationError)),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()}>
          <View style={{ overflow: 'hidden' }} testID="product-banner">
            <LinearGradient
              colors={bannerColors}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView edges={['top']}>
              <View
                style={{ padding: theme.space['5'], gap: theme.space['3'] }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                    onPress={() => router.back()}
                    hitSlop={8}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    <ChevronLeft size={18} color={theme.color.fg.onColor} />
                  </Pressable>
                  {product?.categoryName ? (
                    <View
                      testID="product-category-pill"
                      style={{
                        backgroundColor: theme.color.bg.surface,
                        borderRadius: theme.radius.pill,
                        paddingVertical: 4,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text
                        variant="caption"
                        weight="bold"
                        color={theme.color.brand['1']}
                        style={{ fontSize: 11 }}
                      >
                        {product.categoryName}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View
                  style={{
                    alignItems: 'center',
                    paddingVertical: theme.space['5'],
                  }}
                >
                  <Text
                    variant="display"
                    weight="bold"
                    color={theme.color.fg.onColor}
                    style={{ fontSize: 34, letterSpacing: 6 }}
                  >
                    {product?.monogram ?? ''}
                  </Text>
                </View>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'flex-end' }}
                >
                  <View
                    style={{
                      backgroundColor: 'rgba(26,11,46,0.55)',
                      borderRadius: theme.radius.pill,
                      paddingVertical: 3,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text
                      variant="caption"
                      weight="bold"
                      color={theme.color.fg.onColor}
                      testID="gallery-indicator"
                      style={{ fontSize: 10 }}
                    >
                      {galleryLabel(photoIndex)}
                    </Text>
                  </View>
                </View>
              </View>
            </SafeAreaView>
          </View>

          <View style={{ padding: theme.space['5'], gap: theme.space['4'] }}>
            <QueryState
              loading={detailQuery.isPending}
              error={detailQuery.isError}
            >
              {product && state ? (
                <>
                  {/* Gallery thumbnails — monogram-tile variants (spec 009). */}
                  <View style={{ flexDirection: 'row', gap: theme.space['2'] }}>
                    {gallery.map((preset, index) => (
                      <Pressable
                        key={preset}
                        accessibilityRole="button"
                        accessibilityLabel={galleryLabel(index)}
                        accessibilityState={{ selected: photoIndex === index }}
                        onPress={() => setPhotoIndex(index)}
                        testID={`gallery-thumb-${index}`}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: theme.radius.md,
                          overflow: 'hidden',
                          borderWidth: 2,
                          borderColor:
                            photoIndex === index
                              ? theme.color.brand['2']
                              : 'transparent',
                        }}
                      >
                        <LinearGradient
                          colors={storeGradientColors(theme, preset)}
                          start={{ x: 0, y: 1 }}
                          end={{ x: 1, y: 0 }}
                          style={{ flex: 1 }}
                        />
                      </Pressable>
                    ))}
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.space['3'],
                    }}
                  >
                    <Text variant="title" style={{ flex: 1 }}>
                      {product.name}
                    </Text>
                    <Text
                      variant="title"
                      weight="bold"
                      color={theme.color.brand['1']}
                    >
                      {formatBRL(product.priceCents)}
                    </Text>
                  </View>

                  {product.description ? (
                    <Text variant="caption" style={{ fontSize: 12.5 }}>
                      {product.description}
                    </Text>
                  ) : null}

                  {product.tags.length > 0 ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: theme.space['2'],
                      }}
                    >
                      {product.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={`#${tag}`}
                          testID={`tag-${tag}`}
                        />
                      ))}
                    </View>
                  ) : null}

                  {state.needsSize ? (
                    <View style={{ gap: theme.space['2'] }}>
                      <Text variant="label">{SIZE_LABEL}</Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: theme.space['2'],
                        }}
                      >
                        {product.sizes.map((option) => (
                          <Chip
                            key={option}
                            label={option}
                            size="md"
                            selected={size === option}
                            onPress={() =>
                              setSize(size === option ? null : option)
                            }
                            testID={`size-${option}`}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {!state.soldOut ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text variant="label">{QUANTITY_LABEL}</Text>
                      <QtyStepper
                        value={quantity}
                        canDecrement={state.canDecrement}
                        canIncrement={state.canIncrement}
                        onDecrement={() =>
                          setQuantity((current) => current - 1)
                        }
                        onIncrement={() =>
                          setQuantity((current) => current + 1)
                        }
                      />
                    </View>
                  ) : null}

                  {state.soldOut ? (
                    <Chip
                      label={SOLD_OUT_LABEL}
                      tone="danger"
                      testID="sold-out-badge"
                    />
                  ) : (
                    <Text
                      variant="caption"
                      testID="stock-line"
                      style={{ fontSize: 11.5 }}
                    >
                      {stockLine(product.stockQty)}
                    </Text>
                  )}

                  {error ? (
                    <Text variant="caption" color={theme.color.danger['500']}>
                      {error}
                    </Text>
                  ) : null}

                  <TatameButton
                    fullWidth
                    label={state.ctaLabel}
                    disabled={!state.canBuy}
                    loading={createOrder.isPending}
                    onPress={buy}
                  />
                </>
              ) : null}
            </QueryState>
          </View>
        </Animated.View>
      </ScrollView>

      {product && pixOrder ? (
        <PixSheet
          open
          onClose={() => setPixOrder(null)}
          scope="store"
          chargeId={pixOrder.chargeId}
          amountCents={pixOrder.order.totalCents}
          subtitle={pedidoSubtitle(pixOrder.order.number, product.name)}
          successCaption={PAID_SUCCESS}
          onSettled={invalidateStoreQueries}
        />
      ) : null}
    </SafeAreaView>
  );
}

export default ProductDetailScreen;
