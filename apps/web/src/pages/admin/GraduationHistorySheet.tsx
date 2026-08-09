/**
 * Student graduation-history drawer (GRD.14): the full immutable timeline —
 * degree awards, belt promotions and revocation compensation rows rendered
 * distinctly — with the audited "Revogar" action per non-reversed award.
 * Revocation appends a compensation row (never edits), restores the previous
 * belt/degree and is possible at most once per award
 * (graduation.already_reversed on a second attempt).
 */
import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import {
  BeltBar,
  BottomSheet,
  Chip,
  EmptyState,
  FormField,
  ListRow,
  TatameButton,
} from '@tatame/design-system';
import type { GraduationEntry } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { graduationErrorMessage } from './common';
import { beltLabel, graduationDateLabel } from './format';

export interface GraduationHistorySheetProps {
  open: boolean;
  onClose: () => void;
  student: { id: string; fullName: string };
  /** Fires after a successful revocation (page-level toast). */
  onRevoked: (message: string) => void;
}

function entryTitle(entry: GraduationEntry): string {
  if (entry.kind === 'revocation') return `Revogação · ${beltLabel(entry.belt)}`;
  if (entry.kind === 'belt') return `Promoção · ${beltLabel(entry.belt)}`;
  return `${entry.degree}º grau · ${beltLabel(entry.belt)}`;
}

function entrySubtitle(entry: GraduationEntry): string {
  const base = `${graduationDateLabel(entry.awardedAt)} · por ${entry.awardedBy.fullName}`;
  return entry.notes ? `${base} · ${entry.notes}` : base;
}

export function GraduationHistorySheet({
  open,
  onClose,
  student,
  onRevoked,
}: GraduationHistorySheetProps) {
  const [revoking, setRevoking] = useState<GraduationEntry | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const history = $api.useQuery('get', '/v1/admin/students/{id}/graduations', {
    params: { path: { id: student.id } },
  });
  const revoke = $api.useMutation('post', '/v1/admin/graduations/{id}/revoke');

  const entries = history.data?.graduations ?? [];

  function confirmRevoke() {
    if (!revoking) return;
    setError(null);
    revoke.mutate(
      {
        params: { path: { id: revoking.id } },
        body: reason.trim() ? { reason: reason.trim() } : {},
      },
      {
        onSuccess: () => {
          setRevoking(null);
          setReason('');
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/admin/students/{id}/graduations'],
          });
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/students'] });
          onRevoked('Graduação revogada.');
        },
        onError: (cause) => {
          setRevoking(null);
          setError(graduationErrorMessage(cause));
        },
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Graduações de ${student.fullName}`}
      subtitle="Histórico imutável — correções entram como revogações auditadas."
    >
      {entries.length === 0 && !history.isLoading ? (
        <EmptyState
          title="Nenhuma graduação registrada"
          description="O aluno começa na faixa branca; graduações aparecem aqui."
        />
      ) : null}
      {entries.map((entry) => {
        return (
          <ListRow
            key={entry.id}
            className={entry.kind === 'revocation' ? 'GraduationRow-revocation' : undefined}
            title={entryTitle(entry)}
            subtitle={entrySubtitle(entry)}
            leading={
              <span style={{ opacity: entry.reversed ? 0.4 : 1 }}>
                <BeltBar
                  colorSlug={entry.belt.colorSlug}
                  tipColorSlug={entry.belt.tipColorSlug}
                  degrees={entry.kind === 'degree' ? entry.degree : 0}
                  maxDegrees={entry.belt.maxDegrees}
                  size="sm"
                  name={beltLabel(entry.belt)}
                />
              </span>
            }
            trailing={
              entry.kind === 'revocation' ? (
                <Chip label="Revogação" tone="danger" />
              ) : entry.reversed ? (
                <Chip label="Revogada" tone="danger" />
              ) : (
                <TatameButton
                  size="sm"
                  variant="ghost"
                  label="Revogar"
                  onPress={() => {
                    setError(null);
                    setRevoking(entry);
                  }}
                />
              )
            }
          />
        );
      })}
      {error ? (
        <Typography
          role="alert"
          sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)', marginTop: '12px' }}
        >
          {error}
        </Typography>
      ) : null}

      <Dialog open={revoking !== null} onClose={() => setRevoking(null)}>
        <DialogTitle>Revogar graduação</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ marginBottom: '12px' }}>
            Uma linha de compensação restaura a graduação anterior. A ação é auditada e cada
            graduação só pode ser revogada uma vez.
          </DialogContentText>
          <FormField
            label="Motivo (opcional)"
            value={reason}
            onChangeText={setReason}
            placeholder="Ex.: lançamento incorreto"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevoking(null)}>Cancelar</Button>
          <Button color="error" disabled={revoke.isPending} onClick={confirmRevoke}>
            Revogar
          </Button>
        </DialogActions>
      </Dialog>
    </BottomSheet>
  );
}
