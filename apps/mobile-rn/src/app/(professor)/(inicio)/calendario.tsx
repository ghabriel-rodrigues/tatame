/**
 * Professor month calendar (AGD.6, professor-04): pushed from the dashboard
 * header's calendar icon — own-class recurrence dots, "aula recorrente"
 * legend and the day list with occupancy ("Dia livre — bom descanso." on
 * free days).
 */

import { api } from '../../../api/query';
import { MonthCalendarBody } from '../../../features/agenda/MonthCalendarBody';

export default function ProfessorCalendarioScreen() {
  const query = api.useQuery('get', '/v1/professor/calendar');
  return (
    <MonthCalendarBody
      persona="professor"
      subtitle="Aulas recorrentes e eventos da academia"
      legendClassLabel="aula recorrente"
      emptyDayCopy="Dia livre — bom descanso."
      data={query.data}
      loading={query.isPending}
      error={query.isError}
    />
  );
}
