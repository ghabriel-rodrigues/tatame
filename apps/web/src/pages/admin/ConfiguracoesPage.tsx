/**
 * CFG.9 — Configurações hub (admin-15): identidade visual card (monogram
 * tile, academy name edit, the 4 preset palette swatches with LIVE preview —
 * selecting a swatch re-themes the console before saving; Salvar persists,
 * Cancelar/leave reverts), the toggle block (Tema escuro — CFG.10 real,
 * Notificações automáticas — wired to PUT /admin/academy, Check-in por
 * geolocalização — disabled stub) and the entry rows to Permissões/
 * Integrações-stub/Planos/Regras de graduação.
 */
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import {
  Card,
  Chip,
  FormField,
  ListRow,
  ScreenHeader,
  TatameButton,
  Toast,
  PRESET_DISPLAY_NAMES,
  READY_MADE_PALETTES,
  type BrandInput,
  type PresetKey,
} from '@tatame/design-system';
import type { AdminAcademyResponse, BrandTheme } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { patchSessionAcademy } from '../../auth/auth-store';
import { setBrandPreview, setThemeMode, useThemeState } from '../../app/theme-store';
import { useToastState } from './common';
import { initials } from './format';

const PRESET_ORDER: PresetKey[] = ['roxo', 'navy', 'verde', 'preto'];

/** Saved triplet -> preset key; null brand = the default Lumira purple. */
function presetForBrand(brand: BrandTheme | null): PresetKey | null {
  if (!brand) return 'roxo';
  const match = PRESET_ORDER.find((key) => {
    const preset = READY_MADE_PALETTES[key];
    return (
      preset.deep.toUpperCase() === brand.deep.toUpperCase() &&
      preset.vibrant.toUpperCase() === brand.vibrant.toUpperCase() &&
      preset.accent.toUpperCase() === brand.accent.toUpperCase()
    );
  });
  return match ?? null;
}

/** Preset key -> PUT payload brand: Lumira persists as null (null IS the default). */
function brandForPreset(key: PresetKey): BrandInput | null {
  return key === 'roxo' ? null : READY_MADE_PALETTES[key];
}

function PaletteSwatch({
  presetKey,
  selected,
  onSelect,
}: {
  presetKey: PresetKey;
  selected: boolean;
  onSelect: (key: PresetKey) => void;
}) {
  const palette = READY_MADE_PALETTES[presetKey];
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(presetKey)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '10px 12px',
        borderRadius: '14px',
        cursor: 'pointer',
        background: 'var(--bg-surface)',
        border: selected ? '2px solid var(--brand-1)' : '1px solid var(--border-1)',
        fontFamily: 'inherit',
      }}
    >
      <Stack direction="row" spacing="4px" aria-hidden>
        {[palette.deep, palette.vibrant, palette.accent].map((hex, index) => (
          <Box
            key={index}
            component="span"
            sx={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: hex,
              display: 'inline-block',
            }}
          />
        ))}
      </Stack>
      <Typography
        component="span"
        sx={{
          fontSize: 11,
          fontWeight: selected ? 700 : 600,
          color: selected ? 'var(--brand-1)' : 'var(--fg-3)',
        }}
      >
        {PRESET_DISPLAY_NAMES[presetKey]}
      </Typography>
    </Box>
  );
}

function ToggleRow({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        '&:not(:last-of-type)': { borderBottom: '1px solid var(--border-1)' },
      }}
    >
      <Typography sx={{ fontSize: 13.5, fontWeight: 650, color: 'var(--fg-1)' }}>
        {label}
      </Typography>
      <Switch
        size="small"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        slotProps={{ input: { 'aria-label': label } }}
      />
    </Stack>
  );
}

