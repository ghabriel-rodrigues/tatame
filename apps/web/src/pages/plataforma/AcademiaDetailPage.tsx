/**
 * Academia (detalhe) (PLT.12, plataforma-04) — identity + status, the three
 * stat tiles (alunos, mensalidade/mês, professores), the "Plano da
 * plataforma" picker whose change lands on the NEXT cycle (charter rule,
 * stated on the card and echoed by the pending banner), "Entrar como admin
 * da academia" (owner/support — the audited impersonation grant) and the
 * Suspender/Reativar lever.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate, useParams } from 'react-router';
import {
  Card,
  Chip,
  ScreenHeader,
  TatameButton,
  Toast,
} from '@tatame/design-system';
import type { PlatformPlanRow } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { adoptSession, useAuth } from '../../auth/auth-store';
import { InitialsAvatar, useToastState } from '../admin/common';
import { formatBRLWhole } from '../billing-format';
import {
  ACADEMY_STATUS_LABELS,
  ACADEMY_STATUS_TONES,
  platformErrorMessage,
  sinceLabel,
} from './platform-format';

function StatTile({ value, caption }: { value: string; caption: string }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Card padding={14}>
        <Typography
          sx={{
            fontSize: 17,
            fontWeight: 800,
            color: 'var(--fg-1)',
            textAlign: 'center',
          }}
        >
          {value}
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--fg-3)',
            textAlign: 'center',
          }}
        >
          {caption}
        </Typography>
      </Card>
    </Box>
  );
}

function PlanOption({
  plan,
  current,
  pending,
  disabled,
  onPick,
}: {
  plan: PlatformPlanRow;
  current: boolean;
  pending: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const highlighted = current || pending;
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      aria-pressed={highlighted}
      onClick={onPick}
      sx={{
        flex: 1,
        minWidth: 0,
        padding: '10px 8px',
        borderRadius: '14px',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        background: highlighted ? 'var(--brand-tint)' : 'var(--bg-surface)',
        border: `1px solid ${highlighted ? 'var(--brand-2)' : 'var(--border-1)'}`,
      }}
    >
      <Typography
        sx={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-1)' }}
      >
        {plan.name}
      </Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-3)' }}>
        {formatBRLWhole(plan.priceCents)}/mês
      </Typography>
    </Box>
  );
}

export function AcademiaDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToastState();
  const { session } = useAuth();
  const role = session?.activeRole;
  const isOwner = role === 'owner';
  const canImpersonate = role === 'owner' || role === 'support';
  const [apiError, setApiError] = useState<string | null>(null);

  const detail = $api.useQuery('get', '/v1/platform/academies/{id}', {
    params: { path: { id } },
  });
  const catalog = $api.useQuery('get', '/v1/platform/plans');
  const plans = (catalog.data?.plans ?? []).filter((plan) => plan.isActive);

  const changePlan = $api.useMutation(
    'put',
    '/v1/platform/academies/{id}/plan',
  );
  const suspend = $api.useMutation(
    'post',
    '/v1/platform/academies/{id}/suspend',
  );
  const reactivate = $api.useMutation(
    'post',
    '/v1/platform/academies/{id}/reactivate',
  );
  const impersonate = $api.useMutation(
    'post',
    '/v1/platform/academies/{id}/impersonate',
  );
  const busy =
    changePlan.isPending ||
    suspend.isPending ||
    reactivate.isPending ||
    impersonate.isPending;

  const academy = detail.data;
  const suspended = academy?.status === 'suspended';

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: ['get', '/v1/platform/academies'],
    });
    await queryClient.invalidateQueries({
      queryKey: ['get', '/v1/platform/overview'],
    });
    await detail.refetch();
  }

  function pickPlan(planId: string) {
    setApiError(null);
    changePlan.mutate(
      { params: { path: { id } }, body: { platformPlanId: planId } },
      {
        onSuccess: async (updated) => {
          await refresh();
          toast.show(
            updated.pendingPlan
              ? `Plano ${updated.pendingPlan.name} agendado para o próximo ciclo.`
              : 'Mudança de plano cancelada.',
          );
        },
        onError: (error: unknown) => setApiError(platformErrorMessage(error)),
      },
    );
  }

  function cancelPending() {
    setApiError(null);
    changePlan.mutate(
      { params: { path: { id } }, body: { platformPlanId: null } },
      {
        onSuccess: async () => {
          await refresh();
          toast.show('Mudança de plano cancelada.');
        },
        onError: (error: unknown) => setApiError(platformErrorMessage(error)),
      },
    );
  }

  function toggleSuspension() {
    setApiError(null);
    const mutation = suspended ? reactivate : suspend;
    mutation.mutate(
      { params: { path: { id } } },
      {
        onSuccess: async () => {
          await refresh();
          toast.show(
            suspended
              ? 'Academia reativada.'
              : 'Academia suspensa — acesso bloqueado.',
          );
        },
        onError: (error: unknown) => setApiError(platformErrorMessage(error)),
      },
    );
  }

  function enterAsAdmin() {
    setApiError(null);
    impersonate.mutate(
      { params: { path: { id } } },
      {
        onSuccess: async (grant) => {
          // The grant is a full session: adopting it clears the cache and
          // re-bootstraps as the academy admin (the shell then shows the
          // non-dismissible impersonation banner).
          await adoptSession(grant.accessToken);
          navigate('/admin', { replace: true });
        },
        onError: (error: unknown) => setApiError(platformErrorMessage(error)),
      },
    );
  }

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title={academy?.name ?? 'Academia'}
          onBack={() => navigate('/plataforma/academias')}
        />

        {detail.isLoading ? (
          <Typography
            sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}
          >
            Carregando academia…
          </Typography>
        ) : null}
        {detail.isError ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            Não foi possível carregar esta academia.
          </Typography>
        ) : null}

        {academy ? (
          <>
            <Stack direction="row" spacing="12px" sx={{ alignItems: 'center' }}>
              <InitialsAvatar name={academy.name} />
              <Box>
                <Typography
                  sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-3)' }}
                >
                  {academy.city ?? '—'} · {sinceLabel(academy.createdAt)}
                </Typography>
                <Box sx={{ marginTop: '4px' }}>
                  <Chip
                    label={ACADEMY_STATUS_LABELS[academy.status]}
                    tone={ACADEMY_STATUS_TONES[academy.status]}
                  />
                </Box>
              </Box>
            </Stack>

            <Stack direction="row" spacing="12px">
              <StatTile value={String(academy.studentCount)} caption="alunos" />
              <StatTile
                value={
                  academy.planPriceCents === null
                    ? '—'
                    : formatBRLWhole(academy.planPriceCents)
                }
                caption="assinatura/mês"
              />
              <StatTile
                value={String(academy.professorCount)}
                caption="professores"
              />
            </Stack>

            <Card padding={16}>
              <Typography
                sx={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg-1)' }}
              >
                Plano da plataforma
              </Typography>
              <Typography
                sx={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: 'var(--fg-3)',
                  marginBottom: '10px',
                }}
              >
                A mudança vale a partir do próximo ciclo.
              </Typography>
              <Stack direction="row" spacing="8px">
                {plans.map((plan) => (
                  <PlanOption
                    key={plan.id}
                    plan={plan}
                    current={plan.name === academy.planName}
                    pending={plan.id === academy.pendingPlan?.id}
                    disabled={!isOwner || busy}
                    onPick={() => pickPlan(plan.id)}
                  />
                ))}
              </Stack>
              {academy.pendingPlan ? (
                <Stack
                  direction="row"
                  spacing="10px"
                  sx={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                  }}
                >
                  <Typography
                    sx={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-2)' }}
                  >
                    Muda para {academy.pendingPlan.name} no próximo ciclo.
                  </Typography>
                  {isOwner ? (
                    <TatameButton
                      variant="ghost"
                      size="sm"
                      label="Cancelar"
                      disabled={busy}
                      onPress={cancelPending}
                    />
                  ) : null}
                </Stack>
              ) : null}
            </Card>

            {apiError ? (
              <FormHelperText error>{apiError}</FormHelperText>
            ) : null}

            {canImpersonate ? (
              <TatameButton
                label="Entrar como admin da academia"
                fullWidth
                disabled={busy || suspended}
                loading={impersonate.isPending}
                onPress={enterAsAdmin}
              />
            ) : null}
            {isOwner ? (
              <TatameButton
                variant="danger"
                fullWidth
                disabled={busy}
                label={suspended ? 'Reativar academia' : 'Suspender academia'}
                onPress={toggleSuspension}
              />
            ) : null}
          </>
        ) : null}
      </Stack>

      <Toast
        open={toast.message !== null}
        message={toast.message ?? ''}
        onClose={toast.clear}
      />
    </Box>
  );
}

export default AcademiaDetailPage;
