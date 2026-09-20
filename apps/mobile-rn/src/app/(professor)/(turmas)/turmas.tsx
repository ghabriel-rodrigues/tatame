/**
 * Professor "Minhas turmas" (ENR.17, professor-07): own classes only via
 * GET /v1/professor/classes — schedule line, age chip (Kids), occupancy
 * chip + bar and the derived Lotada chip. Belt-range chips ("Branca a
 * azul") are graduation-slice parity debt. Card tap → turma detail.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import type { ClassListItem } from '@tatame/shared';
import {
  Card,
  Chip,
  ScreenHeader,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { scheduleSummary } from '../../../features/enrollment/format';
import { OccupancyBar, QueryState } from '../../../features/enrollment/ui';
import { useSession } from '../../../session/session-store';

function TurmaCard({ turma }: { turma: ClassListItem }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={turma.name}
      onPress={() => router.push(`/turma/${turma.id}`)}
    >
      <Card padding={theme.space['4']}>
        <View style={{ gap: theme.space['2'] }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space['2'],
            }}
          >
            <Text variant="subtitle" style={{ flex: 1 }} numberOfLines={1}>
              {turma.name}
            </Text>
            <ChevronRight size={16} color={theme.color.fg['4']} />
          </View>
          <Text variant="caption">{scheduleSummary(turma.schedules)}</Text>
          <View
            style={{
              flexDirection: 'row',
              gap: theme.space['2'],
              flexWrap: 'wrap',
            }}
          >
            {turma.ageMin !== null && turma.ageMax !== null ? (
              <Chip
                label={`${turma.ageMin} a ${turma.ageMax} anos`}
                tone="brand"
              />
            ) : null}
            <Chip
              label={`${turma.occupancy} de ${turma.capacity} vagas`}
              tone="neutral"
            />
            {turma.lotada ? <Chip label="Lotada" tone="warning" /> : null}
          </View>
          <OccupancyBar
            occupancy={turma.occupancy}
            capacity={turma.capacity}
            testID={`occupancy-bar-${turma.name}`}
          />
        </View>
      </Card>
    </Pressable>
  );
}

export default function ProfessorTurmasScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const query = api.useQuery('get', '/v1/professor/classes');
  const turmas = query.data?.classes ?? [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['5'],
          paddingBottom: 130,
        }}
      >
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            title="Minhas turmas"
            subtitle={session?.academy?.name ?? undefined}
          />
          <QueryState loading={query.isPending} error={query.isError}>
            {turmas.length === 0 ? (
              <Card>
                <View style={{ gap: 4 }}>
                  <Text variant="label">Nenhuma turma</Text>
                  <Text variant="caption">
                    Você ainda não tem turmas atribuídas. Fale com o admin da
                    academia.
                  </Text>
                </View>
              </Card>
            ) : (
              turmas.map((turma) => <TurmaCard key={turma.id} turma={turma} />)
            )}
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
