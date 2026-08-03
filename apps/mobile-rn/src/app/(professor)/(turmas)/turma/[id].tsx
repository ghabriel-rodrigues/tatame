/**
 * Professor turma detail (ENR.17/18, professor-08): stats tiles (attendance
 * is an explicit "Fase 4" placeholder — never faked), schedule and the FULL
 * roster (the handoff screenshot's 3-of-24 roster is a known prototype bug;
 * this screen renders the real server roster). Roster mutations (ENR.18):
 * Adicionar aluno sheet + remove with confirmation, both against the
 * professor endpoints (foreign class → 404 server-side).
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleMinus } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { RosterStudent } from '@tatame/shared';
import {
  BottomSheet,
  Card,
  Chip,
  ListRow,
  ScreenHeader,
  TatameButton,
  Text,
  Toast,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../../api/query';
import { AddStudentSheet } from '../../../../features/enrollment/AddStudentSheet';
import { enrollmentErrorMessage } from '../../../../features/enrollment/copy';
import {
  occupancyPercent,
  scheduleSummary,
} from '../../../../features/enrollment/format';
import { InitialsAvatar, QueryState, StatTile } from '../../../../features/enrollment/ui';

export default function ProfessorTurmaDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const detailQuery = api.useQuery(
    'get',
    '/v1/professor/classes/{id}',
    { params: { path: { id: id ?? '' } } },
    { enabled: !!id },
  );
  const turma = detailQuery.data?.class;

  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<RosterStudent | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const removeMutation = api.useMutation(
    'delete',
    '/v1/professor/classes/{id}/students/{studentId}',
  );

  const confirmRemove = () => {
    if (!turma || !removing) return;
    setRemoveError(null);
    removeMutation.mutate(
      { params: { path: { id: turma.id, studentId: removing.studentId } } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/professor/classes'] });
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/professor/classes/{id}'],
          });
          setToast('Aluno removido da turma.');
          setRemoving(null);
        },
        onError: (error) => setRemoveError(enrollmentErrorMessage(error)),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <QueryState loading={detailQuery.isPending} error={detailQuery.isError}>
            {turma ? (
              <>
                <ScreenHeader
                  title={turma.name}
                  subtitle={scheduleSummary(turma.schedules)}
                  onBack={() => router.back()}
                />

                <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
                  <StatTile value={`${turma.occupancy}`} label="alunos" />
                  <StatTile value="—" label="frequência" note="Fase 4" />
                  <StatTile
                    value={`${occupancyPercent(turma.occupancy, turma.capacity)}%`}
                    label="ocupação"
                  />
                </View>

                <TatameButton
                  fullWidth
                  label="Fazer chamada de hoje"
                  onPress={() => setToast('Em breve: chamada (Fase 4).')}
                />

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text variant="subtitle">Alunos</Text>
                  <TatameButton
                    size="sm"
                    variant="secondary"
                    label="Adicionar aluno"
                    onPress={() => setAddOpen(true)}
                  />
                </View>

                {turma.roster.length === 0 ? (
                  <Card>
                    <Text variant="caption">Nenhum aluno matriculado nesta turma.</Text>
                  </Card>
                ) : (
                  <Card padding={theme.space['1']}>
                    {turma.roster.map((student, index) => (
                      <ListRow
                        key={student.studentId}
                        title={student.fullName}
                        leading={<InitialsAvatar name={student.fullName} />}
                        divider={index < turma.roster.length - 1}
                        trailing={
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: theme.space['2'],
                            }}
                          >
                            {student.badge === 'pendente' ? (
                              <Chip label="Pendente" tone="warning" />
                            ) : null}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Remover ${student.fullName}`}
                              onPress={() => {
                                setRemoveError(null);
                                setRemoving(student);
                              }}
                              hitSlop={8}
                            >
                              <CircleMinus size={18} color={theme.color.fg['4']} />
                            </Pressable>
                          </View>
                        }
                      />
                    ))}
                  </Card>
                )}
              </>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>

      {turma ? (
        <AddStudentSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          classId={turma.id}
          className={turma.name}
          roster={turma.roster}
          onAdded={(name) => setToast(`${name} agora faz parte da turma.`)}
        />
      ) : null}

      <BottomSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remover aluno"
        subtitle={
          removing && turma ? `${removing.fullName} sai da turma ${turma.name}.` : undefined
        }
        testID="remove-student-sheet"
      >
        <View style={{ gap: theme.space['3'] }}>
          {removeError ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {removeError}
            </Text>
          ) : null}
          <TatameButton
            fullWidth
            variant="danger"
            label="Remover"
            loading={removeMutation.isPending}
            onPress={confirmRemove}
          />
          <TatameButton
            fullWidth
            variant="ghost"
            label="Cancelar"
            onPress={() => setRemoving(null)}
          />
        </View>
      </BottomSheet>

      <Toast
        open={toast !== null}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        offsetBottom={110}
      />
    </SafeAreaView>
  );
}