export function ConfiguracoesPage() {
  const navigate = useNavigate();
  const toast = useToastState();
  const { mode } = useThemeState();
  const [error, setError] = useState<string | null>(null);

  // Identidade drafts: null = untouched (mirrors the saved document).
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState<PresetKey | null>(null);
  // Notificações automáticas optimistic value (kept on success — it equals
  // the server truth; dropped on error to roll the switch back).
  const [notifDraft, setNotifDraft] = useState<boolean | null>(null);

  const academyQuery = $api.useQuery('get', '/v1/admin/academy');
  const saveIdentity = $api.useMutation('put', '/v1/admin/academy');
  const saveNotifications = $api.useMutation('put', '/v1/admin/academy');

  const loaded: AdminAcademyResponse | undefined = academyQuery.data;

  // CFG.9: leaving the hub reverts any unsaved live preview to the session brand.
  useEffect(() => () => setBrandPreview(null), []);

  if (academyQuery.isLoading || !loaded) {
    return (
      <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}>
        Carregando configurações…
      </Typography>
    );
  }

  // Post-guard alias: `const` keeps the narrowing inside the callbacks below.
  const academy: AdminAcademyResponse = loaded;

  const savedPreset = presetForBrand(academy.brand);
  const activePreset = presetDraft ?? savedPreset;
  const nameValue = nameDraft ?? academy.name;
  const autoNotifications = notifDraft ?? academy.autoNotificationsEnabled;
  const dirty =
    (nameDraft !== null && nameDraft !== academy.name) ||
    (presetDraft !== null && presetDraft !== savedPreset);

  function selectPreset(key: PresetKey): void {
    setPresetDraft(key);
    // Live preview (story 5): the console re-themes under the cursor.
    setBrandPreview(READY_MADE_PALETTES[key]);
  }

  function cancelIdentity(): void {
    setNameDraft(null);
    setPresetDraft(null);
    setBrandPreview(null);
    setError(null);
  }

  function submitIdentity(): void {
    setError(null);
    const nextName = nameValue.trim();
    const nextBrand = presetDraft ? brandForPreset(presetDraft) : academy.brand;
    saveIdentity.mutate(
      {
        body: {
          name: nextName,
          brand: nextBrand,
          autoNotificationsEnabled: autoNotifications,
        },
      },
      {
        onSuccess: (data) => {
          // Session academy patched in place: the console stays branded
          // without a re-login (CFG.9), and the preview override drops.
          patchSessionAcademy({ name: data.name, theme: data.brand });
          setNameDraft(null);
          setPresetDraft(null);
          setBrandPreview(null);
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/academy'] });
          toast.show('Identidade salva.');
        },
        onError: () => setError('Não foi possível salvar. Tente novamente.'),
      },
    );
  }

  function toggleNotifications(next: boolean): void {
    setError(null);
    setNotifDraft(next);
    saveNotifications.mutate(
      {
        body: {
          name: academy.name,
          brand: academy.brand,
          autoNotificationsEnabled: next,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/academy'] });
        },
        onError: () => {
          setNotifDraft(null); // Roll the switch back to the saved value.
          setError('Não foi possível salvar. Tente novamente.');
        },
      },
    );
  }

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Configurações"
          subtitle="Identidade, tema e permissões da academia."
        />

        <Card padding={16}>
          <Stack spacing="14px">
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg-1)' }}>
              Identidade visual
            </Typography>
            <Stack direction="row" spacing="12px" sx={{ alignItems: 'center' }}>
              <Box
                aria-hidden
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, var(--brand-1), var(--brand-2))',
                  color: 'var(--white, #FFFFFF)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials(academy.name)}
              </Box>
              <Box sx={{ flex: 1 }}>
                <FormField
                  label="Nome da academia"
                  value={nameValue}
                  onChangeText={setNameDraft}
                />
              </Box>
              {/* Logo upload is recorded debt — the monogram is the v1 logo. */}
              <TatameButton variant="secondary" size="sm" label="Logo" disabled />
            </Stack>

            <Box>
              <Typography
                sx={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--fg-3)',
                  marginBottom: '8px',
                }}
              >
                Paleta de cores
              </Typography>
              <Stack direction="row" spacing="8px" sx={{ flexWrap: 'wrap' }}>
                {PRESET_ORDER.map((key) => (
                  <PaletteSwatch
                    key={key}
                    presetKey={key}
                    selected={activePreset === key}
                    onSelect={selectPreset}
                  />
                ))}
              </Stack>
            </Box>

            <Stack direction="row" spacing="8px" sx={{ justifyContent: 'flex-end' }}>
              <TatameButton
                variant="ghost"
                size="sm"
                label="Cancelar"
                disabled={!dirty}
                onPress={cancelIdentity}
              />
              <TatameButton
                size="sm"
                label="Salvar"
                loading={saveIdentity.isPending}
                disabled={!dirty}
                onPress={submitIdentity}
              />
            </Stack>
          </Stack>
        </Card>

        <Card padding={0}>
          {/* CFG.10: per-user, client-side preference — localStorage, no server. */}
          <ToggleRow
            label="Tema escuro"
            checked={mode === 'dark'}
            onChange={(next) => setThemeMode(next ? 'dark' : 'light')}
          />
          {/* CFG.9: gates the notification fan-out tenant-wide (spec 010 deferral). */}
          <ToggleRow
            label="Notificações automáticas"
            checked={autoNotifications}
            onChange={toggleNotifications}
          />
          {/* Roadmap stub (handoff design backlog) — visible, honestly disabled. */}
          <ToggleRow label="Check-in por geolocalização" checked={false} disabled />
        </Card>

        <Card padding={0}>
          <ListRow
            title="Permissões por perfil"
            chevron
            onPress={() => navigate('/admin/permissoes')}
          />
          {/* Static stub — no screen, no settings (spec 011 out of scope). */}
          <ListRow
            title="Integrações de pagamento"
            trailing={<Chip label="Pix ativo" tone="success" />}
          />
          <ListRow
            title="Planos de mensalidade"
            chevron
            onPress={() => navigate('/admin/planos')}
          />
          <ListRow
            title="Regras de graduação"
            chevron
            onPress={() => navigate('/admin/graduacao')}
          />
        </Card>

        {error ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            {error}
          </Typography>
        ) : null}
      </Stack>

      <Toast open={toast.message !== null} message={toast.message ?? ''} onClose={toast.clear} />
    </Box>
  );
}

export default ConfiguracoesPage;
