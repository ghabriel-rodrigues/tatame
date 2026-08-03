/**
 * Responsável dependents panel (ENR.19, responsavel-02): one card per child
 * via GET /v1/responsavel/dependents — name, age, class, next scheduled
 * slot (server-derived) and honest placeholders for frequência (Fase 4) and
 * faixa (graduation slice). Billing banner and avisos belong to their own
 * slices. "+ Cadastrar aluno" opens the ENR.20 sheet and is hidden when the
 * dependents.register toggle is off.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import {
  Card,
  Chip,
  ScreenHeader,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { ageFromBirthDate, longDatePt, slotLabel } from '../../../features/enrollment/format';
import { canRegisterDependents } from '../../../features/enrollment/permissions';
import { openRegisterDependentSheet } from '../../../features/enrollment/register-sheet-store';
import type { DependentDetail } from '../../../features/enrollment/types';
import { InitialsAvatar, QueryState, StatTile } from '../../../features/enrollment/ui';
import { useSession } from '../../../session/session-store';

function DependentCard({ dependent }: { dependent: DependentDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const age = ageFromBirthDate(dependent.birthDate);
  const nextSlot = dependent.class?.nextSlot ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dependent.fullName}
      onPress={() => router.push(`/aluno/${dependent.id}`)}
    >
      <Card padding={theme.space['4']}>
        <View style={{ gap: theme.space['3'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }}>
            <InitialsAvatar name={dependent.fullName} size={38} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="subtitle" numberOfLines={1}>
                {dependent.fullName}
              </Text>
              <Text variant="caption">
                {Number.isFinite(age) ? `${age} anos` : '—'} ·{' '}
                {dependent.class?.name ?? 'Sem turma'}
              </Text>
            </View>
            <ChevronRight size={16} color={theme.color.fg['4']} />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.space['2'] }}>
            <StatTile value="—" label="frequência" note="Fase 4" />
            <StatTile value="—" label="faixa" note="Em breve" />
            <StatTile value={nextSlot ? slotLabel(nextSlot) : '—'} label="próxima aula" />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function ResponsavelInicioScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const canRegister = canRegisterDependents(session);
  const query = api.useQuery('get', '/v1/responsavel/dependents');
  const dependents = query.data?.dependents ?? [];

  if (!session) return null;
  const firstName = session.user.fullName.split(' ')[0] ?? session.user.fullName;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            eyebrow={longDatePt()}
            title={`Olá, ${firstName}`}
            trailing={
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['2'] }}
              >
                <Chip label="Responsável" tone="brand" />
                <InitialsAvatar name={session.user.fullName} size={34} />
              </View>
            }
          />

          <QueryState loading={query.isPending} error={query.isError}>
            {dependents.length === 0 ? (
              <Card>
                <View style={{ gap: 4 }}>
                  <Text variant="label">Nenhum aluno cadastrado</Text>
                  <Text variant="caption">
                    {canRegister
                      ? 'Cadastre seu filho para acompanhar os treinos.'
                      : 'O cadastro de alunos é feito pela academia.'}
                  </Text>
                </View>
              </Card>
            ) : (
              dependents.map((dependent) => (
                <DependentCard key={dependent.id} dependent={dependent} />
              ))
            )}
          </QueryState>

          {canRegister ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cadastrar aluno"
              onPress={openRegisterDependentSheet}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.space['2'],
                paddingVertical: 14,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.color.border['2'],
                backgroundColor: theme.color.brand.tint,
              }}
            >
              <Plus size={16} color={theme.color.brand['1']} />
              <Text variant="label" color={theme.color.brand['1']}>
                Cadastrar aluno
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
