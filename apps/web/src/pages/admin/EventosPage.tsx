/**
 * Eventos (EVT.9, admin-13): the academy program as gradient-preset banner
 * cards — valor chip (Gratuito / R$ N), "Sáb, 15 de agosto · 10:00" line,
 * "N inscritos · Prof. X" subtitle, Comunicar per published event — plus the
 * Novo evento sheet (valor vazio = gratuito, banner preset picker, salvar
 * rascunho vs publicar), edit/publish (422 requirements mapped PT-BR),
 * cancel with charge-cancellation warning (never hard-delete) and the
 * inscritos view with confirmados/inscritos/arrecadado totals.
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
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
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
import { $api, queryClient } from '../../api/api';
import { useToastState } from './common';
import { centsToInput, formatBRL, parseBRLInput } from '../billing-format';
import {
  DEFAULT_EVENT_BANNER,
  EVENT_BANNER_PRESETS,
  eventBannerCss,
  eventDateLabel,
  eventErrorMessage,
  inscritosLine,
  valorChipLabel,
  type AdminEvent,
} from './events-format';

async function invalidateEvents() {
  await queryClient.invalidateQueries({
    queryKey: ['get', '/v1/admin/events'],
  });
  await queryClient.invalidateQueries({
    queryKey: ['get', '/v1/admin/calendar'],
  });
}

interface EventSheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  /** Absent = create mode ("Novo evento"). */
  event?: AdminEvent;
}

