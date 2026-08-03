/**
 * "Adicionar aluno" picker (ENR.18, professor-09): bottom sheet listing
 * students the professor can enroll that are not yet on this roster.
 *
 * Candidate source: the rosters of the professor's OTHER classes — the
 * contract has no professor-wide student list (GET /admin/students is
 * admin-only), so the picker offers exactly the students the professor is
 * allowed to see. Recorded as parity debt: a dedicated professor student
 * search needs a backend endpoint.
 *
 * POST /v1/professor/classes/:id/students; class.full and
 * enrollment.already_enrolled surface as inline PT-BR errors.
 */

import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  useQueries,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ClassDetail, RosterStudent } from '@tatame/shared';
import { BottomSheet, ListRow, Text, useTheme } from '@tatame/design-system/native';
import { api } from '../../api/query';
import { enrollmentErrorMessage } from './copy';
import { InitialsAvatar } from './ui';

export interface AddStudentSheetProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  /** Current roster — the exclusion set for the picker. */
  roster: RosterStudent[];
  /** Fired after a successful add (parent shows the toast). */
  onAdded: (studentName: string) => void;
}

export function AddStudentSheet({
  open,
  onClose,
  classId,
  className,
  roster,
  onAdded,
}: AddStudentSheetProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const listQuery = api.useQuery('get', '/v1/professor/classes', undefined, { enabled: open });
  const otherClassIds = (listQuery.data?.classes ?? [])
    .filter((turma) => turma.id !== classId)
    .map((turma) => turma.id);

  // openapi-react-query's derived options don't fit useQueries' widened
  // generics (upstream variance friction); the key/fn pair is fully typed
  // at creation, so the cast only erases that noise.
  const detailQueries = useQueries({
    queries: otherClassIds.map((id) => ({
      ...api.queryOptions('get', '/v1/professor/classes/{id}', { params: { path: { id } } }),
      enabled: open,
    })) as unknown as UseQueryOptions<{ class: ClassDetail }>[],
  }) as UseQueryResult<{ class: ClassDetail }>[];

  const candidates = useMemo(() => {
    const enrolledIds = new Set(roster.map((student) => student.studentId));
    const byId = new Map<string, RosterStudent>();
    for (const query of detailQueries) {
      for (const student of query.data?.class.roster ?? []) {
        if (!enrolledIds.has(student.studentId)) byId.set(student.studentId, student);
      }
    }
    return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [detailQueries, roster]);

  const addMutation = api.useMutation('post', '/v1/professor/classes/{id}/students');

  const addStudent = (student: RosterStudent) => {
    setError(null);
    setPendingId(student.studentId);
    addMutation.mutate(
      { params: { path: { id: classId } }, body: { studentId: student.studentId } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/professor/classes'] });
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/professor/classes/{id}'],
          });
          onAdded(student.fullName);
          onClose();
        },
        onError: (mutationError) => setError(enrollmentErrorMessage(mutationError)),
        onSettled: () => setPendingId(null),
      },
    );
  };

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Adicionar aluno"
      subtitle={`Turma ${className} · gestão compartilhada com o admin`}
      testID="add-student-sheet"
    >
      {error ? (
        <Text
          variant="caption"
          color={theme.color.danger['500']}
          style={{ marginBottom: theme.space['2'] }}
        >
          {error}
        </Text>
      ) : null}
      {candidates.length === 0 ? (
        <Text variant="caption">
          Nenhum aluno disponível para adicionar. O cadastro completo de alunos é gerenciado
          pelo admin.
        </Text>
      ) : (
        <View>
          {candidates.map((student, index) => (
            <ListRow
              key={student.studentId}
              title={student.fullName}
              leading={<InitialsAvatar name={student.fullName} size={30} />}
              divider={index < candidates.length - 1}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Adicionar ${student.fullName}`}
                  disabled={pendingId !== null}
                  onPress={() => addStudent(student)}
                  hitSlop={8}
                >
                  <Text
                    variant="label"
                    color={theme.color.brand['2']}
                    style={{ opacity: pendingId !== null ? 0.5 : 1 }}
                  >
                    + adicionar
                  </Text>
                </Pressable>
              }
            />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}
