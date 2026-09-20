/**
 * Planos de mensalidade (BIL.14, admin-15): the academy's plan catalog —
 * list (name, valor BRL, recurrence chip, "vence dia N", archived rows
 * dimmed), "Novo plano" / edit sheet (nome, valor, recorrência chips
 * mensal/trimestral/semestral/anual, vencimento chips 5/10/15 + custom day)
 * and the audited soft archive with confirmation (never hard-delete).
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  FormField,
  ListRow,
  ScreenHeader,
  TatameButton,
  Toast,
} from '@tatame/design-system';
import type { AcademyPlan, BillingRecurrence } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { billingErrorMessage, useToastState } from './common';
import {
  centsToInput,
  formatBRL,
  parseBRLInput,
  RECURRENCE_LABELS,
} from '../billing-format';

/** Handoff vencimento chips (admin-15); DB stays permissive 1–28. */
const DUE_DAY_CHIPS = [5, 10, 15] as const;
const RECURRENCES = Object.keys(RECURRENCE_LABELS) as BillingRecurrence[];

interface PlanSheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  /** Absent = create mode ("Novo plano"). */
  plan?: AcademyPlan;
}

function PlanSheet({ open, onClose, onSuccess, plan }: PlanSheetProps) {
  const editing = plan !== undefined;
  const presetDay =
    plan === undefined ||
    (DUE_DAY_CHIPS as readonly number[]).includes(plan.dueDay);
  const [name, setName] = useState(plan?.name ?? '');
  const [amountText, setAmountText] = useState(
    plan ? centsToInput(plan.amountCents) : '',
  );
  const [recurrence, setRecurrence] = useState<BillingRecurrence>(
    plan?.recurrence ?? 'monthly',
  );
  const [dueDay, setDueDay] = useState<number>(
    presetDay ? (plan?.dueDay ?? 5) : 0,
  );
  const [customDay, setCustomDay] = useState(
    presetDay ? '' : String(plan?.dueDay ?? ''),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const create = $api.useMutation('post', '/v1/admin/billing/plans');
  const update = $api.useMutation('patch', '/v1/admin/billing/plans/{id}');
  const archive = $api.useMutation(
    'post',
    '/v1/admin/billing/plans/{id}/archive',
  );
  const busy = create.isPending || update.isPending || archive.isPending;
  const customSelected = dueDay === 0;

  async function invalidatePlans() {
    await queryClient.invalidateQueries({
      queryKey: ['get', '/v1/admin/billing/plans'],
    });
  }

  function submit() {
    const next: Record<string, string> = {};
    const amountCents = parseBRLInput(amountText);
    const resolvedDay = customSelected ? Number(customDay) : dueDay;
    if (name.trim().length < 2) next['name'] = 'Informe o nome do plano.';
    if (amountCents === null)
      next['amount'] = 'Informe um valor válido, ex.: 180,00.';
    if (
      customSelected &&
      (!/^\d+$/.test(customDay) || resolvedDay < 1 || resolvedDay > 28)
    ) {
      next['dueDay'] = 'Informe um dia entre 1 e 28.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || amountCents === null) return;

    const body = {
      name: name.trim(),
      amountCents,
      recurrence,
      dueDay: resolvedDay,
    };
    const options = {
      onSuccess: async () => {
        await invalidatePlans();
        onSuccess(editing ? 'Plano atualizado.' : 'Plano criado.');
        onClose();
      },
      onError: (error: unknown) => setApiError(billingErrorMessage(error)),
    };
    if (editing) {
      update.mutate({ params: { path: { id: plan.id } }, body }, options);
    } else {
      create.mutate({ body }, options);
    }
  }

  function confirmArchive() {
    if (!plan) return;
    archive.mutate(
      { params: { path: { id: plan.id } } },
      {
        onSuccess: async () => {
          setConfirmingArchive(false);
          await invalidatePlans();
          onSuccess('Plano arquivado.');
          onClose();
        },
        onError: (error: unknown) => {
          setConfirmingArchive(false);
          setApiError(billingErrorMessage(error));
        },
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? 'Editar plano' : 'Novo plano'}
      subtitle="O que seus alunos assinam nesta academia."
    >
      <Stack spacing="14px">
        <FormField
          label="Nome"
          value={name}
          onChangeText={setName}
          error={errors['name']}
          required
        />
        <FormField
          label="Valor (R$)"
          value={amountText}
          onChangeText={setAmountText}
          placeholder="180,00"
          error={errors['amount']}
          required
        />

        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>
            Recorrência
          </FormLabel>
          <Stack
            direction="row"
            spacing="8px"
            sx={{ flexWrap: 'wrap', rowGap: '8px' }}
          >
            {RECURRENCES.map((value) => (
              <Chip
                key={value}
                label={RECURRENCE_LABELS[value]}
                size="md"
                tone="brand"
                selected={recurrence === value}
                onPress={() => setRecurrence(value)}
              />
            ))}
          </Stack>
        </Stack>

        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>
            Vencimento
          </FormLabel>
          <Stack
            direction="row"
            spacing="8px"
            sx={{ flexWrap: 'wrap', rowGap: '8px' }}
          >
            {DUE_DAY_CHIPS.map((day) => (
              <Chip
                key={day}
                label={`Dia ${day}`}
                size="md"
                tone="brand"
                selected={dueDay === day}
                onPress={() => setDueDay(day)}
              />
            ))}
            <Chip
              label="Outro dia"
              size="md"
              tone="brand"
              selected={customSelected}
              onPress={() => setDueDay(0)}
            />
          </Stack>
          {customSelected ? (
            <FormField
              label="Dia do vencimento"
              value={customDay}
              onChangeText={setCustomDay}
              placeholder="1 a 28"
              error={errors['dueDay']}
              required
            />
          ) : null}
        </Stack>

        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton
          label={editing ? 'Salvar plano' : 'Criar plano'}
          fullWidth
          loading={create.isPending || update.isPending}
          onPress={submit}
        />
        {editing ? (
          <TatameButton
            variant="danger"
            label="Arquivar plano"
            fullWidth
            disabled={busy}
            onPress={() => setConfirmingArchive(true)}
          />
        ) : null}
      </Stack>

      {editing ? (
        <Dialog
          open={confirmingArchive}
          onClose={() => setConfirmingArchive(false)}
        >
          <DialogTitle>Arquivar plano</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Novos alunos não poderão assinar este plano. As cobranças e o
              histórico existentes são preservados.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmingArchive(false)}>
              Cancelar
            </Button>
            <Button color="error" onClick={confirmArchive}>
              Arquivar
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </BottomSheet>
  );
}

function planSubtitle(plan: AcademyPlan): string {
  return `${formatBRL(plan.amountCents)} · vence dia ${plan.dueDay}`;
}

export function PlansPage() {
  const toast = useToastState();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AcademyPlan | null>(null);

  const plansQuery = $api.useQuery('get', '/v1/admin/billing/plans');
  const plans = plansQuery.data?.plans ?? [];

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Planos de mensalidade"
          subtitle="O que seus alunos assinam nesta academia."
          trailing={
            <TatameButton
              size="sm"
              label="Novo plano"
              onPress={() => setCreating(true)}
            />
          }
        />

        {plansQuery.isLoading ? (
          <Typography
            sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}
          >
            Carregando planos…
          </Typography>
        ) : null}

        <Card padding={4}>
          {plans.length === 0 && !plansQuery.isLoading ? (
            <EmptyState
              title="Nenhum plano cadastrado"
              description="Crie o primeiro plano para começar a cobrar mensalidades."
            />
          ) : null}
          {plans.map((plan) => (
            <Box key={plan.id} sx={{ opacity: plan.isActive ? 1 : 0.45 }}>
              <ListRow
                title={plan.name}
                subtitle={planSubtitle(plan)}
                trailing={
                  <Stack
                    direction="row"
                    spacing="6px"
                    sx={{ alignItems: 'center' }}
                  >
                    <Chip
                      label={RECURRENCE_LABELS[plan.recurrence]}
                      tone="brand"
                    />
                    {!plan.isActive ? <Chip label="Arquivado" /> : null}
                  </Stack>
                }
                chevron={plan.isActive}
                {...(plan.isActive ? { onPress: () => setEditing(plan) } : {})}
              />
            </Box>
          ))}
        </Card>
      </Stack>

      {creating ? (
        <PlanSheet
          open
          onClose={() => setCreating(false)}
          onSuccess={toast.show}
        />
      ) : null}
      {editing ? (
        <PlanSheet
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          onSuccess={toast.show}
          plan={editing}
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

export default PlansPage;
