/**
 * Aluno event detail (EVT.10, aluno-10): gradient banner from the DS preset
 * catalog with the Gratuito/valor pill and back button, info card
 * (data/hora, local, responsável), description, and the free/paid action
 * machine — "Confirmar presença" confirms on the spot; "Pagar inscrição ·
 * R$ X" creates the registration + event-origin charge and rides the
 * EXISTING billing rails (Pix sheet + simulate, addressed "Inscrição ·
 * <evento>"); pending shows "Pagamento pendente" with retry; confirmed
 * shows the green "Presença confirmada — até lá!" banner + "Cancelar
 * participação" (free/pending only — a settled inscription is undone only
 * by the admin refund). Settlement lands via refetch, never optimistically.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronLeft, MapPin, User } from 'lucide-react-native';
import {
  Card,
  TatameButton,
  Text,
  eventGradientColors,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../api/query';
import { PixSheet } from '../billing/PixSheet';
import {
  CANCEL_LABEL,
  CONFIRMED_BANNER,
  PENDING_NOTICE,
  eventsErrorMessage,
  inscricaoSubtitle,
} from './copy';
import { canCancel, detailAction, eventDateLine, priceLabel } from './format';
import { QueryState } from '../enrollment/ui';

function InfoRow({ icon, label }: { icon: ReactNode; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }}>
      {icon}
      <Text variant="caption" style={{ flex: 1, fontSize: 12.5 }}>
        {label}
      </Text>
    </View>
  );
}

export function EventDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = id ?? '';

  const detailQuery = api.useQuery('get', '/v1/aluno/events/{id}', {
    params: { path: { id: eventId } },
  });
  const register = api.useMutation('post', '/v1/aluno/events/{id}/registration');
  const cancel = api.useMutation('delete', '/v1/aluno/events/{id}/registration');

  const [pixChargeId, setPixChargeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const event = detailQuery.data;

  /** Every aluno surface that renders this event's state (spec 008). */
  const invalidateEventQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/aluno/events/{id}'] });
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/aluno/home'] });
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/aluno/agenda'] });
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/aluno/calendar'] });
  };

  const confirmOrPay = () => {
    if (register.isPending) return;
    setError(null);
    register.mutate(
      { params: { path: { id: eventId } } },
      {
        onSuccess: (data) => {
          invalidateEventQueries();
          // Paid: the charge rides the existing wallet rails (Pix sheet).
          if (data.chargeId) setPixChargeId(data.chargeId);
        },
        onError: (mutationError) => setError(eventsErrorMessage(mutationError)),
      },
    );
  };

  const cancelParticipation = () => {
    if (cancel.isPending) return;
    setError(null);
    cancel.mutate(
      { params: { path: { id: eventId } } },
      {
        onSuccess: invalidateEventQueries,
        onError: (mutationError) => setError(eventsErrorMessage(mutationError)),
      },
    );
  };

  const action = event ? detailAction(event.priceCents, event.registration) : null;
  const gradient = eventGradientColors(theme, event?.bannerPreset);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()}>
          <View style={{ overflow: 'hidden' }} testID="event-banner">
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView edges={['top']}>
              <View style={{ padding: theme.space['5'], gap: theme.space['3'] }}>
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
                <View style={{ gap: theme.space['2'], paddingTop: theme.space['4'] }}>
                  <View style={{ flexDirection: 'row' }}>
                    <View
                      testID="event-price-pill"
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
                        {event ? priceLabel(event.priceCents) : ''}
                      </Text>
                    </View>
                  </View>
                  <Text variant="title" color={theme.color.fg.onColor}>
                    {event?.name ?? ''}
                  </Text>
                </View>
              </View>
            </SafeAreaView>
          </View>

          <View style={{ padding: theme.space['5'], gap: theme.space['4'] }}>
            <QueryState loading={detailQuery.isPending} error={detailQuery.isError}>
              {event ? (
                <>
                  <Card padding={theme.space['4']} testID="event-info-card">
                    <View style={{ gap: theme.space['3'] }}>
                      <InfoRow
                        icon={<CalendarDays size={15} color={theme.color.brand['2']} />}
                        label={eventDateLine(event.date, event.time)}
                      />
                      {event.location ? (
                        <InfoRow
                          icon={<MapPin size={15} color={theme.color.brand['2']} />}
                          label={event.location}
                        />
                      ) : null}
                      <InfoRow
                        icon={<User size={15} color={theme.color.brand['2']} />}
                        label={`Responsável: Prof. ${event.responsible.fullName}`}
                      />
                    </View>
                  </Card>

                  {event.description ? (
                    <Text variant="caption" style={{ fontSize: 12.5 }}>
                      {event.description}
                    </Text>
                  ) : null}

                  {error ? (
                    <Text variant="caption" color={theme.color.danger['500']}>
                      {error}
                    </Text>
                  ) : null}

                  {action?.kind === 'confirmed' ? (
                    <Card variant="tinted" testID="confirmed-banner" padding={theme.space['4']}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.space['3'],
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
                        <Text
                          variant="label"
                          color={theme.color.success['500']}
                          style={{ flex: 1 }}
                        >
                          {CONFIRMED_BANNER}
                        </Text>
                      </View>
                    </Card>
                  ) : null}

                  {action?.kind === 'pending' ? (
                    <Text
                      variant="caption"
                      testID="pending-notice"
                      color={theme.color.warning['500']}
                      weight="bold"
                    >
                      {PENDING_NOTICE}
                    </Text>
                  ) : null}

                  {action?.kind === 'confirm' ? (
                    <TatameButton
                      fullWidth
                      label={action.label}
                      loading={register.isPending}
                      onPress={confirmOrPay}
                    />
                  ) : null}

                  {action?.kind === 'pay' ? (
                    <TatameButton
                      fullWidth
                      label={action.label}
                      loading={register.isPending}
                      onPress={confirmOrPay}
                    />
                  ) : null}

                  {action?.kind === 'pending' ? (
                    // Retry rides the SAME open charge — no new registration row.
                    <TatameButton
                      fullWidth
                      label={action.label}
                      onPress={() => setPixChargeId(event.registration?.chargeId ?? null)}
                    />
                  ) : null}

                  {canCancel(event.priceCents, event.registration) ? (
                    <TatameButton
                      fullWidth
                      variant="ghost"
                      label={CANCEL_LABEL}
                      loading={cancel.isPending}
                      onPress={cancelParticipation}
                    />
                  ) : null}
                </>
              ) : null}
            </QueryState>
          </View>
        </Animated.View>
      </ScrollView>

      {event && event.priceCents != null && pixChargeId ? (
        <PixSheet
          open
          onClose={() => setPixChargeId(null)}
          scope="aluno"
          chargeId={pixChargeId}
          amountCents={event.priceCents}
          subtitle={inscricaoSubtitle(event.name)}
          successCaption="Sua inscrição foi confirmada."
          onSettled={invalidateEventQueries}
        />
      ) : null}
    </SafeAreaView>
  );
}

export default EventDetailScreen;
