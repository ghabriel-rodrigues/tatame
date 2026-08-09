/**
 * Name-only edit + excluir (soft archive) sheet (ENR.16). The backend
 * contract fixes the per-type capabilities: students rename+archive,
 * guardians rename only (BOSS ruling — no guardian archive this slice),
 * turmas rename+archive from the detail screen. Professors expose neither.
 */
import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormHelperText from '@mui/material/FormHelperText';
import Stack from '@mui/material/Stack';
import { BottomSheet, FormField, TatameButton } from '@tatame/design-system';
import { enrollmentErrorMessage } from './common';

export interface EditRecordSheetProps {
  open: boolean;
  onClose: () => void;
  /** Sheet heading ("Editar aluno", "Editar responsável"). */
  title: string;
  currentName: string;
  /** Resolves on success; rejection renders the problem PT-BR message. */
  onRename: (fullName: string) => Promise<void>;
  /** Omit to hide the excluir flow (guardians). */
  archive?: {
    /** Confirmation dialog copy — turma warns about ended enrollments. */
    confirmTitle: string;
    confirmText: string;
    onArchive: () => Promise<void>;
  };
  /**
   * Optional extra action rendered between Salvar and Excluir — the student
   * sheet plugs "Ver graduações" here (GRD.14).
   */
  secondaryAction?: { label: string; onPress: () => void };
}

export function EditRecordSheet({
  open,
  onClose,
  title,
  currentName,
  onRename,
  archive,
  secondaryAction,
}: EditRecordSheetProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim().length < 2) {
      setError('Informe o nome completo.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRename(name.trim());
    } catch (cause) {
      setError(enrollmentErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirmArchive() {
    if (!archive) return;
    setBusy(true);
    setError(null);
    try {
      await archive.onArchive();
      setConfirming(false);
    } catch (cause) {
      setConfirming(false);
      setError(enrollmentErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title} subtitle="Hoje só o nome é editável.">
      <Stack spacing="14px">
        <FormField label="Nome" value={name} onChangeText={setName} required />
        {error ? <FormHelperText error>{error}</FormHelperText> : null}
        <TatameButton label="Salvar" fullWidth loading={busy} onPress={() => void save()} />
        {secondaryAction ? (
          <TatameButton
            variant="secondary"
            label={secondaryAction.label}
            fullWidth
            disabled={busy}
            onPress={secondaryAction.onPress}
          />
        ) : null}
        {archive ? (
          <TatameButton
            variant="danger"
            label="Excluir"
            fullWidth
            disabled={busy}
            onPress={() => setConfirming(true)}
          />
        ) : null}
      </Stack>
      {archive ? (
        <Dialog open={confirming} onClose={() => setConfirming(false)}>
          <DialogTitle>{archive.confirmTitle}</DialogTitle>
          <DialogContent>
            <DialogContentText>{archive.confirmText}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button color="error" onClick={() => void confirmArchive()}>
              Excluir
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </BottomSheet>
  );
}
