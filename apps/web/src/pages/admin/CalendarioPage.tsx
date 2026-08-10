/**
 * Calendário (AGD.4 + EVT.9, admin-14) — the admin console month view over
 * the persona calendar read model (specs 007/008). The API returns the
 * weekly recurrence buckets (`classesByWeekday`) plus the month's published
 * events as dated items (spec 008 filled the Phase-7 `events: []` contract);
 * this page expands them client-side over the rendered month grid — a purple
 * dot on every date whose weekday bucket is non-empty, a pink dot on event
 * dates — with the "aulas recorrentes"/"evento" legend and the selected-day
 * agenda (aulas + Evento entries) sorted by time. Dots derive from schedules
 * and event dates, never sessions. The rendered month is the one the server
 * echoes (current tenant-local month) — month paging is out of scope; the
 * prototype chevron is mobile back navigation, so the console page has none.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Card, ScreenHeader } from '@tatame/design-system';
import type { ApiSchemas } from '@tatame/shared';
import { $api } from '../../api/api';
import { monthName } from '../billing-format';
import { valorChipLabel, type CalendarEventItem } from './events-format';

type CalendarClassItem = ApiSchemas['CalendarClassItemDto'];
type CalendarBuckets = ApiSchemas['CalendarBucketsDto'];

/** 0 = Sunday … 6 = Saturday — the schema weekday convention (spec 007). */
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Sunday-first weekday initials per the handoff grid header (admin-14). */
const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

/** Prototype day-label names; rendered with CSS capitalize like admin-14. */
const WEEKDAY_NAMES = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const;

export interface MonthGridCell {
  /** Day of month, 1-based. */
  day: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: Weekday;
}

/**
 * Sunday-first month grid cells for a "YYYY-MM" month: `leading` blank
 * cells pad the first week, then one cell per day with its weekday.
 */
export function buildMonthGrid(month: string): { leading: number; cells: MonthGridCell[] } {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const leading = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: MonthGridCell[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, weekday: new Date(year, monthIndex, day).getDay() as Weekday });
  }
  return { leading, cells };
}

