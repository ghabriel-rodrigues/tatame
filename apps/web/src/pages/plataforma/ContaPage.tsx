/**
 * Conta / Equipe / Integrações (PLT.14, plataforma-12/10/11). The Conta hub
 * carries the member's own identity and the entry rows to the areas that are
 * not daily work; Equipe is the roster with the owner-only Convidar; and
 * Integrações renders the payment rails as the read-only stub the handoff
 * calls for — real switches would imply a pause that v1 cannot perform.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import {
  BottomSheet,
  Card,
  Chip,
  FormField,
  ListRow,
  ScreenHeader,
  TatameButton,
  Toast,
} from '@tatame/design-system';
import type { PlatformRoleName } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { logout, useAuth } from '../../auth/auth-store';
import { ROLE_LABELS } from '../../auth/role-labels';
import { InitialsAvatar, useToastState } from '../admin/common';
import { platformErrorMessage } from './platform-format';

const ROLE_TONES: Record<PlatformRoleName, 'brand' | 'neutral' | 'success'> = {
  owner: 'brand',
  support: 'neutral',
  finance: 'success',
};

const INVITE_ROLES: PlatformRoleName[] = ['owner', 'support', 'finance'];

export function ContaPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader title="Conta" subtitle="Equipe, faturamento e integrações da plataforma." />

        <Card padding={16}>
          <Stack direction="row" spacing="12px" sx={{ alignItems: 'center' }}>
            <InitialsAvatar name={session?.user.fullName ?? 'Tatame'} />
            <Box>
              <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg-1)' }}>
                {session?.user.fullName}
              </Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-3)' }}>
                {session?.user.email}
              </Typography>
            </Box>
            <Box sx={{ marginLeft: 'auto' }}>
              {session ? <Chip label={ROLE_LABELS[session.activeRole]} tone="brand" /> : null}
            </Box>
          </Stack>
        </Card>

        <Card padding={4}>
          <ListRow
            title="Equipe da plataforma"
            subtitle="Quem opera o Tatame"
            chevron
            onPress={() => navigate('/plataforma/equipe')}
          />
          <ListRow
            title="Faturamento e repasses"
            subtitle="Assinaturas SaaS e repasses às academias"
            chevron
            onPress={() => navigate('/plataforma/repasses')}
          />
          <ListRow
            title="Integrações"
            subtitle="Pix, boleto e cartão"
            chevron
            onPress={() => navigate('/plataforma/integracoes')}
          />
        </Card>

        <TatameButton
          variant="ghost"
          fullWidth
          label="Sair"
          onPress={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        />
      </Stack>
    </Box>
  );
}

function InviteSheet({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (message: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlatformRoleName>('support');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const invite = $api.useMutation('post', '/v1/platform/team');

  function submit() {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) next['fullName'] = 'Informe o nome.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next['email'] = 'Informe um email válido.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    invite.mutate(
      { body: { fullName: fullName.trim(), email: email.trim(), role } },
      {
        onSuccess: async (response) => {
          await queryClient.invalidateQueries({ queryKey: ['get', '/v1/platform/team'] });
          onInvited(
            `Convite enviado por email com papel ${ROLE_LABELS[response.member.role]}.`,
          );
          onClose();
        },
        onError: (error: unknown) => setApiError(platformErrorMessage(error)),
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Convidar para a equipe"
      subtitle="A pessoa recebe um email para definir a própria senha."
    >
      <Stack spacing="14px">
        <FormField
          label="Nome"
          value={fullName}
          onChangeText={setFullName}
          error={errors['fullName']}
          required
        />
        <FormField
          label="Email"
          type="email"
          value={email}
          onChangeText={setEmail}
          error={errors['email']}
          required
        />
        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>Papel</FormLabel>
          <Stack direction="row" spacing="8px">
            {INVITE_ROLES.map((value) => (
              <Chip
                key={value}
                label={ROLE_LABELS[value]}
                size="md"
                tone="brand"
                selected={role === value}
                onPress={() => setRole(value)}
              />
            ))}
          </Stack>
        </Stack>
        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton
          label="Enviar convite"
          fullWidth
          loading={invite.isPending}
          onPress={submit}
        />
      </Stack>
    </BottomSheet>
  );
}

export function EquipePage() {
  const navigate = useNavigate();
  const toast = useToastState();
  const [inviting, setInviting] = useState(false);
  const { session } = useAuth();
  const isOwner = session?.activeRole === 'owner';

  const query = $api.useQuery('get', '/v1/platform/team');
  const members = query.data?.members ?? [];

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Equipe da plataforma"
          subtitle="Quem opera o Tatame"
          onBack={() => navigate('/plataforma/conta')}
          {...(isOwner
            ? {
                trailing: (
                  <TatameButton size="sm" label="Convidar" onPress={() => setInviting(true)} />
                ),
              }
            : {})}
        />

        {query.isLoading ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}>
            Carregando equipe…
          </Typography>
        ) : null}

        <Card padding={4}>
          {members.map((member) => (
            <ListRow
              key={member.id}
              title={member.fullName}
              subtitle={member.email}
              leading={<InitialsAvatar name={member.fullName} />}
              trailing={
                <Chip label={ROLE_LABELS[member.role]} tone={ROLE_TONES[member.role]} />
              }
            />
          ))}
        </Card>

        <Card variant="tinted">
          <Typography sx={{ fontSize: 12.5, color: 'var(--fg-2)' }}>
            Papéis: <strong>Owner</strong> controla faturamento e planos.{' '}
            <strong>Suporte</strong> pode entrar como admin de academias.{' '}
            <strong>Financeiro</strong> vê repasses.
          </Typography>
        </Card>
      </Stack>

      {inviting ? (
        <InviteSheet open onClose={() => setInviting(false)} onInvited={toast.show} />
      ) : null}

      <Toast open={toast.message !== null} message={toast.message ?? ''} onClose={toast.clear} />
    </Box>
  );
}

export function IntegracoesPage() {
  const navigate = useNavigate();
  const query = $api.useQuery('get', '/v1/platform/integrations');
  const integrations = query.data?.integrations ?? [];

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Integrações"
          subtitle="Meios de pagamento da plataforma"
          onBack={() => navigate('/plataforma/conta')}
        />

        <Card padding={4}>
          {integrations.map((integration) => (
            <ListRow
              key={integration.key}
              title={integration.name}
              subtitle={integration.detail}
              leading={<InitialsAvatar name={integration.initials} />}
              trailing={
                <Switch
                  size="small"
                  checked={integration.enabled}
                  disabled={!integration.configurable}
                  slotProps={{ input: { 'aria-label': integration.name } }}
                />
              }
            />
          ))}
        </Card>

        <Card variant="tinted">
          <Typography sx={{ fontSize: 12.5, color: 'var(--fg-2)' }}>
            Na v1 os meios de pagamento são somente leitura — pausar uma trilha para novas
            cobranças chega em uma próxima entrega.
          </Typography>
        </Card>
      </Stack>
    </Box>
  );
}

export default ContaPage;
