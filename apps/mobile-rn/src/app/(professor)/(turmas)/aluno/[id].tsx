/**
 * Professor perfil do aluno (GRD.17, professor-11): GET
 * /v1/professor/students/:id/profile — belt bar with degrees, progress
 * line against the academy rule, "Adicionar grau" / "Promover faixa"
 * (hidden when the admin turned the graduation.update toggle off;
 * enforcement stays server-side), Phase-4 stat tiles (mensalidade stays an
 * honest placeholder — billing slice) and the persistent observações
 * (staff-visible notes, newest first). The promotion target defaults to
 * the next enabled belt of the academy's merged régua (GET
 * /v1/professor/profile); the server accepts any enabled non-current belt.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  BeltBar,
  BottomSheet,
  Card,
  FormField,
  ScreenHeader,
  TatameButton,
  Text,
  Toast,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../../api/query';
import {
  beltChipLabel,
  professorTag,
  progressLine,
  shortDatePt,
} from '../../../../features/graduation/format';
import { graduationErrorMessage } from '../../../../features/graduation/copy';
import { canUpdateGraduations } from '../../../../features/graduation/permissions';
import type { ValidGraduation } from '../../../../features/graduation/types';
import { InitialsAvatar, QueryState, StatTile } from '../../../../features/enrollment/ui';
import { useSession } from '../../../../session/session-store';

type AwardKind = 'degree' | 'belt';

/** Next enabled belt after the current one in the merged régua order. */
function nextBeltTarget(
  ladder: ValidGraduation[],
  currentBeltId: string,
): ValidGraduation | null {
  const enabled = ladder.filter((belt) => belt.enabled);
  const index = enabled.findIndex((belt) => belt.beltId === currentBeltId);
  if (index === -1) {
    // Current belt hidden (e.g. disabled kids belt): first enabled ≠ current.
    return enabled.find((belt) => belt.beltId !== currentBeltId) ?? null;
  }
  return enabled[index + 1] ?? null;
}

export default function ProfessorAlunoPerfilScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const profileQuery = api.useQuery(
    'get',
    '/v1/professor/students/{id}/profile',
    { params: { path: { id: id ?? '' } } },
    { enabled: !!id },
  );
  const ownProfileQuery = api.useQuery('get', '/v1/professor/profile');

  const [award, setAward] = useState<AwardKind | null>(null);
  const [awardNotes, setAwardNotes] = useState('');
  const [awardError, setAwardError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const awardMutation = api.useMutation('post', '/v1/professor/students/{id}/graduations');
  const noteMutation = api.useMutation('post', '/v1/professor/students/{id}/notes');

  const data = profileQuery.data;
  const canAward = canUpdateGraduations(session);
  const ladder = ownProfileQuery.data?.validGraduations ?? [];
  const promotionTarget = data ? nextBeltTarget(ladder, data.belt.beltId) : null;
  const atMaxDegrees = data ? data.belt.maxDegrees > 0 && data.belt.degrees >= data.belt.maxDegrees : false;

  const invalidateAfterAward = () => {
    void queryClient.invalidateQueries({
      queryKey: ['get', '/v1/professor/students/{id}/profile'],
    });
    // Belt chips on rosters and pickers re-derive from the same payload.
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/professor/classes/{id}'] });
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/professor/students'] });
  };

  const closeAwardSheet = () => {
    setAward(null);
    setAwardNotes('');
    setAwardError(null);
  };

  const confirmAward = () => {
    if (!id || !award) return;
    setAwardError(null);
    const body =
      award === 'belt'
        ? {
            kind: 'belt' as const,
            beltId: promotionTarget?.beltId ?? '',
            ...(awardNotes.trim() ? { notes: awardNotes.trim() } : {}),
          }
        : {
            kind: 'degree' as const,
            ...(awardNotes.trim() ? { notes: awardNotes.trim() } : {}),
          };
    awardMutation.mutate(
      { params: { path: { id } }, body },
      {
        onSuccess: () => {
          invalidateAfterAward();
          setToast(award === 'belt' ? 'Faixa promovida.' : 'Grau adicionado.');
          closeAwardSheet();
        },
        onError: (error) => setAwardError(graduationErrorMessage(error)),
      },
    );
  };

  const saveNote = () => {
    if (!id || !noteBody.trim()) return;
    setNoteError(null);
    noteMutation.mutate(
      { params: { path: { id } }, body: { body: noteBody.trim() } },
      {
        onSuccess: () => {
          setNoteBody('');
          setToast('Observação salva.');
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/professor/students/{id}/profile'],
          });
        },
        onError: (error) => setNoteError(graduationErrorMessage(error)),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <QueryState loading={profileQuery.isPending} error={profileQuery.isError}>
            {data ? (
              <>
                <ScreenHeader title="Perfil do aluno" onBack={() => router.back()} />

                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }}
                >
                  <InitialsAvatar name={data.student.fullName} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="subtitle">{data.student.fullName}</Text>
                    <Text variant="caption">{beltChipLabel(data.belt)}</Text>
                  </View>
                </View>

                <Card testID="belt-card">
                  <View style={{ gap: theme.space['3'] }}>
                    <BeltBar belt={data.belt} size="lg" testID="profile-belt" />
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: theme.space['2'],
                      }}
                    >
                      <Text variant="label" weight="semibold">
                        {beltChipLabel(data.belt)}
                      </Text>
                      <Text variant="caption" style={{ fontSize: 11 }}>
                        {progressLine(data.progress)}
                      </Text>
                    </View>
                    {canAward ? (
                      <View style={{ flexDirection: 'row', gap: theme.space['2'] }}>
                        <TatameButton
                          size="sm"
                          label="Adicionar grau"
                          disabled={atMaxDegrees}
                          onPress={() => setAward('degree')}
                          style={{ flex: 1 }}
                        />
                        <TatameButton
                          size="sm"
                          variant="secondary"
                          label="Promover faixa"
                          disabled={!promotionTarget}
                          onPress={() => setAward('belt')}
                          style={{ flex: 1 }}
                        />
                      </View>
                    ) : null}
                  </View>
                </Card>

                <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
                  <StatTile
                    testID="tile-frequencia"
                    value={`${data.stats.monthPresencePct}%`}
                    label="frequência"
                  />
                  <StatTile
                    testID="tile-aulas-mes"
                    value={`${data.stats.monthAttendedSessions}`}
                    label="aulas no mês"
                  />
                  <StatTile testID="tile-mensalidade" value="—" label="mensalidade" note="Em breve" />
                </View>

                <Text variant="subtitle">Observações</Text>
                {data.notes.length === 0 ? (
                  <Card>
                    <Text variant="caption">Nenhuma observação registrada ainda.</Text>
                  </Card>
                ) : (
                  data.notes.map((note) => (
                    <Card key={note.id} padding={theme.space['4']} testID={`note-${note.id}`}>
                      <View style={{ gap: 4 }}>
                        <Text variant="caption" color={theme.color.fg['2']}>
                          {note.body}
                        </Text>
                        <Text variant="caption" style={{ fontSize: 11 }}>
                          {shortDatePt(note.createdAt)} · {professorTag(note.author.fullName)}
                        </Text>
                      </View>
                    </Card>
                  ))
                )}

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: theme.space['2'],
                  }}
                >
                  <FormField
                    label="Nova observação"
                    value={noteBody}
                    onChangeText={setNoteBody}
                    placeholder="Nova observação"
                    error={noteError ?? undefined}
                    style={{ flex: 1 }}
                    testID="note-input"
                  />
                  <TatameButton
                    label="Salvar"
                    size="sm"
                    loading={noteMutation.isPending}
                    disabled={!noteBody.trim()}
                    onPress={saveNote}
                    style={{ marginBottom: 2 }}
                  />
                </View>
              </>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>

      <BottomSheet
        open={award !== null}
        onClose={closeAwardSheet}
        title={award === 'belt' ? 'Promover faixa' : 'Adicionar grau'}
        subtitle={
          data
            ? award === 'belt'
              ? promotionTarget
                ? `${data.student.fullName} é promovido para a faixa ${promotionTarget.name.toLocaleLowerCase('pt-BR')}. Os graus voltam a zero.`
                : undefined
              : `${data.student.fullName} recebe o ${data.belt.degrees + 1}º grau na faixa ${data.belt.name.toLocaleLowerCase('pt-BR')}.`
            : undefined
        }
        testID="award-sheet"
      >
        <View style={{ gap: theme.space['3'] }}>
          <FormField
            label="Observação (opcional)"
            value={awardNotes}
            onChangeText={setAwardNotes}
            placeholder="Exame de faixa — aprovado com distinção."
            testID="award-notes-input"
          />
          {awardError ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {awardError}
            </Text>
          ) : null}
          <TatameButton
            fullWidth
            label={award === 'belt' ? 'Confirmar promoção' : 'Confirmar grau'}
            loading={awardMutation.isPending}
            onPress={confirmAward}
          />
          <TatameButton fullWidth variant="ghost" label="Cancelar" onPress={closeAwardSheet} />
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
