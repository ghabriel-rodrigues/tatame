/**
 * Cadastros (ENR.13-14, admin-07…09): four segments, derived badges, search,
 * FAB creation forms, multi-select with the atomic "Mover para turma" flow,
 * and name-edit/excluir per the backend contract (ENR.16).
 *
 * Belt chips landed with GRD.14: student rows carry the derived
 * "Faixa azul · 2 graus" subtitle, turma rows the "Branca a Azul" range
 * chip, and the row's edit sheet opens the graduation-history drawer with
 * the audited Revogar. Plan line items stay billing scope (recorded debt).
 */
import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import {
  Card,
  Chip,
  EmptyState,
  FormField,
  ListRow,
  ScreenHeader,
  SegmentedControl,
  TatameButton,
  Toast,
} from '@tatame/design-system';
import type { GuardianListItem, StudentListItem } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { Fab, InitialsAvatar, StatusBadge, useToastState } from './common';
import { beltRangeLabel, beltWithDegrees, classSubtitle } from './format';
import { planOptionLabel } from '../billing-format';
import {
  NewGuardianSheet,
  NewProfessorSheet,
  NewStudentSheet,
} from './CreateSheets';
import { NewClassSheet } from './NewClassSheet';
import { MoveToClassSheet } from './MoveToClassSheet';
import { EditRecordSheet } from './EditRecordSheet';
import { GraduationHistorySheet } from './GraduationHistorySheet';

type Segment = 'alunos' | 'professores' | 'responsaveis' | 'turmas';

const SEGMENTS = [
  { value: 'alunos', label: 'Alunos' },
  { value: 'professores', label: 'Professores' },
  { value: 'responsaveis', label: 'Responsáveis' },
  { value: 'turmas', label: 'Turmas' },
] as const;

function studentSubtitle(student: StudentListItem): string {
  const classes = student.classes.map((turma) => turma.name);
  const parts = [
    // Derived belt payload (GRD.6) — "Faixa azul · 2 graus" per admin-07.
    ...(student.belt ? [beltWithDegrees(student.belt)] : []),
    ...(classes.length > 0 ? classes : ['Sem turma']),
  ];
  return parts.join(' · ');
}