function EventSheet({ open, onClose, onSuccess, event }: EventSheetProps) {
  const editing = event !== undefined;
  const [name, setName] = useState(event?.name ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [date, setDate] = useState(event?.date ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [valorText, setValorText] = useState(
    event?.priceCents != null ? centsToInput(event.priceCents) : '',
  );
  const [bannerPreset, setBannerPreset] = useState(
    event?.bannerPreset ?? DEFAULT_EVENT_BANNER,
  );
  const [responsibleUserId, setResponsibleUserId] = useState(
    event?.responsible.userId ?? '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const professors = $api.useQuery('get', '/v1/admin/professors');
  const create = $api.useMutation('post', '/v1/admin/events');
  const update = $api.useMutation('patch', '/v1/admin/events/{id}');
  const publish = $api.useMutation('post', '/v1/admin/events/{id}/publish');
  const cancel = $api.useMutation('post', '/v1/admin/events/{id}/cancel');
  const busy =
    create.isPending ||
    update.isPending ||
    publish.isPending ||
    cancel.isPending;

  /** Validated form payload; null when a field error blocks the submit. */
  function buildBody() {
    const next: Record<string, string> = {};
    const trimmedValor = valorText.trim();
    const priceCents = trimmedValor === '' ? null : parseBRLInput(trimmedValor);
    if (name.trim().length < 2) next['name'] = 'Informe o nome do evento.';
    if (trimmedValor !== '' && priceCents === null) {
      next['valor'] =
        'Informe um valor válido, ex.: 120,00 — ou deixe vazio (gratuito).';
    }
    if (responsibleUserId === '')
      next['responsible'] = 'Selecione o responsável.';
    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
      bannerPreset,
      location: location.trim() === '' ? null : location.trim(),
      startsAt:
        date !== '' && time !== ''
          ? new Date(`${date}T${time}:00`).toISOString()
          : null,
      priceCents,
      responsibleUserId,
    };
  }

  function mutationOptions(message: string) {
    return {
      onSuccess: async () => {
        await invalidateEvents();
        onSuccess(message);
        onClose();
      },
      onError: (error: unknown) => setApiError(eventErrorMessage(error)),
    };
  }

  /** Create mode: rascunho and publicar are separate gestures (spec 008). */
  function submitCreate(status: 'draft' | 'published') {
    const body = buildBody();
    if (!body) return;
    create.mutate(
      { body: { ...body, status } },
      mutationOptions(
        status === 'draft' ? 'Rascunho salvo.' : 'Evento publicado.',
      ),
    );
  }

  function submitUpdate() {
    const body = buildBody();
    if (!body || !event) return;
    update.mutate(
      { params: { path: { id: event.id } }, body },
      mutationOptions('Evento atualizado.'),
    );
  }

  function submitPublish() {
    if (!event) return;
    publish.mutate(
      { params: { path: { id: event.id } } },
      mutationOptions('Evento publicado.'),
    );
  }

  function confirmCancel() {
    if (!event) return;
    setConfirmingCancel(false);
    cancel.mutate(
      { params: { path: { id: event.id } } },
      mutationOptions('Evento cancelado.'),
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? 'Editar evento' : 'Novo evento'}
      subtitle="Valor vazio = gratuito."
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
          label="Descrição"
          value={description}
          onChangeText={setDescription}
        />
        <FormField
          label="Local"
          value={location}
          onChangeText={setLocation}
          placeholder="Tatame principal"
        />
        <Stack direction="row" spacing="10px">
          <FormField
            label="Data"
            type="date"
            value={date}
            onChangeText={setDate}
          />
          <FormField
            label="Hora"
            type="time"
            value={time}
            onChangeText={setTime}
          />
        </Stack>
        <FormField
          label="Valor (R$)"
          value={valorText}
          onChangeText={setValorText}
          placeholder="Vazio = gratuito"
          error={errors['valor']}
          helperText="Deixe vazio para evento gratuito."
        />

        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>Banner</FormLabel>
          <Stack
            direction="row"
            spacing="8px"
            sx={{ flexWrap: 'wrap', rowGap: '8px' }}
          >
            {EVENT_BANNER_PRESETS.map((preset) => (
              <Box
                key={preset.slug}
                component="button"
                type="button"
                aria-label={`Banner ${preset.label}`}
                aria-pressed={bannerPreset === preset.slug}
                onClick={() => setBannerPreset(preset.slug)}
                sx={{
                  border:
                    bannerPreset === preset.slug
                      ? '2px solid var(--purple-500)'
                      : '2px solid var(--border-1)',
                  borderRadius: '12px',
                  padding: '4px',
                  background: 'var(--bg-surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: '56px',
                    height: '26px',
                    borderRadius: '8px',
                    background: preset.css,
                  }}
                />
                <Typography
                  component="span"
                  sx={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-3)' }}
                >
                  {preset.label}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Stack>

        <Stack spacing="6px">
          <FormLabel
            id="event-responsible-label"
            htmlFor="event-responsible"
            sx={{ fontSize: 13, fontWeight: 600 }}
          >
            Responsável
          </FormLabel>
          <Select
            id="event-responsible"
            labelId="event-responsible-label"
            size="small"
            displayEmpty
            value={responsibleUserId}
            inputProps={{ 'aria-label': 'Responsável' }}
            onChange={(event_) => setResponsibleUserId(event_.target.value)}
            error={Boolean(errors['responsible'])}
          >
            <MenuItem value="">Selecione o professor</MenuItem>
            {(professors.data?.professors ?? []).map((professor) => (
              <MenuItem key={professor.userId} value={professor.userId}>
                {professor.fullName}
              </MenuItem>
            ))}
          </Select>
          {errors['responsible'] ? (
            <FormHelperText error>{errors['responsible']}</FormHelperText>
          ) : null}
        </Stack>

        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}

        {editing ? (
          <>
            <TatameButton
              label="Salvar evento"
              fullWidth
              loading={update.isPending}
              disabled={busy && !update.isPending}
              onPress={submitUpdate}
            />
            {event.status === 'draft' ? (
              <TatameButton
                variant="secondary"
                label="Publicar evento"
                fullWidth
                loading={publish.isPending}
                disabled={busy && !publish.isPending}
                onPress={submitPublish}
              />
            ) : null}
            <TatameButton
              variant="danger"
              label="Cancelar evento"
              fullWidth
              disabled={busy}
              onPress={() => setConfirmingCancel(true)}
            />
          </>
        ) : (
          <>
            <TatameButton
              label="Publicar evento"
              fullWidth
              loading={create.isPending}
              onPress={() => submitCreate('published')}
            />
            <TatameButton
              variant="secondary"
              label="Salvar rascunho"
              fullWidth
              disabled={create.isPending}
              onPress={() => submitCreate('draft')}
            />
          </>
        )}
      </Stack>

      {editing ? (
        <Dialog
          open={confirmingCancel}
          onClose={() => setConfirmingCancel(false)}
        >
          <DialogTitle>Cancelar evento</DialogTitle>
          <DialogContent>
            <DialogContentText>
              As cobranças em aberto deste evento serão canceladas
              automaticamente — ninguém é cobrado por um evento cancelado. As
              inscrições confirmadas são preservadas no histórico.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmingCancel(false)}>Voltar</Button>
            <Button color="error" onClick={confirmCancel}>
              Cancelar evento
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </BottomSheet>
  );
}

const REGISTRATION_STATUS_CHIP: Record<
  'pending_payment' | 'confirmed' | 'canceled',
  { label: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  confirmed: { label: 'Confirmado', tone: 'success' },
  pending_payment: { label: 'Pagamento pendente', tone: 'warning' },
  canceled: { label: 'Cancelado', tone: 'neutral' },
};

function TotalTile({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        flex: 1,
        background: 'var(--bg-app)',
        borderRadius: '14px',
        padding: '10px 12px',
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'var(--fg-1)' }}>
        {value}
      </Typography>
      <Typography
        sx={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-3)' }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function InscritosSheet({
  event,
  onClose,
}: {
  event: AdminEvent;
  onClose: () => void;
}) {
  const registrations = $api.useQuery(
    'get',
    '/v1/admin/events/{id}/registrations',
    {
      params: { path: { id: event.id } },
    },
  );
  const data = registrations.data;

  return (
    <BottomSheet open onClose={onClose} title="Inscritos" subtitle={event.name}>
      {registrations.isLoading ? (
        <Typography
          sx={{ fontSize: 13, color: 'var(--fg-3)', textAlign: 'center' }}
        >
          Carregando inscritos…
        </Typography>
      ) : null}
      {data ? (
        <Stack spacing="14px">
          <Stack direction="row" spacing="8px">
            <TotalTile
              label="Inscritos"
              value={String(data.totals.inscritos)}
            />
            <TotalTile
              label="Confirmados"
              value={String(data.totals.confirmados)}
            />
            <TotalTile
              label="Arrecadado"
              value={formatBRL(data.totals.arrecadadoCents)}
            />
          </Stack>
          {data.registrations.length === 0 ? (
            <EmptyState
              title="Nenhum inscrito ainda"
              description="As inscrições aparecem aqui assim que os alunos confirmarem."
            />
          ) : (
            <Card padding={4}>
              {data.registrations.map((row) => {
                const chip = REGISTRATION_STATUS_CHIP[row.status];
                return (
                  <ListRow
                    key={row.id}
                    title={row.student.fullName}
                    subtitle={`por ${row.confirmedBy.fullName}${
                      row.paidAmountCents != null
                        ? ` · ${formatBRL(row.paidAmountCents)}`
                        : ''
                    }`}
                    trailing={<Chip label={chip.label} tone={chip.tone} />}
                  />
                );
              })}
            </Card>
          )}
        </Stack>
      ) : null}
    </BottomSheet>
  );
}

/** The admin-13 outlined pill action ("Comunicar") — purple-200 border. */
function PillButton({
  label,
  ariaLabel,
  onPress,
  disabled = false,
}: {
  label: string;
  ariaLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel}
      onClick={onPress}
      disabled={disabled}
      sx={{
        flex: 'none',
        padding: '8px 12px',
        border: '1.5px solid var(--purple-200)',
        borderRadius: '999px',
        background: 'none',
        color: 'var(--purple-ink)',
        fontFamily: 'inherit',
        fontWeight: 700,
        fontSize: 11,
        cursor: 'pointer',
        '&:disabled': { opacity: 0.5, cursor: 'default' },
      }}
    >
      {label}
    </Box>
  );
}

function EventCard({
  event,
  onEdit,
  onInscritos,
  onComunicar,
  announcing,
}: {
  event: AdminEvent;
  onEdit: () => void;
  onInscritos: () => void;
  onComunicar: () => void;
  announcing: boolean;
}) {
  const canceled = event.status === 'canceled';
  const banner = (
    <>
      <Stack
        direction="row"
        spacing="6px"
        sx={{ position: 'absolute', top: 10, right: 12 }}
      >
        {event.status === 'draft' ? (
          <Chip label="Rascunho" tone="warning" />
        ) : null}
        {canceled ? <Chip label="Cancelado" tone="danger" /> : null}
        <Box
          component="span"
          sx={{
            padding: '4px 10px',
            borderRadius: '999px',
            background: 'var(--bg-surface)',
            color: 'var(--purple-800)',
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          {valorChipLabel(event.priceCents)}
        </Box>
      </Stack>
      <Typography
        component="span"
        sx={{
          position: 'absolute',
          left: 16,
          bottom: 10,
          color: 'var(--white, #FFFFFF)',
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: '-0.01em',
        }}
      >
        {event.name}
      </Typography>
    </>
  );
  const bannerSx = {
    display: 'block',
    width: '100%',
    height: '74px',
    border: 0,
    padding: 0,
    position: 'relative',
    textAlign: 'left',
  } as const;
  // Inline style so the preset → gradient mapping is observable as rendered.
  const bannerStyle = { background: eventBannerCss(event.bannerPreset) };

  return (
    <Box
      data-testid={`event-card-${event.id}`}
      sx={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-1)',
        borderRadius: '20px',
        overflow: 'hidden',
        opacity: canceled ? 0.55 : 1,
      }}
    >
      {canceled ? (
        // Canceled events are frozen history — the banner is not pressable.
        <Box
          data-testid={`event-banner-${event.id}`}
          sx={bannerSx}
          style={bannerStyle}
        >
          {banner}
        </Box>
      ) : (
        <Box
          component="button"
          type="button"
          aria-label={`Editar ${event.name}`}
          data-testid={`event-banner-${event.id}`}
          onClick={onEdit}
          sx={{ ...bannerSx, cursor: 'pointer', fontFamily: 'inherit' }}
          style={bannerStyle}
        >
          {banner}
        </Box>
      )}
      <Box
        sx={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ fontSize: 12, color: 'var(--fg-2)', fontWeight: 600 }}
          >
            {eventDateLabel(event.date, event.time)}
          </Typography>
          <Typography
            sx={{ fontSize: 11, color: 'var(--fg-3)', marginTop: '2px' }}
          >
            {inscritosLine(event)}
          </Typography>
        </Box>
        <Stack direction="row" spacing="6px" sx={{ flex: 'none' }}>
          <PillButton
            label="Inscritos"
            ariaLabel={`Inscritos de ${event.name}`}
            onPress={onInscritos}
          />
          {event.status === 'published' ? (
            <PillButton
              label="Comunicar"
              ariaLabel={`Comunicar ${event.name}`}
              disabled={announcing}
              onPress={onComunicar}
            />
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}

export function EventosPage() {
  const toast = useToastState();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminEvent | null>(null);
  const [viewing, setViewing] = useState<AdminEvent | null>(null);

  const [announcingId, setAnnouncingId] = useState<string | null>(null);

  const eventsQuery = $api.useQuery('get', '/v1/admin/events');
  const announce = $api.useMutation('post', '/v1/admin/events/{id}/announce');
  const events = eventsQuery.data?.events ?? [];

  function comunicar(event: AdminEvent) {
    setAnnouncingId(event.id);
    announce.mutate(
      { params: { path: { id: event.id } } },
      {
        onSuccess: () => toast.show('Comunicado enviado aos inscritos.'),
        onError: (error: unknown) => toast.show(eventErrorMessage(error)),
        onSettled: () => setAnnouncingId(null),
      },
    );
  }

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Eventos"
          subtitle="Crie eventos gratuitos ou pagos para a academia."
          trailing={
            <TatameButton
              size="sm"
              label="Novo evento"
              onPress={() => setCreating(true)}
            />
          }
        />

        {eventsQuery.isLoading ? (
          <Typography
            sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}
          >
            Carregando eventos…
          </Typography>
        ) : null}

        {events.length === 0 && !eventsQuery.isLoading ? (
          <Card padding={4}>
            <EmptyState
              title="Nenhum evento ainda"
              description="Crie o primeiro evento — gratuito ou pago — pelo botão acima."
            />
          </Card>
        ) : null}

        <Stack spacing="12px">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onEdit={() => setEditing(event)}
              onInscritos={() => setViewing(event)}
              onComunicar={() => comunicar(event)}
              announcing={announcingId === event.id}
            />
          ))}
        </Stack>
      </Stack>

      {creating ? (
        <EventSheet
          open
          onClose={() => setCreating(false)}
          onSuccess={toast.show}
        />
      ) : null}
      {editing ? (
        <EventSheet
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          onSuccess={toast.show}
          event={editing}
        />
      ) : null}
      {viewing ? (
        <InscritosSheet event={viewing} onClose={() => setViewing(null)} />
      ) : null}

      <Toast
        open={toast.message !== null}
        message={toast.message ?? ''}
        onClose={toast.clear}
      />
    </Box>
  );
}

export default EventosPage;
