/**
 * Aluno month calendar (AGD.6, aluno-08): pushed from the Agenda header's
 * "Mês" button — enrolled-class recurrence dots over the current month,
 * "sua aula"/"evento" legend and the selected-day agenda ("Dia livre" copy
 * on free days). Event days carry the pink dot and Evento entries pushing
 * the detail (EVT.10, spec 008 — the Phase-7 legend finally tells the truth).
 */

import { useRouter } from 'expo-router';
import { api } from '../../../api/query';
import { MonthCalendarBody } from '../../../features/agenda/MonthCalendarBody';

export default function AlunoCalendarioScreen() {
  const router = useRouter();
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
      onPressEvent={(event) => router.push(`/evento/${event.id}`)}
    />
  );
}
