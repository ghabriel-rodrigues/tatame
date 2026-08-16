/**
 * Planos (PLT.13, plataforma-05/06/07) — the SaaS catalog as it is sold:
 * one card per plan with price, student limit, subscriber count and feature
 * chips, the "Mais assinado" badge and the "Tudo do X" inheritance chip.
 * Both badges are **derived server-side** from live subscriptions and
 * feature containment — this screen never computes them.
 *
 * The create/edit sheet's toggle rows come from the API's feature registry,
 * so the catalog form has no client-side list that can drift. Writes are
 * owner-only; other platform roles get the read-only cards.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import {
  BottomSheet,
  Card,
  Chip,
  FormField,
  ScreenHeader,
  TatameButton,
  Toast,
} from '@tatame/design-system';
import type { PlanFeature, PlatformPlanRow } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { useAuth } from '../../auth/auth-store';
import { useToastState } from '../admin/common';
import { centsToInput, formatBRLWhole, parseBRLInput } from '../billing-format';
import { academyCountLabel, platformErrorMessage, studentLimitLabel } from './platform-format';

/** plataforma-06 limit chips; `null` = unlimited. */
const LIMIT_CHIPS: Array<{ label: string; value: number | null }> = [
  { label: 'Até 80', value: 80 },
  { label: 'Até 150', value: 150 },
  { label: 'Até 250', value: 250 },
  { label: 'Até 500', value: 500 },
  { label: 'Ilimitado', value: null },
];

interface PlanSheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  registry: PlanFeature[];
  /** Absent = create mode ("Novo plano da plataforma"). */
  plan?: PlatformPlanRow;
  /** Edit mode needs the plan's FULL feature set, not the card's shown subset. */
  fullFeatures?: string[];
}

function PlanSheet({ open, onClose, onSuccess, registry, plan, fullFeatures }: PlanSheetProps) {
  const editing = plan !== undefined;
  const [name, setName] = useState(plan?.name ?? '');
  const [priceText, setPriceText] = useState(plan ? centsToInput(plan.priceCents) : '');
  const [limit, setLimit] = useState<number | null>(plan ? plan.studentLimit : 250);
  const [features, setFeatures] = useState<string[]>(fullFeatures ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const create = $api.useMutation('post', '/v1/platform/plans');
  const update = $api.useMutation('put', '/v1/platform/plans/{id}');

  function toggleFeature(slug: string) {
    setFeatures((current) =>
      current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug],
    );
  }

  function submit() {
    const next: Record<string, string> = {};
    const priceCents = parseBRLInput(priceText);
    if (name.trim().length < 2) next['name'] = 'Informe o nome do plano.';
    if (priceCents === null) next['price'] = 'Informe um valor válido, ex.: 199,00.';
    setErrors(next);
    if (Object.keys(next).length > 0 || priceCents === null) return;

    const body = { name: name.trim(), priceCents, studentLimit: limit, features };
    const options = {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ['get', '/v1/platform/plans'] });
        setDone(true);
      },
      onError: (error: unknown) => setApiError(platformErrorMessage(error)),
    };
    if (editing) {
      update.mutate({ params: { path: { id: plan.id } }, body }, options);
    } else {
      create.mutate({ body }, options);
    }
  }

  if (done) {
    const message = editing ? 'Plano atualizado.' : 'Plano criado.';
    const finish = () => {
      onSuccess(message);
      onClose();
    };
    return (
      <BottomSheet
        open={open}
        onClose={finish}
        title={editing ? 'Plano atualizado' : 'Plano criado'}
        subtitle={
          editing
            ? 'As academias já assinantes recebem o novo preço no próximo ciclo.'
            : 'O plano já aparece para novas assinaturas de academias.'
        }
      >
        <TatameButton label="Concluir" fullWidth onPress={finish} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? 'Editar plano da plataforma' : 'Novo plano da plataforma'}
      subtitle={
        editing
          ? 'Mudanças valem no próximo ciclo das assinantes'
          : 'Fica disponível para novas assinaturas de academias'
      }
    >
      <Stack spacing="14px">
        <FormField
          label="Nome do plano"
          value={name}
          onChangeText={setName}
          error={errors['name']}
          required
        />
        <FormField
          label="Preço mensal (R$)"
          value={priceText}
          onChangeText={setPriceText}
          placeholder="199,00"
          error={errors['price']}
          required
        />

        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>Limite de alunos</FormLabel>
          <Stack direction="row" spacing="8px" sx={{ flexWrap: 'wrap', rowGap: '8px' }}>
            {LIMIT_CHIPS.map((chip) => (
              <Chip
                key={chip.label}
                label={chip.label}
                size="md"
                tone="brand"
                selected={limit === chip.value}
                onPress={() => setLimit(chip.value)}
              />
            ))}
          </Stack>
        </Stack>

        <Stack spacing="2px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>Recursos</FormLabel>
          {registry.map((feature) => (
            <Stack
              key={feature.slug}
              direction="row"
              sx={{
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
              }}
            >
              <Typography sx={{ fontSize: 13, color: 'var(--fg-2)' }}>{feature.label}</Typography>
              <Switch
                size="small"
                checked={features.includes(feature.slug)}
                onChange={() => toggleFeature(feature.slug)}
                slotProps={{ input: { 'aria-label': feature.label } }}
              />
            </Stack>
          ))}
        </Stack>

        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton
          label={editing ? 'Salvar alterações' : 'Criar plano'}
          fullWidth
          loading={create.isPending || update.isPending}
          onPress={submit}
        />
      </Stack>
    </BottomSheet>
  );
}

