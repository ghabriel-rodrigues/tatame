/**
 * CFG.11 — Permissões por perfil (admin-17): one card per role group
 * (Professor / Aluno / Responsável) with the member-count header ("N pessoas
 * neste papel") and registry-driven toggle rows — the screen renders whatever
 * the matrix response defines, no client-side row list to drift. Each flip
 * PUTs the single entry optimistically with rollback on error; the API guard
 * enforces the new value on the affected role's very next request.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import { Card, Chip, ScreenHeader, type ChipTone } from '@tatame/design-system';
import type { ResolvedPermission, RoleMemberCounts } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';

type PermissionRole = ResolvedPermission['role'];
type CountedRole = keyof RoleMemberCounts;

const GROUPS: Array<{ role: CountedRole; label: string; tone: ChipTone }> = [
  { role: 'professor', label: 'Professor', tone: 'brand' },
  { role: 'student', label: 'Aluno', tone: 'brand' },
  { role: 'guardian', label: 'Responsável', tone: 'danger' },
];

function countLabel(count: number): string {
  return count === 1 ? '1 pessoa neste papel' : `${count} pessoas neste papel`;
}

/** Registry labels arrive lowercase PT-BR — sentence-case them for display. */
function rowLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function PermissoesPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Optimistic flips keyed `${role}:${key}`; a failed PUT deletes its entry
  // so the switch rolls straight back to the server truth.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const matrixQuery = $api.useQuery('get', '/v1/admin/permissions');
  const update = $api.useMutation('put', '/v1/admin/permissions');

  const permissions = matrixQuery.data?.permissions ?? [];
  const counts = matrixQuery.data?.memberCounts;

  function allowedOf(row: ResolvedPermission): boolean {
    return overrides[`${row.role}:${row.key}`] ?? row.allowed;
  }

  function flip(row: ResolvedPermission, next: boolean): void {
    setError(null);
    const id = `${row.role}:${row.key}`;
    setOverrides((current) => ({ ...current, [id]: next }));
    update.mutate(
      {
        body: { entries: [{ role: row.role as PermissionRole, key: row.key, allowed: next }] },
      },
      {
        onSuccess: () => {
          // The override now equals the server truth; the refetch confirms it.
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/permissions'] });
        },
        onError: () => {
          setOverrides((current) => {
            const { [id]: _dropped, ...rest } = current;
            return rest;
          });
          setError('Não foi possível salvar a permissão. Tente novamente.');
        },
      },
    );
  }

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Permissões por perfil"
          subtitle="O que cada papel pode fazer nesta academia."
          onBack={() => navigate('/admin/configuracoes')}
        />

        {matrixQuery.isLoading ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}>
            Carregando permissões…
          </Typography>
        ) : null}

        {GROUPS.map((group) => {
          const rows = permissions.filter((row) => row.role === group.role);
          if (rows.length === 0) return null;
          return (
            <Card key={group.role} padding={0}>
              <Stack
                direction="row"
                spacing="10px"
                sx={{
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--border-1)',
                }}
              >
                <Chip label={group.label} tone={group.tone} />
                {counts ? (
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-3)' }}>
                    {countLabel(counts[group.role])}
                  </Typography>
                ) : null}
              </Stack>
              {rows.map((row) => (
                <Stack
                  key={row.key}
                  direction="row"
                  sx={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    '&:not(:last-of-type)': { borderBottom: '1px solid var(--border-1)' },
                  }}
                >
                  <Typography sx={{ fontSize: 13.5, fontWeight: 650, color: 'var(--fg-1)' }}>
                    {rowLabel(row.label)}
                  </Typography>
                  <Switch
                    size="small"
                    checked={allowedOf(row)}
                    onChange={(event) => flip(row, event.target.checked)}
                    slotProps={{ input: { 'aria-label': rowLabel(row.label) } }}
                  />
                </Stack>
              ))}
            </Card>
          );
        })}

        {error ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            {error}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

export default PermissoesPage;
