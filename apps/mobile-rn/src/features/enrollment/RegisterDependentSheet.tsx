/**
 * "Cadastrar aluno" sheet (ENR.20, responsavel-08): nome + data de
 * nascimento; the "Turma sugerida pela idade" chip is fetched from
 * GET /v1/responsavel/class-suggestion ONLY after a complete, valid birth
 * date is typed — never pre-filled (the prototype's static "Kids · Ter e
 * Qui 18:00" chip while the form is empty was a mock artifact).
 *
 * POST /v1/responsavel/dependents auto-links the child to the guardian and
 * enrolls into the accepted suggestion when it has room; `enrolled: false`
 * (no match / full class, story 34) is surfaced honestly in the toast.
 *
 * The host renders nothing at all when the academy turned the
 * `dependents.register` toggle off (story 36) — entry points are hidden by
 * the same permission read.
 */

import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  BottomSheet,
  Chip,
  FormField,
  TatameButton,
  Text,
  Toast,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../api/query';
import { enrollmentErrorMessage } from './copy';
import { maskBirthDateInput, parseBirthDate, suggestionLabel } from './format';
import { canRegisterDependents } from './permissions';
import {
  closeRegisterDependentSheet,
  useRegisterDependentSheetOpen,
} from './register-sheet-store';
import { useSession } from '../../session/session-store';

export function RegisterDependentSheetHost() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const open = useRegisterDependentSheetOpen();

  const [fullName, setFullName] = useState('');
  const [birthInput, setBirthInput] = useState('');
  const [suggestionAccepted, setSuggestionAccepted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const birthDate = parseBirthDate(birthInput);

  const suggestionQuery = api.useQuery(
    'get',
    '/v1/responsavel/class-suggestion',
    { params: { query: { birthDate: birthDate ?? '' } } },
    { enabled: open && birthDate !== null },
  );
  const suggestion = birthDate !== null ? (suggestionQuery.data?.suggestion ?? null) : null;

  const registerMutation = api.useMutation('post', '/v1/responsavel/dependents');

  // Story 36: toggle off ⇒ the surface does not exist client-side.
  if (!canRegisterDependents(session)) return null;

  const reset = () => {
    setFullName('');
    setBirthInput('');
    setSuggestionAccepted(true);
    setError(null);
  };

  const close = () => {
    reset();
    closeRegisterDependentSheet();
  };

  const submit = () => {
    if (!birthDate || fullName.trim().length === 0) return;
    setError(null);
    const acceptedClass = suggestion && suggestionAccepted ? suggestion : null;
    registerMutation.mutate(
      {
        body: {
          fullName: fullName.trim(),
          birthDate,
          ...(acceptedClass ? { classId: acceptedClass.id } : {}),
        },
      },
      {
        onSuccess: (data) => {
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/responsavel/dependents'],
          });
          setToast(
            data.enrolled && acceptedClass
              ? `${data.dependent.fullName} cadastrado e matriculado na turma ${acceptedClass.name}.`
              : `${data.dependent.fullName} cadastrado — matrícula fica para quando houver vaga.`,
          );
          close();
        },
        onError: (mutationError) => setError(enrollmentErrorMessage(mutationError)),
      },
    );
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={close}
        title="Cadastrar aluno"
        subtitle="O cadastro nasce vinculado a você e à academia."
        testID="register-dependent-sheet"
      >
        <View style={{ gap: theme.space['4'] }}>
          <FormField
            label="Nome completo"
            placeholder="Nome completo"
            value={fullName}
            onChangeText={setFullName}
          />
          <FormField
            label="Data de nascimento"
            placeholder="DD/MM/AAAA"
            type="number"
            value={birthInput}
            onChangeText={(value) => setBirthInput(maskBirthDateInput(value))}
          />

          <View style={{ gap: theme.space['2'] }}>
            <Text variant="label" color={theme.color.fg['3']}>
              Turma sugerida pela idade
            </Text>
            {birthDate === null ? (
              <Text variant="caption">
                Informe a data de nascimento para ver a turma sugerida.
              </Text>
            ) : suggestionQuery.isPending ? (
              <Text variant="caption">Buscando turma sugerida…</Text>
            ) : suggestion ? (
              <Chip
                label={suggestionLabel(suggestion.name, suggestion.schedules)}
                tone="brand"
                size="md"
                selected={suggestionAccepted}
                onPress={() => setSuggestionAccepted((accepted) => !accepted)}
              />
            ) : (
              <Text variant="caption">
                Nenhuma turma com vaga para essa idade — o cadastro segue sem matrícula.
              </Text>
            )}
          </View>

          {error ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {error}
            </Text>
          ) : null}

          <TatameButton
            fullWidth
            label="Cadastrar"
            disabled={!birthDate || fullName.trim().length === 0}
            loading={registerMutation.isPending}
            onPress={submit}
          />
        </View>
      </BottomSheet>

      <Toast
        open={toast !== null}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        offsetBottom={110}
      />
    </>
  );
}