function PlanCard({
  plan,
  canEdit,
  onEdit,
}: {
  plan: PlatformPlanRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <Box sx={{ position: 'relative' }}>
      {plan.isMostSubscribed ? (
        <Box
          component="span"
          sx={{
            position: 'absolute',
            top: -9,
            right: 14,
            zIndex: 1,
            padding: '4px 10px',
            borderRadius: '999px',
            background: 'linear-gradient(135deg, var(--brand-1), var(--brand-2))',
            color: 'var(--white, #FFFFFF)',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          Mais assinado
        </Box>
      ) : null}
      <Card
        padding={16}
        {...(plan.isMostSubscribed ? { sx: { border: '1px solid var(--brand-2)' } } : {})}
      >
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 17, fontWeight: 700, color: 'var(--fg-1)' }}>
            {plan.name}
          </Typography>
          <Typography sx={{ fontSize: 17, fontWeight: 800, color: 'var(--fg-1)' }}>
            {formatBRLWhole(plan.priceCents)}
            <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-3)' }}>
              /mês
            </Box>
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fg-3)' }}>
          {studentLimitLabel(plan.studentLimit)} · {academyCountLabel(plan.academyCount)}
        </Typography>

        <Stack
          direction="row"
          spacing="6px"
          sx={{ flexWrap: 'wrap', rowGap: '6px', marginTop: '10px' }}
        >
          {plan.inheritsFrom ? (
            <Chip label={`Tudo do ${plan.inheritsFrom}`} tone="brand" />
          ) : null}
          {plan.features.map((feature) => (
            <Chip key={feature.slug} label={feature.label} />
          ))}
        </Stack>

        {canEdit ? (
          <Box sx={{ marginTop: '12px' }}>
            <TatameButton variant="secondary" size="sm" label="Editar plano" onPress={onEdit} />
          </Box>
        ) : null}
      </Card>
    </Box>
  );
}

export function PlanosPage() {
  const toast = useToastState();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlatformPlanRow | null>(null);
  const { session } = useAuth();
  const isOwner = session?.activeRole === 'owner';

  const query = $api.useQuery('get', '/v1/platform/plans');
  const plans = query.data?.plans ?? [];
  const registry = query.data?.featureRegistry ?? [];

  /**
   * A card shows only what its plan ADDS over the cheaper one, so editing
   * must start from the full set: the shown chips plus everything the plan
   * it inherits from carries.
   */
  function fullFeaturesOf(plan: PlatformPlanRow): string[] {
    const own = plan.features.map((feature) => feature.slug);
    if (!plan.inheritsFrom) return own;
    const parent = plans.find((candidate) => candidate.name === plan.inheritsFrom);
    return parent ? [...new Set([...fullFeaturesOf(parent), ...own])] : own;
  }

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Planos"
          subtitle="O que as academias assinam para usar a plataforma."
          {...(isOwner
            ? {
                trailing: (
                  <TatameButton size="sm" label="Novo plano" onPress={() => setCreating(true)} />
                ),
              }
            : {})}
        />

        {query.isLoading ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}>
            Carregando planos…
          </Typography>
        ) : null}
        {query.isError ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            Não foi possível carregar os planos. Tente novamente.
          </Typography>
        ) : null}

        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            canEdit={isOwner}
            onEdit={() => setEditing(plan)}
          />
        ))}
      </Stack>

      {creating ? (
        <PlanSheet
          open
          registry={registry}
          onClose={() => setCreating(false)}
          onSuccess={toast.show}
        />
      ) : null}
      {editing ? (
        <PlanSheet
          key={editing.id}
          open
          registry={registry}
          plan={editing}
          fullFeatures={fullFeaturesOf(editing)}
          onClose={() => setEditing(null)}
          onSuccess={toast.show}
        />
      ) : null}

      <Toast open={toast.message !== null} message={toast.message ?? ''} onClose={toast.clear} />
    </Box>
  );
}

export default PlanosPage;
