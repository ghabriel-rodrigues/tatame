/**
 * Meus pedidos (STO.11, spec 009 stories 27-28): own orders newest first —
 * "Pedido #NNNN", date, "produto · Tam M · N un", total, PT-BR status chip
 * (Aguardando pagamento / Recebido / Em andamento / Entregue / Cancelado) —
 * with the retirada note while there is something to pick up (paid/ready),
 * "Pagar" resuming the SAME open charge through the existing Pix sheet on
 * pending orders, and the pending-only cancel (a paid order is undone only
 * by the admin refund path). Entry point: the vitrine header (decision
 * documented there). For the professor (no Carteira) this list is the
 * purchase record; the aluno's settled order payments also land in the
 * Carteira histórico via billing.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, MapPin } from 'lucide-react-native';
import {
  Card,
  Chip,
  TatameButton,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../api/query';
import { formatBRL } from '../billing/format';
import { PixSheet } from '../billing/PixSheet';
import { QueryState } from '../enrollment/ui';
import {
  CANCEL_ORDER_LABEL,
  EMPTY_ORDERS,
  EMPTY_ORDERS_CAPTION,
  MY_ORDERS_TITLE,
  PAID_SUCCESS,
  RESUME_PAYMENT_LABEL,
  pedidoSubtitle,
  storeErrorMessage,
} from './copy';
import {
  canCancelOrder,
  canResumePayment,
  orderDateLine,
  orderItemLine,
  orderStatusChip,
  orderTitle,
  showsPickupNote,
} from './format';
import { ProductTile } from './ui';
import type { StoreOrder } from './types';

export function OrdersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const ordersQuery = api.useQuery('get', '/v1/store/orders');
  const cancelOrder = api.useMutation('delete', '/v1/store/orders/{id}');

  const [payingOrder, setPayingOrder] = useState<StoreOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orders = ordersQuery.data?.orders ?? [];

  const invalidateStoreQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/store/orders'] });
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/store/products'] });
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/aluno/home'] });
  };

  const cancel = (order: StoreOrder) => {
    if (cancelOrder.isPending) return;
    setError(null);
    cancelOrder.mutate(
      { params: { path: { id: order.id } } },
      {
        onSuccess: invalidateStoreQueries,
        onError: (mutationError) => setError(storeErrorMessage(mutationError)),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }}
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
                borderWidth: 1,
                borderColor: theme.color.border['1'],
                backgroundColor: theme.color.bg.surface,
              }}
            >
              <ChevronLeft size={18} color={theme.color.fg['2']} />
            </Pressable>
            <Text variant="subtitle" weight="bold">
              {MY_ORDERS_TITLE}
            </Text>
          </View>

          {error ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {error}
            </Text>
          ) : null}

          <QueryState loading={ordersQuery.isPending} error={ordersQuery.isError}>
            {orders.length === 0 ? (
              <Card testID="orders-empty">
                <View style={{ gap: 4 }}>
                  <Text variant="label">{EMPTY_ORDERS}</Text>
                  <Text variant="caption">{EMPTY_ORDERS_CAPTION}</Text>
                </View>
              </Card>
            ) : (
              orders.map((order) => {
                const chip = orderStatusChip(order.status);
                return (
                  <Card
                    key={order.id}
                    padding={theme.space['4']}
                    testID={`order-${order.id}`}
                  >
                    <View style={{ gap: theme.space['3'] }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: theme.space['2'],
                        }}
                      >
                        <Text variant="label" weight="bold">
                          {orderTitle(order)}
                        </Text>
                        <Chip
                          label={chip.label}
                          tone={chip.tone}
                          testID={`order-${order.id}-chip`}
                        />
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.space['3'],
                        }}
                      >
                        {order.item ? (
                          <View style={{ width: 46 }}>
                            <ProductTile
                              monogram={order.item.monogram}
                              gradientPreset={order.item.gradientPreset}
                              height={46}
                              fontSize={13}
                            />
                          </View>
                        ) : null}
                        <View style={{ flex: 1, gap: 2 }}>
                          {order.item ? (
                            <Text variant="caption" numberOfLines={1}>
                              {orderItemLine(order.item)}
                            </Text>
                          ) : null}
                          <Text variant="caption" style={{ fontSize: 11 }}>
                            {orderDateLine(order.createdAt)}
                          </Text>
                        </View>
                        <Text variant="label" weight="bold">
                          {formatBRL(order.totalCents)}
                        </Text>
                      </View>

                      {showsPickupNote(order.status) ? (
                        <View
                          testID={`order-${order.id}-pickup`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <MapPin size={12} color={theme.color.brand['2']} />
                          <Text variant="caption" style={{ fontSize: 11 }}>
                            {order.pickupNote}
                          </Text>
                        </View>
                      ) : null}

                      {canResumePayment(order) ? (
                        <TatameButton
                          size="sm"
                          label={RESUME_PAYMENT_LABEL}
                          onPress={() => setPayingOrder(order)}
                        />
                      ) : null}
                      {canCancelOrder(order) ? (
                        <TatameButton
                          size="sm"
                          variant="ghost"
                          label={CANCEL_ORDER_LABEL}
                          loading={cancelOrder.isPending}
                          onPress={() => cancel(order)}
                        />
                      ) : null}
                    </View>
                  </Card>
                );
              })
            )}
          </QueryState>
        </Animated.View>
      </ScrollView>

      {payingOrder?.chargeId ? (
        <PixSheet
          open
          onClose={() => setPayingOrder(null)}
          scope="store"
          chargeId={payingOrder.chargeId}
          amountCents={payingOrder.totalCents}
          subtitle={pedidoSubtitle(
            payingOrder.number,
            payingOrder.item?.productName ?? '',
          )}
          successCaption={PAID_SUCCESS}
          onSettled={invalidateStoreQueries}
        />
      ) : null}
    </SafeAreaView>
  );
}

export default OrdersScreen;
