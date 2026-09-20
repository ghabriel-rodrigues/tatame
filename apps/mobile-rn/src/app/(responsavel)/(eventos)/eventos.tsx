/**
 * Responsável Eventos tab (EVT.11, responsavel-06): published events as
 * gradient cards — banner header with the Gratuito/valor pill and name,
 * short date·local line, then ONE chip per dependent (spec 008 stories
 * 18-21 — per-child state, per the charter).
 *
 * Chip UX (documented per the handoff, tap-first like the prototype):
 * - Free event: the chip is a toggle — tap confirms the child (chip gains
 *   the success tint + check), tap again cancels (story 19).
 * - Paid event, no registration: tap creates the registration + guardian-
 *   billed charge and opens the Pix sheet addressed to that child
 *   ("Inscrição · <evento> · <nome>", story 20) with the same simulate
 *   gating as the mensalidade rails.
 * - Paid event, pending payment: the chip shows the warning tint; tap
 *   REOPENS the Pix sheet on the same open charge (retry, no new row);
 *   long-press cancels the pending registration and voids its charge —
 *   the affordance mirrors "Cancelar participação" without stealing the
 *   tap, which stays reserved for finishing the payment.
 * - Paid event, confirmed: the chip is inert — a settled inscription is
 *   undone only by the audited admin refund (409 event.registration_settled).
 * Settlement always lands via refetch, never optimistically.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import {
  Card,
  ScreenHeader,
  Text,
  eventGradientColors,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { PixSheet } from '../../../features/billing/PixSheet';
import {
  RESPONSAVEL_SUBTITLE,
  eventsErrorMessage,
  inscricaoSubtitle,
} from '../../../features/events/copy';
import {
  dependentChipAction,
  eventShortLine,
  priceLabel,
} from '../../../features/events/format';
import type {
  ResponsavelEvent,
  ResponsavelEventDependent,
} from '../../../features/events/types';
import { DependentChip } from '../../../features/events/ui';
import { QueryState } from '../../../features/enrollment/ui';

function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

interface PixTarget {
  chargeId: string;
  amountCents: number;
  subtitle: string;
}

function ResponsavelEventCard({
  event,
  onChipPress,
  onChipLongPress,
}: {
  event: ResponsavelEvent;
  onChipPress: (
    event: ResponsavelEvent,
    dependent: ResponsavelEventDependent,
  ) => void;
  onChipLongPress: (
    event: ResponsavelEvent,
    dependent: ResponsavelEventDependent,
  ) => void;
}) {
  const theme = useTheme();
  const gradient = eventGradientColors(theme, event.bannerPreset);
  return (
    <Card padding={0} testID={`responsavel-event-${event.id}`}>
      <View
        style={{
          overflow: 'hidden',
          borderTopLeftRadius: theme.radius.lg,
          borderTopRightRadius: theme.radius.lg,
        }}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <View style={{ padding: theme.space['4'], gap: theme.space['2'] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <View
              testID={`responsavel-event-${event.id}-price`}
              style={{
                backgroundColor: theme.color.bg.surface,
                borderRadius: theme.radius.pill,
                paddingVertical: 3,
                paddingHorizontal: 10,
              }}
            >
              <Text
                variant="caption"
                weight="bold"
                color={theme.color.brand['1']}
                style={{ fontSize: 10.5 }}
              >
                {priceLabel(event.priceCents)}
              </Text>
            </View>
          </View>
          <Text variant="label" color={theme.color.fg.onColor}>
            {event.name}
          </Text>
        </View>
      </View>
      <View style={{ padding: theme.space['4'], gap: theme.space['3'] }}>
        <Text variant="caption" style={{ fontSize: 11.5 }}>
          {eventShortLine(event.date, event.time, event.location)}
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.space['2'] }}>
          {event.dependents.map((dependent) => (
            <DependentChip
              key={dependent.studentId}
              name={firstName(dependent.fullName)}
              registration={dependent.registration}
              testID={`dependent-chip-${event.id}-${dependent.studentId}`}
              onPress={() => onChipPress(event, dependent)}
              onLongPress={() => onChipLongPress(event, dependent)}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

export default function ResponsavelEventosScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const eventsQuery = api.useQuery('get', '/v1/responsavel/events');
  const register = api.useMutation(
    'post',
    '/v1/responsavel/events/{id}/registrations/{studentId}',
  );
  const cancel = api.useMutation(
    'delete',
    '/v1/responsavel/events/{id}/registrations/{studentId}',
  );

  const [pix, setPix] = useState<PixTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const events = eventsQuery.data?.events ?? [];

  const invalidateEvents = () => {
    void queryClient.invalidateQueries({
      queryKey: ['get', '/v1/responsavel/events'],
    });
  };

  const registerDependent = (
    event: ResponsavelEvent,
    dependent: ResponsavelEventDependent,
  ) => {
    if (register.isPending) return;
    setError(null);
    register.mutate(
      { params: { path: { id: event.id, studentId: dependent.studentId } } },
      {
        onSuccess: (data) => {
          invalidateEvents();
          // Paid: the guardian-billed charge rides the existing Pix rails.
          if (data.chargeId && event.priceCents != null) {
            setPix({
              chargeId: data.chargeId,
              amountCents: event.priceCents,
              subtitle: inscricaoSubtitle(
                event.name,
                firstName(dependent.fullName),
              ),
            });
          }
        },
        onError: (mutationError) => setError(eventsErrorMessage(mutationError)),
      },
    );
  };

  const cancelDependent = (
    event: ResponsavelEvent,
    dependent: ResponsavelEventDependent,
  ) => {
    if (cancel.isPending) return;
    setError(null);
    cancel.mutate(
      { params: { path: { id: event.id, studentId: dependent.studentId } } },
      {
        onSuccess: invalidateEvents,
        onError: (mutationError) => setError(eventsErrorMessage(mutationError)),
      },
    );
  };

  const onChipPress = (
    event: ResponsavelEvent,
    dependent: ResponsavelEventDependent,
  ) => {
    const action = dependentChipAction(
      event.priceCents,
      dependent.registration,
    );
    if (action === 'confirm' || action === 'pay') {
      registerDependent(event, dependent);
    } else if (action === 'cancel') {
      // Free toggle (story 19): tap again cancels.
      cancelDependent(event, dependent);
    } else if (action === 'resume-payment' && event.priceCents != null) {
      // Retry rides the SAME open charge — no new registration row.
      const chargeId = dependent.registration?.chargeId;
      if (chargeId) {
        setPix({
          chargeId,
          amountCents: event.priceCents,
          subtitle: inscricaoSubtitle(
            event.name,
            firstName(dependent.fullName),
          ),
        });
      }
    }
    // 'none' (paid + confirmed): inert — only the admin refund undoes it.
  };

  const onChipLongPress = (
    event: ResponsavelEvent,
    dependent: ResponsavelEventDependent,
  ) => {
    // Long-press cancel is only for pending paid registrations — the free
    // toggle already cancels on tap and settled inscriptions are inert.
    if (
      dependentChipAction(event.priceCents, dependent.registration) ===
      'resume-payment'
    ) {
      cancelDependent(event, dependent);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['5'],
          paddingBottom: 130,
        }}
      >
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader title="Eventos" subtitle={RESPONSAVEL_SUBTITLE} />

          {error ? (
            <Text
              variant="caption"
              testID="events-error"
              color={theme.color.danger['500']}
            >
              {error}
            </Text>
          ) : null}

          <QueryState
            loading={eventsQuery.isPending}
            error={eventsQuery.isError}
          >
            {eventsQuery.data ? (
              events.length === 0 ? (
                <Card testID="responsavel-events-empty">
                  <View style={{ gap: 4, alignItems: 'center' }}>
                    <Text variant="label">Nenhum evento por enquanto</Text>
                    <Text variant="caption" style={{ textAlign: 'center' }}>
                      Os próximos eventos da academia aparecem aqui.
                    </Text>
                  </View>
                </Card>
              ) : (
                events.map((event) => (
                  <ResponsavelEventCard
                    key={event.id}
                    event={event}
                    onChipPress={onChipPress}
                    onChipLongPress={onChipLongPress}
                  />
                ))
              )
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>

      {pix ? (
        <PixSheet
          open
          onClose={() => setPix(null)}
          scope="responsavel"
          chargeId={pix.chargeId}
          amountCents={pix.amountCents}
          subtitle={pix.subtitle}
          successCaption="A inscrição foi confirmada."
          onSettled={invalidateEvents}
        />
      ) : null}
    </SafeAreaView>
  );
}
