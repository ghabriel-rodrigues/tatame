/**
 * Aluno Dados pessoais (REP.10, spec 013 — aluno-18): GET/PUT
 * /v1/aluno/profile. Sections IDENTIFICAÇÃO / CONTATO / ENDEREÇO / CONTATO
 * DE EMERGÊNCIA; CPF/RG render as dashed lock boxes once set (write-once —
 * editable inputs only while empty), email and birth date are read-only
 * identity facts, the Cidade / UF single input is parsed on save into the
 * two typed columns, "Trocar foto" is the recorded placeholder (avatars
 * stay initials in v1) and Salvar round-trips with per-field PT-BR errors
 * (profile.field_locked / validation.failed mapped onto the inputs). The
 * prototype's clipped right edge (aluno-18 render bug) is NOT reproduced —
 * the two-column rows flex inside the padded screen width.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react-native';
import {
  BottomSheet,
  FormField,
  ListRow,
  ScreenHeader,
  TatameButton,
  Text,
  Toast,
  useTheme,
  fadeUp,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { InitialsAvatar, QueryState } from '../../../features/enrollment/ui';
import {
  PROFILE_SAVED_TOAST,
  profileSaveError,
} from '../../../features/profile/copy';
import {
  formatCep,
  formatCpf,
  GENDER_LABELS,
  GENDER_OPTIONS,
  isoToBrDate,
  joinCityUf,
  maskCepInput,
  maskCpfInput,
  parseCityUf,
} from '../../../features/profile/format';
import type {
  AlunoProfileResponse,
  ProfileGender,
  UpdateAlunoProfile,
} from '../../../features/profile/types';
import { isReadOnly, useSession } from '../../../session/session-store';

interface FormState {
  fullName: string;
  gender: ProfileGender | null;
  cpf: string;
  rg: string;
  phone: string;
  addressLine: string;
  cityUf: string;
  cep: string;
  emergencyName: string;
  emergencyPhone: string;
}

function formFromProfile(profile: AlunoProfileResponse): FormState {
  return {
    fullName: profile.fullName,
    gender: profile.gender,
    cpf: profile.cpf ? formatCpf(profile.cpf) : '',
    rg: profile.rg ?? '',
    phone: profile.phone ?? '',
    addressLine: profile.addressLine ?? '',
    cityUf: joinCityUf(profile.addressCity, profile.addressState),
    cep: profile.addressZip ? formatCep(profile.addressZip) : '',
    emergencyName: profile.emergencyContactName ?? '',
    emergencyPhone: profile.emergencyContactPhone ?? '',
  };
}

/** Dashed write-once box: "CPF · 123.456.789-00" + lock (aluno-18). */
function LockedDocBox({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessibilityLabel={`${label} bloqueado`}
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space['2'],
        paddingVertical: 13,
        paddingHorizontal: 15,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.color.border['2'],
        backgroundColor: theme.color.bg.sunken,
      }}
    >
      <Text
        variant="caption"
        color={theme.color.fg['3']}
        style={{ flexShrink: 1, fontSize: 13 }}
      >
        {label} · {value}
      </Text>
      <Lock size={13} color={theme.color.fg['4']} />
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      variant="overline"
      color={theme.color.fg['4']}
      style={{ marginTop: theme.space['2'] }}
    >
      {children}
    </Text>
  );
}

export default function AlunoDadosPessoaisScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const readOnly = session ? isReadOnly(session) : false;

  const profileQuery = api.useQuery('get', '/v1/aluno/profile');
  const saveMutation = api.useMutation('put', '/v1/aluno/profile');
  const profile = profileQuery.data;

  const [form, setForm] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [screenError, setScreenError] = useState<string | null>(null);
  const [genderSheet, setGenderSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Hydrate the form per loaded payload (server state is the truth) — the
  // render-time derived-state pattern, not an effect (no cascading render).
  const [hydratedFrom, setHydratedFrom] = useState<AlunoProfileResponse | null>(
    null,
  );
  if (profile && profile !== hydratedFrom) {
    setHydratedFrom(profile);
    setForm(formFromProfile(profile));
  }

  const set = (patch: Partial<FormState>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));

  const save = () => {
    if (!form || !profile) return;
    setScreenError(null);
    setFieldErrors({});
    const { city, state } = parseCityUf(form.cityUf);
    const cpfDigits = form.cpf.replace(/\D/g, '');
    const body = {
      fullName: form.fullName.trim(),
      gender: form.gender,
      phone: form.phone.trim() || null,
      addressLine: form.addressLine.trim() || null,
      addressCity: city,
      addressState: state,
      addressZip: form.cep.replace(/\D/g, '') || null,
      emergencyContactName: form.emergencyName.trim() || null,
      emergencyContactPhone: form.emergencyPhone.trim() || null,
      // Write-once documents: sent only while editable and filled.
      ...(!profile.cpfLocked && cpfDigits ? { cpf: cpfDigits } : {}),
      ...(!profile.rgLocked && form.rg.trim() ? { rg: form.rg.trim() } : {}),
      // The generated UpdateAlunoProfileDto types nullable strings as
      // `Record<string, never> | null` (openapi-typescript artifact for
      // untyped nullable properties) — the wire contract is string | null.
    } as unknown as UpdateAlunoProfile;
    saveMutation.mutate(
      { body },
      {
        onSuccess: (updated) => {
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/aluno/profile'],
          });
          // Name syncs onto the student row server-side; home/perfil re-read.
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/aluno/home'],
          });
          setForm(formFromProfile(updated));
          setToast(PROFILE_SAVED_TOAST);
        },
        onError: (error) => {
          const mapped = profileSaveError(error);
          setScreenError(mapped.message);
          setFieldErrors(mapped.fieldErrors);
        },
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['5'],
          paddingBottom: 130,
        }}
      >
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['3'] }}>
          <ScreenHeader
            title="Dados pessoais"
            onBack={() => router.back()}
            trailing={
              <TatameButton
                size="sm"
                label="Salvar"
                loading={saveMutation.isPending}
                disabled={readOnly || !form}
                onPress={save}
                testID="dados-salvar"
              />
            }
          />

          <QueryState
            loading={profileQuery.isPending}
            error={profileQuery.isError}
          >
            {profile && form ? (
              <View style={{ gap: theme.space['3'] }}>
                {/* Avatar + Trocar foto placeholder (upload is recorded debt). */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space['4'],
                  }}
                >
                  <InitialsAvatar
                    name={form.fullName || profile.fullName}
                    size={64}
                  />
                  <TatameButton
                    size="sm"
                    variant="secondary"
                    label="Trocar foto"
                    disabled
                    testID="trocar-foto"
                  />
                </View>

                {screenError ? (
                  <Text
                    variant="caption"
                    color={theme.color.danger['500']}
                    testID="dados-error"
                  >
                    {screenError}
                  </Text>
                ) : null}

                <SectionLabel>Identificação</SectionLabel>
                <FormField
                  label="Nome completo"
                  value={form.fullName}
                  onChangeText={(fullName) => set({ fullName })}
                  error={fieldErrors['fullName']}
                  testID="campo-nome"
                />
                <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
                  <FormField
                    label="Data de nascimento"
                    value={
                      profile.birthDate ? isoToBrDate(profile.birthDate) : '—'
                    }
                    disabled
                    helperText="Gerenciada pela academia"
                    style={{ flex: 1, minWidth: 0 }}
                    testID="campo-nascimento"
                  />
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <Text variant="label" color={theme.color.fg['3']}>
                      Sexo
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Sexo"
                      testID="campo-sexo"
                      onPress={() => setGenderSheet(true)}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: theme.space['4'],
                        borderRadius: theme.radius.md,
                        borderWidth: 1,
                        borderColor: fieldErrors['gender']
                          ? theme.color.danger['500']
                          : theme.color.border['1'],
                        backgroundColor: theme.color.bg.surface,
                      }}
                    >
                      <Text
                        variant="body"
                        color={
                          form.gender
                            ? theme.color.fg['1']
                            : theme.color.fg['4']
                        }
                        style={{ fontSize: 15 }}
                      >
                        {form.gender
                          ? GENDER_LABELS[form.gender]
                          : 'Selecionar'}
                      </Text>
                    </Pressable>
                    {fieldErrors['gender'] ? (
                      <Text variant="caption" color={theme.color.danger['500']}>
                        {fieldErrors['gender']}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
                  {profile.cpfLocked && profile.cpf ? (
                    <LockedDocBox
                      label="CPF"
                      value={formatCpf(profile.cpf)}
                      testID="cpf-locked"
                    />
                  ) : (
                    <FormField
                      label="CPF"
                      value={form.cpf}
                      onChangeText={(raw) => set({ cpf: maskCpfInput(raw) })}
                      placeholder="000.000.000-00"
                      type="number"
                      error={fieldErrors['cpf']}
                      helperText={
                        fieldErrors['cpf']
                          ? undefined
                          : 'Definido uma única vez'
                      }
                      style={{ flex: 1, minWidth: 0 }}
                      testID="campo-cpf"
                    />
                  )}
                  {profile.rgLocked && profile.rg ? (
                    <LockedDocBox
                      label="RG"
                      value={profile.rg}
                      testID="rg-locked"
                    />
                  ) : (
                    <FormField
                      label="RG"
                      value={form.rg}
                      onChangeText={(rg) => set({ rg })}
                      error={fieldErrors['rg']}
                      helperText={
                        fieldErrors['rg'] ? undefined : 'Definido uma única vez'
                      }
                      style={{ flex: 1, minWidth: 0 }}
                      testID="campo-rg"
                    />
                  )}
                </View>

                <SectionLabel>Contato</SectionLabel>
                <FormField
                  label="Email"
                  value={profile.email}
                  disabled
                  helperText="Identidade de acesso — não editável"
                  testID="campo-email"
                />
                <FormField
                  label="Telefone / WhatsApp"
                  value={form.phone}
                  onChangeText={(phone) => set({ phone })}
                  type="tel"
                  error={fieldErrors['phone']}
                  testID="campo-telefone"
                />

                <SectionLabel>Endereço</SectionLabel>
                <FormField
                  label="Rua, número e complemento"
                  value={form.addressLine}
                  onChangeText={(addressLine) => set({ addressLine })}
                  error={fieldErrors['addressLine']}
                  testID="campo-endereco"
                />
                <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
                  <FormField
                    label="Cidade / UF"
                    value={form.cityUf}
                    onChangeText={(cityUf) => set({ cityUf })}
                    placeholder="São Paulo / SP"
                    error={
                      fieldErrors['addressState'] ?? fieldErrors['addressCity']
                    }
                    style={{ flex: 1.4, minWidth: 0 }}
                    testID="campo-cidade-uf"
                  />
                  <FormField
                    label="CEP"
                    value={form.cep}
                    onChangeText={(raw) => set({ cep: maskCepInput(raw) })}
                    placeholder="00000-000"
                    type="number"
                    error={fieldErrors['addressZip']}
                    style={{ flex: 1, minWidth: 0 }}
                    testID="campo-cep"
                  />
                </View>

                <SectionLabel>Contato de emergência</SectionLabel>
                <FormField
                  label="Nome do contato"
                  value={form.emergencyName}
                  onChangeText={(emergencyName) => set({ emergencyName })}
                  error={fieldErrors['emergencyContactName']}
                  testID="campo-emergencia-nome"
                />
                <FormField
                  label="Telefone do contato"
                  value={form.emergencyPhone}
                  onChangeText={(emergencyPhone) => set({ emergencyPhone })}
                  type="tel"
                  error={fieldErrors['emergencyContactPhone']}
                  testID="campo-emergencia-telefone"
                />
              </View>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>

      <BottomSheet
        open={genderSheet}
        onClose={() => setGenderSheet(false)}
        title="Sexo"
        testID="sexo-sheet"
      >
        <View>
          {GENDER_OPTIONS.map((option, index) => (
            <ListRow
              key={option}
              title={GENDER_LABELS[option]}
              divider={index < GENDER_OPTIONS.length - 1}
              onPress={() => {
                set({ gender: option });
                setGenderSheet(false);
              }}
              testID={`sexo-${option}`}
            />
          ))}
        </View>
      </BottomSheet>

      <Toast
        open={toast !== null}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        offsetBottom={110}
      />
    </SafeAreaView>
  );
}
