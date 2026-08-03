/**
 * Nova turma recorrente (ENR.15, admin-12): weekday chips fan out into one
 * schedule slot per selected day at the chosen start time + duration.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { BottomSheet, Chip, FormField, TatameButton } from '@tatame/design-system';
import { $api, queryClient } from '../../api/api';
import { enrollmentErrorMessage } from './common';
import { WEEKDAY_CHIP_ORDER, WEEKDAY_SHORT } from './format';

export interface NewClassSheetProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function NewClassSheet({ open, onClose, onSuccess }: NewClassSheetProps) {
  const [name, setName] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('19:00');
  const [duration, setDuration] = useState('60');
  const [professorUserId, setProfessorUserId] = useState('');
  const [capacity, setCapacity] = useState('20');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const professors = $api.useQuery('get', '/v1/admin/professors');
  const create = $api.useMutation('post', '/v1/admin/classes');

  function toggleWeekday(weekday: number) {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((day) => day !== weekday)
        : [...current, weekday],
    );
  }

  function submit() {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next['name'] = 'Informe o nome da turma.';
    if (weekdays.length === 0) next['weekdays'] = 'Selecione pelo menos um dia da semana.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) next['startTime'] = 'Horário inválido.';
    const durationMinutes = Number(duration);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      next['duration'] = 'Duração inválida.';
    }
    if (!professorUserId) next['professor'] = 'Selecione um professor.';
    const capacityNumber = Number(capacity);
    if (!Number.isInteger(capacityNumber) || capacityNumber < 1) {
      next['capacity'] = 'Informe o limite de alunos.';
    }
    const min = ageMin === '' ? null : Number(ageMin);
    const max = ageMax === '' ? null : Number(ageMax);
    if (min !== null && max !== null && min > max) next['age'] = 'Faixa etária inválida.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    create.mutate(
      {
        body: {
          name: name.trim(),
          professorUserId,
          capacity: capacityNumber,
          ...(min !== null ? { ageMin: min } : {}),
          ...(max !== null ? { ageMax: max } : {}),
          schedules: weekdays.map((weekday) => ({
            weekday,
            startTime,
            durationMinutes,
          })),
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/classes'] });
          onSuccess('Turma criada.');
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
      title="Nova turma"
      subtitle="Horários recorrentes, toda semana."
    >
      <Stack spacing="14px">
        <FormField
          label="Nome da turma"
          value={name}
          onChangeText={setName}
          placeholder="Nome da turma"
          error={errors['name']}
          required
        />
        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>Dias da semana</FormLabel>
          <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {WEEKDAY_CHIP_ORDER.map((weekday) => (
              <Chip
                key={weekday}
                label={WEEKDAY_SHORT[weekday] ?? ''}
                size="md"
                selected={weekdays.includes(weekday)}
                onPress={() => toggleWeekday(weekday)}
              />
            ))}
          </Box>
          {errors['weekdays'] ? <FormHelperText error>{errors['weekdays']}</FormHelperText> : null}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField
            label="Hora de início"
            type="time"
            value={startTime}
            onChangeText={setStartTime}
            error={errors['startTime']}
            required
          />
          <FormField
            label="Duração (min)"
            type="number"
            value={duration}
            onChangeText={setDuration}
            error={errors['duration']}
            required
          />
        </Box>
        <Stack spacing="6px">
          <FormLabel htmlFor="new-class-professor" sx={{ fontSize: 13, fontWeight: 600 }}>
            Professor
          </FormLabel>
          <Select
            id="new-class-professor"
            size="small"
            displayEmpty
            value={professorUserId}
            inputProps={{ 'aria-label': 'Professor' }}
            onChange={(event) => setProfessorUserId(event.target.value)}
            error={Boolean(errors['professor'])}
          >
            <MenuItem value="">Selecione</MenuItem>
            {(professors.data?.professors ?? []).map((professor) => (
              <MenuItem key={professor.userId} value={professor.userId}>
                {professor.fullName}
              </MenuItem>
            ))}
          </Select>
          {errors['professor'] ? <FormHelperText error>{errors['professor']}</FormHelperText> : null}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <FormField
            label="Limite de alunos"
            type="number"
            value={capacity}
            onChangeText={setCapacity}
            error={errors['capacity']}
            required
          />
          <FormField label="Idade mín." type="number" value={ageMin} onChangeText={setAgeMin} />
          <FormField label="Idade máx." type="number" value={ageMax} onChangeText={setAgeMax} />
        </Box>
        {errors['age'] ? <FormHelperText error>{errors['age']}</FormHelperText> : null}
        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton label="Criar turma" fullWidth loading={create.isPending} onPress={submit} />
        <TatameButton variant="ghost" label="Voltar" fullWidth onPress={onClose} />
      </Stack>
    </BottomSheet>
  );
}