export function CadastrosPage() {
  const navigate = useNavigate();
  const toast = useToastState();
  const [segment, setSegment] = useState<Segment>('alunos');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moving, setMoving] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentListItem | null>(
    null,
  );
  const [editingGuardian, setEditingGuardian] =
    useState<GuardianListItem | null>(null);
  const [historyStudent, setHistoryStudent] = useState<StudentListItem | null>(
    null,
  );

  const students = $api.useQuery('get', '/v1/admin/students', undefined, {
    enabled: segment === 'alunos',
  });
  const professors = $api.useQuery('get', '/v1/admin/professors', undefined, {
    enabled: segment === 'professores',
  });
  const guardians = $api.useQuery('get', '/v1/admin/guardians', undefined, {
    enabled: segment === 'responsaveis',
  });
  const classes = $api.useQuery('get', '/v1/admin/classes', undefined, {
    enabled: segment === 'turmas',
  });
  // Plan catalog for the student edit sheet's plan select (BIL.14).
  const plans = $api.useQuery('get', '/v1/admin/billing/plans', undefined, {
    enabled: segment === 'alunos',
  });
  const activePlans = (plans.data?.plans ?? []).filter((plan) => plan.isActive);

  const renameStudent = $api.useMutation('patch', '/v1/admin/students/{id}');
  const archiveStudent = $api.useMutation(
    'post',
    '/v1/admin/students/{id}/archive',
  );
  const renameGuardian = $api.useMutation('patch', '/v1/admin/guardians/{id}');

  const query = search.trim().toLowerCase();
  const matches = (name: string) =>
    query === '' || name.toLowerCase().includes(query);

  const studentRows = useMemo(
    () =>
      (students.data?.students ?? []).filter((student) =>
        matches(student.fullName),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students.data, query],
  );
  const selection = studentRows.filter((student) =>
    selectedIds.includes(student.id),
  );

  function switchSegment(next: Segment) {
    setSegment(next);
    setSearch('');
    exitSelection();
  }

  function exitSelection() {
    setSelecting(false);
    setSelectedIds([]);
    setMoving(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function invalidateStudents() {
    await queryClient.invalidateQueries({
      queryKey: ['get', '/v1/admin/students'],
    });
  }

  const counts: Record<Segment, { total: number; label: string }> = {
    alunos: {
      total: students.data?.students.length ?? 0,
      label: 'alunos no total',
    },
    professores: {
      total: professors.data?.professors.length ?? 0,
      label: 'professores no total',
    },
    responsaveis: {
      total: guardians.data?.guardians.length ?? 0,
      label: 'responsáveis no total',
    },
    turmas: {
      total: classes.data?.classes.length ?? 0,
      label: 'turmas ativas',
    },
  };

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Cadastros"
          subtitle="Use o botão '+' para criar novos registros."
          trailing={
            segment === 'alunos' ? (
              selecting ? (
                <TatameButton
                  size="sm"
                  label="Cancelar"
                  onPress={exitSelection}
                />
              ) : (
                <TatameButton
                  size="sm"
                  variant="secondary"
                  label="Selecionar vários"
                  onPress={() => setSelecting(true)}
                />
              )
            ) : undefined
          }
        />
        <SegmentedControl
          options={SEGMENTS}
          value={segment}
          onChange={(value) => switchSegment(value as Segment)}
          ariaLabel="Tipo de cadastro"
        />
        <FormField
          label="Buscar"
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar pelo nome"
        />

        <Card padding={4}>
          {segment === 'alunos' ? (
            <>
              {studentRows.length === 0 && !students.isLoading ? (
                <EmptyState
                  title="Nenhum aluno encontrado"
                  description="Use o botão '+' para criar o primeiro registro."
                />
              ) : null}
              {studentRows.map((student) => (
                <ListRow
                  key={student.id}
                  title={student.fullName}
                  subtitle={studentSubtitle(student)}
                  selected={selecting && selectedIds.includes(student.id)}
                  leading={
                    selecting ? (
                      <Checkbox
                        size="small"
                        checked={selectedIds.includes(student.id)}
                        onChange={() => toggleSelected(student.id)}
                        slotProps={{
                          input: {
                            'aria-label': `Selecionar ${student.fullName}`,
                          },
                        }}
                      />
                    ) : (
                      <InitialsAvatar name={student.fullName} />
                    )
                  }
                  trailing={<StatusBadge badge={student.badge} />}
                  chevron={!selecting}
                  {...(selecting
                    ? {}
                    : { onPress: () => setEditingStudent(student) })}
                />
              ))}
            </>
          ) : null}

          {segment === 'professores' ? (
            <>
              {(professors.data?.professors ?? []).filter((p) =>
                matches(p.fullName),
              ).length === 0 && !professors.isLoading ? (
                <EmptyState
                  title="Nenhum professor encontrado"
                  description="Use o botão '+' para registrar um professor."
                />
              ) : null}
              {(professors.data?.professors ?? [])
                .filter((professor) => matches(professor.fullName))
                .map((professor) => (
                  <ListRow
                    key={professor.membershipId}
                    title={professor.fullName}
                    subtitle={professor.email}
                    leading={<InitialsAvatar name={professor.fullName} />}
                    trailing={
                      professor.status === 'active' ? (
                        <Chip label="Ativo" tone="success" />
                      ) : (
                        <Chip label="Pendente" tone="warning" />
                      )
                    }
                  />
                ))}
            </>
          ) : null}

          {segment === 'responsaveis' ? (
            <>
              {(guardians.data?.guardians ?? []).filter((g) =>
                matches(g.fullName),
              ).length === 0 && !guardians.isLoading ? (
                <EmptyState
                  title="Nenhum responsável encontrado"
                  description="Use o botão '+' para criar o primeiro registro."
                />
              ) : null}
              {(guardians.data?.guardians ?? [])
                .filter((guardian) => matches(guardian.fullName))
                .map((guardian) => (
                  <ListRow
                    key={guardian.id}
                    title={guardian.fullName}
                    subtitle={`${guardian.dependentCount} ${
                      guardian.dependentCount === 1
                        ? 'dependente'
                        : 'dependentes'
                    }`}
                    leading={<InitialsAvatar name={guardian.fullName} />}
                    trailing={<StatusBadge badge={guardian.badge} />}
                    chevron
                    onPress={() => setEditingGuardian(guardian)}
                  />
                ))}
            </>
          ) : null}

          {segment === 'turmas' ? (
            <>
              {(classes.data?.classes ?? []).filter((c) => matches(c.name))
                .length === 0 && !classes.isLoading ? (
                <EmptyState
                  title="Nenhuma turma ativa"
                  description="Use o botão '+' para criar uma turma recorrente."
                />
              ) : null}
              {(classes.data?.classes ?? [])
                .filter((turma) => matches(turma.name))
                .map((turma) => {
                  // "Branca a Azul" belt-range chip on class cards (GRD.14).
                  const range = beltRangeLabel(turma.minBelt, turma.maxBelt);
                  return (
                    <ListRow
                      key={turma.id}
                      title={turma.name}
                      subtitle={classSubtitle(turma)}
                      leading={<InitialsAvatar name={turma.name} />}
                      trailing={
                        range || turma.lotada ? (
                          <Stack direction="row" spacing="6px">
                            {range ? <Chip label={range} /> : null}
                            {turma.lotada ? (
                              <Chip label="Lotada" tone="brand" />
                            ) : null}
                          </Stack>
                        ) : undefined
                      }
                      chevron
                      onPress={() => navigate(`/admin/turmas/${turma.id}`)}
                    />
                  );
                })}
            </>
          ) : null}
        </Card>

        <Typography
          sx={{ fontSize: 12, color: 'var(--fg-3)', textAlign: 'center' }}
        >
          {counts[segment].total} {counts[segment].label} — mantenha os
          cadastros em dia.
        </Typography>
      </Stack>

      {selecting ? (
        <Box
          sx={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 24,
            width: 'min(520px, calc(100% - 40px))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '18px',
            background: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-md, 0 8px 20px rgba(42, 18, 72, 0.16))',
            border: '1px solid var(--border-1)',
            zIndex: 20,
          }}
        >
          <Typography
            sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)' }}
          >
            {selectedIds.length === 1
              ? '1 selecionado'
              : `${selectedIds.length} selecionados`}
          </Typography>
          <TatameButton
            size="sm"
            label="Mover para turma"
            disabled={selectedIds.length === 0}
            onPress={() => setMoving(true)}
          />
        </Box>
      ) : (
        <Fab label="Criar registro" onPress={() => setCreating(true)} />
      )}

      {segment === 'alunos' && creating ? (
        <NewStudentSheet
          open
          onClose={() => setCreating(false)}
          onSuccess={toast.show}
        />
      ) : null}
      {segment === 'professores' && creating ? (
        <NewProfessorSheet
          open
          onClose={() => setCreating(false)}
          onSuccess={toast.show}
        />
      ) : null}
      {segment === 'responsaveis' && creating ? (
        <NewGuardianSheet
          open
          onClose={() => setCreating(false)}
          onSuccess={toast.show}
        />
      ) : null}
      {segment === 'turmas' && creating ? (
        <NewClassSheet
          open
          onClose={() => setCreating(false)}
          onSuccess={toast.show}
        />
      ) : null}

      {moving ? (
        <MoveToClassSheet
          open
          onClose={() => setMoving(false)}
          selection={selection}
          onSuccess={(message) => {
            exitSelection();
            toast.show(message);
          }}
        />
      ) : null}

      {editingStudent ? (
        <EditRecordSheet
          key={editingStudent.id}
          open
          onClose={() => setEditingStudent(null)}
          title="Editar aluno"
          subtitle="Nome e plano de mensalidade do aluno."
          currentName={editingStudent.fullName}
          planSelect={{
            options: activePlans.map((plan) => ({
              id: plan.id,
              label: planOptionLabel(plan),
            })),
            initialValue: editingStudent.academyPlanId ?? null,
          }}
          onRename={async (fullName, academyPlanId) => {
            await renameStudent.mutateAsync({
              params: { path: { id: editingStudent.id } },
              body: {
                fullName,
                ...(academyPlanId !== undefined ? { academyPlanId } : {}),
              },
            });
            await invalidateStudents();
            setEditingStudent(null);
            toast.show('Cadastro atualizado.');
          }}
          archive={{
            confirmTitle: 'Excluir aluno',
            confirmText:
              'O aluno será desativado e suas matrículas ativas serão encerradas. O histórico é preservado.',
            onArchive: async () => {
              await archiveStudent.mutateAsync({
                params: { path: { id: editingStudent.id } },
              });
              await invalidateStudents();
              setEditingStudent(null);
              toast.show('Aluno excluído.');
            },
          }}
          secondaryAction={{
            label: 'Ver graduações',
            onPress: () => {
              setHistoryStudent(editingStudent);
              setEditingStudent(null);
            },
          }}
        />
      ) : null}

      {historyStudent ? (
        <GraduationHistorySheet
          open
          onClose={() => setHistoryStudent(null)}
          student={{ id: historyStudent.id, fullName: historyStudent.fullName }}
          onRevoked={toast.show}
        />
      ) : null}

      {editingGuardian ? (
        <EditRecordSheet
          key={editingGuardian.id}
          open
          onClose={() => setEditingGuardian(null)}
          title="Editar responsável"
          currentName={editingGuardian.fullName}
          onRename={async (fullName) => {
            await renameGuardian.mutateAsync({
              params: { path: { id: editingGuardian.id } },
              body: { fullName },
            });
            await queryClient.invalidateQueries({
              queryKey: ['get', '/v1/admin/guardians'],
            });
            setEditingGuardian(null);
            toast.show('Nome atualizado.');
          }}
        />
      ) : null}

      <Toast
        open={toast.message !== null}
        message={toast.message ?? ''}
        onClose={toast.clear}
      />
    </Box>
  );
}

export default CadastrosPage;
