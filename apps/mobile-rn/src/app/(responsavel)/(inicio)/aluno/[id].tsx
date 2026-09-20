/**
 * Dependent detail (ENR.19 + GRD.17): GET /v1/responsavel/dependents/:id —
 * class with the full recurring schedule and the next slot, plus the
 * child's drawn belt with degrees (derived server-side; placeholder copy
 * remains only when no belt payload arrives). A foreign dependent id is a
 * server-side 404 (no existence leak) and renders the error state.
 */

import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BeltBar,
  Card,
  Chip,
  ListRow,
  ScreenHeader,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../../api/query';
import {
  WEEKDAY_SHORT,
  ageFromBirthDate,
  scheduleTimeRange,
  slotLabel,
} from '../../../../features/enrollment/format';
import { beltChipLabel } from '../../../../features/graduation/format';
import { QueryState } from '../../../../features/enrollment/ui';

export default function DependentDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = api.useQuery(
    'get',
    '/v1/responsavel/dependents/{id}',
    { params: { path: { id: id ?? '' } } },
    { enabled: !!id },
  );
  const dependent = query.data?.dependent;
  const turma = dependent?.class ?? null;
  const age = dependent ? ageFromBirthDate(dependent.birthDate) : Number.NaN;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['5'],
          paddingBottom: 130,
        }}
      >
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <QueryState loading={query.isPending} error={query.isError}>
            {dependent ? (
              <>
                <ScreenHeader
                  title={dependent.fullName}
                  subtitle={Number.isFinite(age) ? `${age} anos` : undefined}
                  onBack={() => router.back()}
                />

                <Card>
                  <View style={{ gap: theme.space['3'] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text variant="subtitle">Turma</Text>
                      {turma?.nextSlot ? (
                        <Chip
                          label={`Próxima aula · ${slotLabel(turma.nextSlot)}`}
                          tone="brand"
                        />
                      ) : null}
                    </View>
                    {turma ? (
                      <View>
                        <Text variant="label">{turma.name}</Text>
                        {turma.schedules.map((slot, index) => (
                          <ListRow
                            key={`${slot.weekday}-${slot.startTime}`}
                            title={WEEKDAY_SHORT[slot.weekday] ?? '?'}
                            subtitle={scheduleTimeRange(slot)}
                            divider={index < turma.schedules.length - 1}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text variant="caption">
                        Sem turma no momento — a matrícula acontece quando
                        houver vaga.
                      </Text>
                    )}
                  </View>
                </Card>

                <Card variant="tinted">
                  <View style={{ gap: theme.space['3'] }}>
                    <Text variant="label">Graduação</Text>
                    {dependent.belt ? (
                      <>
                        <BeltBar
                          belt={dependent.belt}
                          size="md"
                          testID="dependent-detail-belt"
                        />
                        <Text variant="caption">
                          {beltChipLabel(dependent.belt)}
                        </Text>
                      </>
                    ) : (
                      <Text variant="caption">
                        A evolução de faixa e graus chega na fase de graduação.
                      </Text>
                    )}
                  </View>
                </Card>
              </>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
