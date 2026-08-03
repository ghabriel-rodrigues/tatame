/**
 * Turma detail (ENR.15-16, admin-11): recurring schedule, server-derived
 * occupancy, attendance placeholder tiles (Phase 4 — never faked), roster
 * with add/remove, name edit and archive with the ended-enrollments warning.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate, useParams } from 'react-router';
import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  ListRow,
  ScreenHeader,
  TatameButton,
  Toast,
} from '@tatame/design-system';
import { $api, queryClient } from '../../api/api';
import { InitialsAvatar, enrollmentErrorMessage, useToastState } from './common';
import { WEEKDAY_CHIP_ORDER, WEEKDAY_SHORT, scheduleTimeRange } from './format';
import { EditRecordSheet } from './EditRecordSheet';

function StatTile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <Card padding={14} className="StatTile">
      <Stack sx={{ alignItems: 'center' }} spacing="2px">
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'var(--fg-1)' }}>
          {value}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: 'var(--fg-3)' }}>{label}</Typography>
        {hint ? (
          <Typography sx={{ fontSize: 10.5, color: 'var(--fg-4, var(--fg-3))' }}>{hint}</Typography>
        ) : null}
      </Stack>
    </Card>
  );
}

const RemoveIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export function TurmaDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToastState();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const detail = $api.useQuery('get', '/v1/admin/classes/{id}', {
    params: { path: { id } },
  });
  const students = $api.useQuery('get', '/v1/admin/students', undefined, { enabled: adding });
  const addStudent = $api.useMutation('post', '/v1/admin/classes/{id}/students');
  const removeStudent = $api.useMutation('delete', '/v1/admin/classes/{id}/students/{studentId}');
  const rename = $api.useMutation('patch', '/v1/admin/classes/{id}');
  const archive = $api.useMutation('post', '/v1/admin/classes/{id}/archive');

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/classes'] });
  }

  const turma = detail.data?.class;

  if (detail.isLoading) {
    return (
      <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center', mt: 4 }}>
        Carregando turma…
      </Typography>
    );
  }
  if (!turma) {
    return (
      <EmptyState
        title="Turma não encontrada"
        description="Ela pode ter sido arquivada."
        action={<TatameButton label="Voltar" onPress={() => navigate('/admin/cadastros')} />}
      />
    );
  }

  const activeDays = new Set(turma.schedules.map((slot) => slot.weekday));
  const firstSlot = turma.schedules[0];
  const rosterIds = new Set(turma.roster.map((row) => row.studentId));
  const candidates = (students.data?.students ?? []).filter(
    (student) => !rosterIds.has(student.id),
  );

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title={turma.name}
          subtitle={`Prof. ${turma.professor.fullName}`}
          onBack={() => navigate('/admin/cadastros')}
          trailing={
            <Stack direction="row" spacing="8px">
              <TatameButton size="sm" variant="secondary" label="Editar" onPress={() => setEditing(true)} />
              <TatameButton size="sm" label="Adicionar aluno" onPress={() => setAdding(true)} />
            </Stack>
          }
        />

        <Card>
          <Typography variant="overline" sx={{ color: 'var(--fg-3)' }}>
            Horário recorrente
          </Typography>
          <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {WEEKDAY_CHIP_ORDER.map((weekday) => (
              <Chip
                key={weekday}
                label={WEEKDAY_SHORT[weekday] ?? ''}
                size="md"
                selected={activeDays.has(weekday)}
              />
            ))}
          </Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginTop: '12px',
            }}
          >
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'var(--fg-1)' }}>
              {firstSlot ? scheduleTimeRange(firstSlot) : 'Sem horário'}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'var(--fg-3)' }}>toda semana</Typography>
          </Box>
        </Card>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <StatTile
            value={`${turma.occupancy} de ${turma.capacity}`}
            label="ocupação"
            {...(turma.lotada ? { hint: 'Lotada' } : {})}
          />
          <StatTile value="—" label="frequência média" hint="Disponível na Fase 4 (chamadas)" />
        </Box>

        <Stack spacing="8px">
          <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg-1)' }}>
            Alunos da turma
          </Typography>
          <Card padding={4}>
            {turma.roster.length === 0 ? (
              <EmptyState
                title="Nenhum aluno matriculado"
                description="Use 'Adicionar aluno' para montar a turma."
              />
            ) : null}
            {turma.roster.map((row) => (
              <ListRow
                key={row.studentId}
                title={row.fullName}
                leading={<InitialsAvatar name={row.fullName} />}
                trailing={
                  <IconButton
                    size="small"
                    aria-label={`Remover ${row.fullName}`}
                    onClick={() => {
                      removeStudent.mutate(
                        { params: { path: { id: turma.id, studentId: row.studentId } } },
                        {
                          onSuccess: () => {
                            void invalidate();
                            toast.show('Aluno removido da turma.');
                          },
                          onError: (error) => toast.show(enrollmentErrorMessage(error)),
                        },
                      );
                    }}
                  >
                    <RemoveIcon />
                  </IconButton>
                }
              />
            ))}
          </Card>
        </Stack>
      </Stack>

      {adding ? (
        <BottomSheet
          open
          onClose={() => {
            setAdding(false);
            setAddError(null);
          }}
          title="Adicionar aluno"
          subtitle="Alunos da academia que ainda não estão nesta turma."
        >
          {candidates.length === 0 && !students.isLoading ? (
            <EmptyState title="Nenhum aluno disponível" />
          ) : null}
          {candidates.map((student) => (
            <ListRow
              key={student.id}
              title={student.fullName}
              leading={<InitialsAvatar name={student.fullName} />}
              trailing={<Chip label="adicionar" tone="brand" />}
              onPress={() => {
                setAddError(null);
                addStudent.mutate(
                  {
                    params: { path: { id: turma.id } },
                    body: { studentId: student.id },
                  },
                  {
                    onSuccess: () => {
                      void invalidate();
                      setAdding(false);
                      toast.show('Aluno adicionado à turma.');
                    },
                    onError: (error) => setAddError(enrollmentErrorMessage(error)),
                  },
                );
              }}
            />
          ))}
          {addError ? (
            <Typography
              role="alert"
              sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)', marginTop: '12px' }}
            >
              {addError}
            </Typography>
          ) : null}
        </BottomSheet>
      ) : null}

      {editing ? (
        <EditRecordSheet
          key={turma.id}
          open
          onClose={() => setEditing(false)}
          title="Editar turma"
          currentName={turma.name}
          onRename={async (name) => {
            await rename.mutateAsync({ params: { path: { id: turma.id } }, body: { name } });
            await invalidate();
            setEditing(false);
            toast.show('Nome atualizado.');
          }}
          archive={{
            confirmTitle: 'Excluir turma',
            confirmText:
              'As matrículas ativas desta turma serão encerradas e ela sai das listagens ativas. O histórico é preservado.',
            onArchive: async () => {
              await archive.mutateAsync({ params: { path: { id: turma.id } } });
              await invalidate();
              toast.show('Turma excluída.');
              navigate('/admin/cadastros');
            },
          }}
        />
      ) : null}

      <Toast open={toast.message !== null} message={toast.message ?? ''} onClose={toast.clear} />
    </Box>
  );
}

export default TurmaDetailPage;
