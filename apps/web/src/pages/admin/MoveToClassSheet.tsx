/**
 * "Mover para turma" destination picker (ENR.14, admin-09). The move is
 * atomic on the server — success moves the whole selection; a capacity
 * rejection renders the per-student detail from the problem `errors[]`.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BottomSheet, Chip, EmptyState, ListRow } from '@tatame/design-system';
import { ApiErrorCodes, isProblemCode, parseProblem, type StudentListItem } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { InitialsAvatar, enrollmentErrorMessage } from './common';
import { scheduleTimeRange } from './format';

export interface MoveToClassSheetProps {
  open: boolean;
  onClose: () => void;
  selection: StudentListItem[];
  onSuccess: (message: string) => void;
}

export function MoveToClassSheet({ open, onClose, selection, onSuccess }: MoveToClassSheetProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [perStudentErrors, setPerStudentErrors] = useState<string[]>([]);

  const classes = $api.useQuery('get', '/v1/admin/classes');
  const move = $api.useMutation('post', '/v1/admin/students/move');

  const nameById = new Map(selection.map((student) => [student.id, student.fullName]));

  function moveTo(destinationClassId: string) {
    setApiError(null);
    setPerStudentErrors([]);
    move.mutate(
      {
        body: {
          studentIds: selection.map((student) => student.id),
          destinationClassId,
        },
      },
      {
        onSuccess: (result) => {
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/students'] });
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/classes'] });
          const destination = classes.data?.classes.find(
            (turma) => turma.id === result.destinationClassId,
          );
          const count = result.movedStudentIds.length;
          onSuccess(
            count === 1
              ? `1 aluno movido para ${destination?.name ?? 'a turma'}.`
              : `${count} alunos movidos para ${destination?.name ?? 'a turma'}.`,
          );
        },
        onError: (error) => {
          setApiError(enrollmentErrorMessage(error));
          if (isProblemCode(error, ApiErrorCodes.CLASS_CAPACITY_EXCEEDED)) {
            const problem = parseProblem(error);
            setPerStudentErrors(
              (problem?.errors ?? []).map(
                (entry) =>
                  `${nameById.get(entry.field) ?? entry.field}: sem vaga na turma de destino.`,
              ),
            );
          }
        },
      },
    );
  }

  const count = selection.length;
  const active = (classes.data?.classes ?? []).filter((turma) => turma.status === 'active');

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={count === 1 ? 'Mover 1 aluno' : `Mover ${count} alunos`}
      subtitle="Escolha a turma de destino — plano e agenda são atualizados."
    >
      <Stack spacing="2px">
        {active.length === 0 && !classes.isLoading ? (
          <EmptyState
            title="Nenhuma turma ativa"
            description="Crie uma turma no segmento Turmas antes de mover alunos."
          />
        ) : null}
        {active.map((turma) => {
          const free = turma.capacity - turma.occupancy;
          const fits = free >= count;
          const firstSlot = turma.schedules[0];
          const subtitle = [
            firstSlot ? scheduleTimeRange(firstSlot) : 'Sem horário',
            `Prof. ${turma.professor.fullName}`,
            `${turma.occupancy}/${turma.capacity}`,
          ].join(' · ');
          return (
            <ListRow
              key={turma.id}
              title={turma.name}
              subtitle={subtitle}
              leading={<InitialsAvatar name={turma.name} />}
              trailing={
                fits ? (
                  <Chip label="mover →" tone="brand" />
                ) : (
                  <Chip label={turma.lotada ? 'Lotada' : 'Sem vagas'} tone="danger" />
                )
              }
              {...(fits && !move.isPending ? { onPress: () => moveTo(turma.id) } : {})}
            />
          );
        })}
      </Stack>
      {apiError ? (
        <Box role="alert" sx={{ marginTop: '14px' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}>
            {apiError}
          </Typography>
          {perStudentErrors.map((line) => (
            <Typography key={line} sx={{ fontSize: 12.5, color: 'var(--danger-500)' }}>
              {line}
            </Typography>
          ))}
        </Box>
      ) : null}
    </BottomSheet>
  );
}