/** "Agosto 2026" page title from a "2026-08" period. */
export function monthTitle(month: string): string {
  const name = monthName(month);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${month.slice(0, 4)}`;
}

/** "domingo, 2 de agosto" — the selected-day heading (CSS capitalizes it). */
export function dayLabel(month: string, cell: MonthGridCell): string {
  return `${WEEKDAY_NAMES[cell.weekday]}, ${cell.day} de ${monthName(month)}`;
}

function Dot({ color, testId }: { color: string; testId?: string }) {
  return (
    <Box
      component="span"
      {...(testId ? { 'data-testid': testId } : {})}
      sx={{ width: '4px', height: '4px', borderRadius: '999px', background: color }}
    />
  );
}

function LegendEntry({ color, label }: { color: string; label: string }) {
  return (
    <Typography
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: 10.5,
        fontWeight: 700,
        color: 'var(--fg-3)',
      }}
    >
      <Box
        component="span"
        sx={{ width: '5px', height: '5px', borderRadius: '999px', background: color }}
      />
      {label}
    </Typography>
  );
}

function DayCell({
  cell,
  hasClasses,
  hasEvents,
  isToday,
  selected,
  onSelect,
}: {
  cell: MonthGridCell;
  hasClasses: boolean;
  hasEvents: boolean;
  isToday: boolean;
  selected: boolean;
  onSelect: (day: number) => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={`Dia ${cell.day}`}
      aria-pressed={selected}
      onClick={() => onSelect(cell.day)}
      sx={{
        aspectRatio: '1',
        border: 0,
        borderRadius: '12px',
        background: selected
          ? 'var(--purple-700)'
          : isToday
            ? 'var(--purple-100)'
            : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        fontFamily: 'inherit',
      }}
    >
      <Typography
        component="span"
        sx={{
          fontSize: 12,
          fontWeight: 700,
          color: selected ? 'var(--white, #FFFFFF)' : 'var(--fg-1)',
        }}
      >
        {cell.day}
      </Typography>
      <Box component="span" sx={{ display: 'flex', gap: '2px', height: '4px' }}>
        {hasClasses ? (
          <Dot
            color={selected ? 'var(--white, #FFFFFF)' : 'var(--purple-500)'}
            testId={`dot-aula-${cell.day}`}
          />
        ) : null}
        {hasEvents ? (
          <Dot
            color={selected ? 'var(--white, #FFFFFF)' : 'var(--pink-500)'}
            testId={`dot-evento-${cell.day}`}
          />
        ) : null}
      </Box>
    </Box>
  );
}

function DayAgendaRow({ item }: { item: CalendarClassItem }) {
  return (
    <Box
      sx={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-1)',
        borderRadius: '16px',
        padding: '13px 15px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <Box sx={{ flex: 'none', width: '46px', textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'var(--purple-ink)' }}>
          {item.startTime}
        </Typography>
        <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-4)' }}>
          {item.endTime}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'var(--fg-1)' }}>
          {item.className}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'var(--fg-3)', marginTop: '1px' }}>
          {`Prof. ${item.professorName} · ${item.occupancy.active} de ${item.occupancy.capacity}`}
        </Typography>
      </Box>
      <Box
        component="span"
        sx={{
          flex: 'none',
          padding: '3px 9px',
          borderRadius: '999px',
          background: 'var(--purple-100)',
          color: 'var(--purple-800)',
          fontSize: 9.5,
          fontWeight: 700,
        }}
      >
        Aula
      </Box>
    </Box>
  );
}

function DayEventRow({ item }: { item: CalendarEventItem }) {
  const details = [item.location, valorChipLabel(item.priceCents)]
    .filter(Boolean)
    .join(' · ');
  return (
    <Box
      sx={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-1)',
        borderRadius: '16px',
        padding: '13px 15px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <Box sx={{ flex: 'none', width: '46px', textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'var(--pink-ink)' }}>
          {item.time ?? '—'}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'var(--fg-1)' }}>
          {item.name}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'var(--fg-3)', marginTop: '1px' }}>
          {details}
        </Typography>
      </Box>
      <Box
        component="span"
        sx={{
          flex: 'none',
          padding: '3px 9px',
          borderRadius: '999px',
          background: 'var(--pink-100)',
          color: 'var(--pink-700)',
          fontSize: 9.5,
          fontWeight: 700,
        }}
      >
        Evento
      </Box>
    </Box>
  );
}

/** Month events bucketed by tenant-local day-of-month (the pink dots). */
export function eventsByDay(
  month: string,
  events: CalendarEventItem[],
): Map<number, CalendarEventItem[]> {
  const byDay = new Map<number, CalendarEventItem[]>();
  for (const event of events) {
    if (!event.date || event.date.slice(0, 7) !== month) continue;
    const day = Number(event.date.slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  return byDay;
}

export function CalendarioPage() {
  const calendar = $api.useQuery('get', '/v1/admin/calendar');
  const data = calendar.data;
  const [pickedDay, setPickedDay] = useState<number | null>(null);

  const grid = data ? buildMonthGrid(data.month) : null;
  const monthEvents = data ? eventsByDay(data.month, data.events) : new Map<number, CalendarEventItem[]>();

  // Default selection: today when the rendered month is the current one
  // (it always is in v1 — the server echoes the current tenant-local
  // month), otherwise day 1.
  const today = new Date();
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const todayInMonth = data?.month === currentPeriod ? today.getDate() : null;
  const selectedDay = pickedDay ?? todayInMonth ?? 1;

  const selectedCell = grid?.cells.find((cell) => cell.day === selectedDay) ?? null;
  const dayClasses: CalendarClassItem[] =
    data && selectedCell
      ? [...data.classesByWeekday[selectedCell.weekday]].sort((a, b) =>
          a.startTime.localeCompare(b.startTime),
        )
      : [];
  const dayEvents: CalendarEventItem[] = selectedCell
    ? (monthEvents.get(selectedCell.day) ?? [])
    : [];
  // Aulas + Evento entries merged into one agenda, sorted by start time.
  const dayItems: Array<
    { kind: 'aula'; time: string; item: CalendarClassItem }
    | { kind: 'evento'; time: string; item: CalendarEventItem }
  > = [
    ...dayClasses.map((item) => ({ kind: 'aula' as const, time: item.startTime, item })),
    ...dayEvents.map((item) => ({ kind: 'evento' as const, time: item.time ?? '', item })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title={data ? monthTitle(data.month) : 'Calendário'}
          subtitle="Todas as turmas e eventos da academia"
        />

        {calendar.isLoading ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}>
            Carregando calendário…
          </Typography>
        ) : null}
        {calendar.isError ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            Não foi possível carregar o calendário. Tente novamente.
          </Typography>
        ) : null}

        {data && grid && selectedCell ? (
          <>
            <Card padding={14}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '2px',
                  marginBottom: '6px',
                }}
              >
                {WEEKDAY_INITIALS.map((initial, index) => (
                  <Typography
                    key={`${initial}-${index}`}
                    component="span"
                    sx={{
                      textAlign: 'center',
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: 'var(--fg-4)',
                    }}
                  >
                    {initial}
                  </Typography>
                ))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {Array.from({ length: grid.leading }, (_, index) => (
                  <Box key={`blank-${index}`} data-testid="cal-blank" />
                ))}
                {grid.cells.map((cell) => (
                  <DayCell
                    key={cell.day}
                    cell={cell}
                    hasClasses={
                      (data.classesByWeekday as CalendarBuckets)[cell.weekday].length > 0
                    }
                    hasEvents={monthEvents.has(cell.day)}
                    isToday={cell.day === todayInMonth}
                    selected={cell.day === selectedDay}
                    onSelect={setPickedDay}
                  />
                ))}
              </Box>
              <Stack
                direction="row"
                spacing="14px"
                sx={{
                  marginTop: '10px',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-1)',
                }}
              >
                <LegendEntry color="var(--purple-500)" label="aulas recorrentes" />
                <LegendEntry color="var(--pink-500)" label="evento" />
              </Stack>
            </Card>

            <Box>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--fg-1)',
                  marginBottom: '10px',
                  textTransform: 'capitalize',
                }}
              >
                {dayLabel(data.month, selectedCell)}
              </Typography>
              {dayItems.length === 0 ? (
                <Typography
                  sx={{
                    textAlign: 'center',
                    padding: '24px',
                    fontSize: 12.5,
                    color: 'var(--fg-3)',
                  }}
                >
                  Nada agendado neste dia.
                </Typography>
              ) : (
                <Stack spacing="8px">
                  {dayItems.map((entry, index) =>
                    entry.kind === 'aula' ? (
                      <DayAgendaRow
                        key={`${entry.item.classId}-${entry.time}-${index}`}
                        item={entry.item}
                      />
                    ) : (
                      <DayEventRow key={`${entry.item.id}-${index}`} item={entry.item} />
                    ),
                  )}
                </Stack>
              )}
            </Box>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}

export default CalendarioPage;
