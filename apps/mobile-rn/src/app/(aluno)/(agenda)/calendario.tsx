/**
 * Aluno month calendar (AGD.6, aluno-08): pushed from the Agenda header's
 * "Mês" button — enrolled-class recurrence dots over the current month,
 * "sua aula"/"evento" legend and the selected-day agenda ("Dia livre" copy
 * on free days).
 */

import { api } from '../../../api/query';
import { MonthCalendarBody } from '../../../features/agenda/MonthCalendarBody';

export default function AlunoCalendarioScreen() {
  const query = api.useQuery('get', '/v1/aluno/calendar');
  return (
    <MonthCalendarBody
      persona="aluno"
      subtitle="Suas aulas e eventos da academia"
      legendClassLabel="sua aula"
      emptyDayCopy="Dia livre — o tatame espera você no próximo treino."
      data={query.data}
      loading={query.isPending}
      error={query.isError}
    />
  );
}
