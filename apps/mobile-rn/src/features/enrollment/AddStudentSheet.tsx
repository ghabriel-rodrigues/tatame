/**
 * "Adicionar aluno" picker (ENR.18 → ATT.18, professor-09): bottom sheet
 * listing real enrollment candidates from
 * GET /v1/professor/students?notEnrolledInClassId — the dedicated professor
 * listing that closed the recorded parity debt (the picker used to union
 * the professor's other-class rosters because no such endpoint existed).
 *
 * POST /v1/professor/classes/:id/students; class.full and
 * enrollment.already_enrolled surface as inline PT-BR errors.
 */

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { ProfessorStudent } from '@tatame/shared';
import {
  BottomSheet,
  ListRow,
  Text,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../api/query';
import { enrollmentErrorMessage } from './copy';
import { InitialsAvatar } from './ui';

export interface AddStudentSheetProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  /** Fired after a successful add (parent shows the toast). */
  onAdded: (studentName: string) => void;
}

export function AddStudentSheet({
  open,
  onClose,
  classId,
  className,
  onAdded,
}: AddStudentSheetProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const candidatesQuery = api.useQuery(
    'get',
    '/v1/professor/students',
    { params: { query: { notEnrolledInClassId: classId } } },
    { enabled: open },
  );
  const candidates = candidatesQuery.data?.students ?? [];

  const addMutation = api.useMutation(
    'post',
    '/v1/professor/classes/{id}/students',
  );

  const addStudent = (student: ProfessorStudent) => {
    setError(null);
    setPendingId(student.id);
    addMutation.mutate(
      { params: { path: { id: classId } }, body: { studentId: student.id } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/professor/classes'],
          });
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/professor/classes/{id}'],
          });
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/professor/students'],
          });
          onAdded(student.fullName);
          onClose();
        },
        onError: (mutationError) =>
          setError(enrollmentErrorMessage(mutationError)),
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
      {candidatesQuery.isPending ? (
        <Text variant="caption">Carregando…</Text>
      ) : candidates.length === 0 ? (
        <Text variant="caption">
          Nenhum aluno disponível para adicionar. O cadastro completo de alunos
          é gerenciado pelo admin.
        </Text>
      ) : (
        <View>
          {candidates.map((student, index) => (
            <ListRow
              key={student.id}
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
