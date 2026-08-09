/**
 * FAB creation forms (ENR.13): aluno (minor ⇒ guardian client validation
 * mirroring the service rule), professor (set-password email seam) and
 * responsável. Each sheet posts through the typed client and invalidates its
 * list by path prefix.
 */
import { useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import { BottomSheet, FormField, TatameButton } from '@tatame/design-system';
import { $api, queryClient } from '../../api/api';
import { enrollmentErrorMessage } from './common';
import { beltLabel, isMinor } from './format';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function NewStudentSheet({ open, onClose, onSuccess }: SheetProps) {
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [initialBeltId, setInitialBeltId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const guardians = $api.useQuery('get', '/v1/admin/guardians');
  // Merged régua — the initial-belt select offers enabled belts only (GRD.14).
  const rules = $api.useQuery('get', '/v1/admin/graduation-rules');
  const enabledBelts = (rules.data?.rules ?? []).filter((rule) => rule.enabled);
  const create = $api.useMutation('post', '/v1/admin/students');

  function submit() {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) next['fullName'] = 'Informe o nome completo.';
    if (!birthDate) next['birthDate'] = 'Informe a data de nascimento.';
    if (birthDate && isMinor(birthDate) && !guardianId) {
      next['guardianId'] = 'Aluno menor de idade precisa de um responsável vinculado.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    create.mutate(
      {
        body: {
          fullName: fullName.trim(),
          birthDate,
          ...(guardianId ? { guardianId } : {}),
          // Optional transfer-student seed; empty = starts white (story 32).
          ...(initialBeltId ? { initialBeltId } : {}),
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/students'] });
          onSuccess('Aluno cadastrado.');
          onClose();
        },
        onError: (error) => setApiError(enrollmentErrorMessage(error)),
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Novo aluno"
      subtitle="Alunos menores de idade precisam de um responsável."
    >
      <Stack spacing="14px">
        <FormField
          label="Nome completo"
          value={fullName}
          onChangeText={setFullName}
          error={errors['fullName']}
          required
        />
        <FormField
          label="Data de nascimento"
          type="date"
          value={birthDate}
          onChangeText={setBirthDate}
          error={errors['birthDate']}
          required
        />
        <Stack spacing="6px">
          <FormLabel
            id="new-student-guardian-label"
            htmlFor="new-student-guardian"
            sx={{ fontSize: 13, fontWeight: 600 }}
          >
            Responsável
          </FormLabel>
          <Select
            id="new-student-guardian"
            labelId="new-student-guardian-label"
            size="small"
            displayEmpty
            value={guardianId}
            inputProps={{ 'aria-label': 'Responsável' }}
            onChange={(event) => setGuardianId(event.target.value)}
            error={Boolean(errors['guardianId'])}
          >
            <MenuItem value="">Sem responsável</MenuItem>
            {(guardians.data?.guardians ?? []).map((guardian) => (
              <MenuItem key={guardian.id} value={guardian.id}>
                {guardian.fullName}
              </MenuItem>
            ))}
          </Select>
          {errors['guardianId'] ? (
            <FormHelperText error>{errors['guardianId']}</FormHelperText>
          ) : null}
        </Stack>
        <Stack spacing="6px">
          <FormLabel
            id="new-student-belt-label"
            htmlFor="new-student-belt"
            sx={{ fontSize: 13, fontWeight: 600 }}
          >
            Faixa inicial (opcional)
          </FormLabel>
          <Select
            id="new-student-belt"
            labelId="new-student-belt-label"
            size="small"
            displayEmpty
            value={initialBeltId}
            inputProps={{ 'aria-label': 'Faixa inicial' }}
            onChange={(event) => setInitialBeltId(event.target.value)}
          >
            <MenuItem value="">Padrão — faixa branca</MenuItem>
            {enabledBelts.map((belt) => (
              <MenuItem key={belt.beltId} value={belt.beltId}>
                {beltLabel(belt)}
              </MenuItem>
            ))}
          </Select>
        </Stack>
        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton
          label="Cadastrar aluno"
          fullWidth
          loading={create.isPending}
          onPress={submit}
        />
      </Stack>
    </BottomSheet>
  );
}

export function NewProfessorSheet({ open, onClose, onSuccess }: SheetProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const create = $api.useMutation('post', '/v1/admin/professors');

  function submit() {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) next['fullName'] = 'Informe o nome completo.';
    if (!/^\S+@\S+\.\S+$/.test(email)) next['email'] = 'Informe um email válido.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    create.mutate(
      { body: { fullName: fullName.trim(), email } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/professors'] });
          onSuccess('Professor cadastrado. Enviamos um email para definir a senha.');
          onClose();
        },
        onError: (error) => setApiError(enrollmentErrorMessage(error)),
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Novo professor"
      subtitle="O professor recebe um email para definir a própria senha."
    >
      <Stack spacing="14px">
        <FormField
          label="Nome completo"
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
        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton
          label="Cadastrar professor"
          fullWidth
          loading={create.isPending}
          onPress={submit}
        />
      </Stack>
    </BottomSheet>
  );
}

export function NewGuardianSheet({ open, onClose, onSuccess }: SheetProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const create = $api.useMutation('post', '/v1/admin/guardians');

  function submit() {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) next['fullName'] = 'Informe o nome completo.';
    if (email && !/^\S+@\S+\.\S+$/.test(email)) next['email'] = 'Informe um email válido.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    create.mutate(
      {
        body: {
          fullName: fullName.trim(),
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/guardians'] });
          onSuccess('Responsável cadastrado.');
          onClose();
        },
        onError: (error) => setApiError(enrollmentErrorMessage(error)),
      },
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Novo responsável"
      subtitle="Registro sem login — o acesso chega pelo convite."
    >
      <Stack spacing="14px">
        <FormField
          label="Nome completo"
          value={fullName}
          onChangeText={setFullName}
          error={errors['fullName']}
          required
        />
        <FormField label="Telefone" type="tel" value={phone} onChangeText={setPhone} />
        <FormField
          label="Email"
          type="email"
          value={email}
          onChangeText={setEmail}
          error={errors['email']}
        />
        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton
          label="Cadastrar responsável"
          fullWidth
          loading={create.isPending}
          onPress={submit}
        />
      </Stack>
    </BottomSheet>
  );
}
