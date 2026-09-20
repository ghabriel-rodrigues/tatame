/**
 * Academias (PLT.11, plataforma-03 + plataforma-08) — the customer base as
 * one list, plus the "Registrar academia" sheet that is the product's first
 * real onboarding path: it creates the academy on Trial, its subscription
 * and its admin's membership, and emails that admin a set-password link.
 *
 * The register action is owner-only (the API refuses everyone else), so the
 * button is hidden for support and finance rather than failing on submit.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
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
import type { PlatformAcademyRow } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { useAuth } from '../../auth/auth-store';
import { InitialsAvatar, useToastState } from '../admin/common';
import { formatBRLWhole } from '../billing-format';
import {
  ACADEMY_STATUS_LABELS,
  ACADEMY_STATUS_TONES,
  academySubtitle,
  platformErrorMessage,
} from './platform-format';

interface RegisterSheetProps {
  open: boolean;
  onClose: () => void;
  onRegistered: (message: string) => void;
}

function RegisterAcademySheet({
  open,
  onClose,
  onRegistered,
}: RegisterSheetProps) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const catalog = $api.useQuery('get', '/v1/platform/plans');
  const plans = (catalog.data?.plans ?? []).filter((plan) => plan.isActive);
  const register = $api.useMutation('post', '/v1/platform/academies');
  const selectedPlan =
    planId ?? plans[Math.min(1, plans.length - 1)]?.id ?? null;

  function submit() {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next['name'] = 'Informe o nome da academia.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail.trim())) {
      next['adminEmail'] = 'Informe um email válido.';
    }
    if (!selectedPlan) next['plan'] = 'Selecione um plano.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !selectedPlan) return;

    register.mutate(
      {
        body: {
          name: name.trim(),
          city: city.trim() === '' ? null : city.trim(),
          adminEmail: adminEmail.trim(),
          platformPlanId: selectedPlan,
        },
      },
      {
        onSuccess: async (response) => {
          await queryClient.invalidateQueries({
            queryKey: ['get', '/v1/platform/academies'],
          });
          await queryClient.invalidateQueries({
            queryKey: ['get', '/v1/platform/overview'],
          });
          setDone(response.academy.name);
        },
        onError: (error: unknown) => setApiError(platformErrorMessage(error)),
      },
    );
  }

  if (done) {
    return (
      <BottomSheet
        open={open}
        onClose={() => {
          onRegistered(`${done} registrada — o admin foi convidado.`);
          onClose();
        }}
        title="Academia registrada"
        subtitle="O admin recebeu o convite por email e já pode configurar a identidade visual."
      >
        <Stack spacing="14px">
          <Typography sx={{ fontSize: 13.5, color: 'var(--fg-2)' }}>
            {done} entra como <strong>Trial</strong>. A cobrança começa quando o
            trial terminar.
          </Typography>
          <TatameButton
            label="Concluir"
            fullWidth
            onPress={() => {
              onRegistered(`${done} registrada — o admin foi convidado.`);
              onClose();
            }}
          />
        </Stack>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Registrar academia"
      subtitle="Escola, academia, time ou equipe de Jiu-Jitsu."
    >
      <Stack spacing="14px">
        <FormField
          label="Nome da academia"
          value={name}
          onChangeText={setName}
          error={errors['name']}
          required
        />
        <FormField
          label="Cidade / UF"
          value={city}
          onChangeText={setCity}
          placeholder="São Paulo / SP"
        />
        <FormField
          label="Email do administrador"
          type="email"
          value={adminEmail}
          onChangeText={setAdminEmail}
          error={errors['adminEmail']}
          required
        />

        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>Plano</FormLabel>
          <Stack
            direction="row"
            spacing="8px"
            sx={{ flexWrap: 'wrap', rowGap: '8px' }}
          >
            {plans.map((plan) => (
              <Chip
                key={plan.id}
                label={`${plan.name} · ${formatBRLWhole(plan.priceCents)}/mês`}
                size="md"
                tone="brand"
                selected={selectedPlan === plan.id}
                onPress={() => setPlanId(plan.id)}
              />
            ))}
          </Stack>
          {errors['plan'] ? (
            <FormHelperText error>{errors['plan']}</FormHelperText>
          ) : null}
        </Stack>

        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton
          label="Registrar e convidar admin"
          fullWidth
          loading={register.isPending}
          onPress={submit}
        />
      </Stack>
    </BottomSheet>
  );
}

function AcademyRow({ academy }: { academy: PlatformAcademyRow }) {
  const navigate = useNavigate();
  return (
    <ListRow
      title={academy.name}
      subtitle={academySubtitle(academy)}
      leading={<InitialsAvatar name={academy.name} />}
      trailing={
        <Chip
          label={ACADEMY_STATUS_LABELS[academy.status]}
          tone={ACADEMY_STATUS_TONES[academy.status]}
        />
      }
      chevron
      onPress={() => navigate(`/plataforma/academias/${academy.id}`)}
    />
  );
}

export function AcademiasPage() {
  const toast = useToastState();
  const [registering, setRegistering] = useState(false);
  const { session } = useAuth();
  const isOwner = session?.activeRole === 'owner';

  const query = $api.useQuery('get', '/v1/platform/academies');
  const academies = query.data?.academies ?? [];

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Academias"
          subtitle={`${query.data?.total ?? 0} escolas, academias e equipes na plataforma.`}
          {...(isOwner
            ? {
                trailing: (
                  <TatameButton
                    size="sm"
                    label="Registrar academia"
                    onPress={() => setRegistering(true)}
                  />
                ),
              }
            : {})}
        />

        {query.isLoading ? (
          <Typography
            sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}
          >
            Carregando academias…
          </Typography>
        ) : null}
        {query.isError ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            Não foi possível carregar as academias. Tente novamente.
          </Typography>
        ) : null}

        <Card padding={4}>
          {academies.length === 0 && !query.isLoading ? (
            <EmptyState
              title="Nenhuma academia na plataforma"
              description="Registre a primeira academia para começar."
            />
          ) : null}
          {academies.map((academy) => (
            <AcademyRow key={academy.id} academy={academy} />
          ))}
        </Card>
      </Stack>

      {registering ? (
        <RegisterAcademySheet
          open
          onClose={() => setRegistering(false)}
          onRegistered={toast.show}
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

export default AcademiasPage;
