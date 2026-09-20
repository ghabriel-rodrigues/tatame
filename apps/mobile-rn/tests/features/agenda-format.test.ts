/**
 * Agenda pure logic (AGD.5-6 testing decisions): the shared expansion rules
 * (weekday buckets → month dots; selected-day sort), the check-in
 * affordance rule and the PT-BR label composers.
 */

import {
  dayAgendaItems,
  dayHeadingPt,
  expandMonthMarks,
  levelChipLabel,
  monthTitlePt,
  showCheckinButton,
  timeRangeLabel,
  vagasLabel,
  weekdayOf,
} from '../../src/features/agenda/format';
import { makeBuckets, makeCalendarItem } from '../helpers/agenda';

describe('expandMonthMarks', () => {
  it('marks every date whose weekday bucket is non-empty (August 2026)', () => {
    const buckets = makeBuckets({
      1: [makeCalendarItem()],
      6: [makeCalendarItem()],
    });
    const marks = expandMonthMarks(buckets, 2026, 8);

    // Mondays and Saturdays of August 2026.
    for (const day of [3, 10, 17, 24, 31, 1, 8, 15, 22, 29]) {
      expect(marks[day]).toEqual({ classDot: true });
    }
    // Everything else stays unmarked (dot iff bucket non-empty).
    for (const day of [2, 4, 5, 6, 7, 9, 30]) {
      expect(marks[day]).toBeUndefined();
    }
  });

  it('returns no marks for empty buckets', () => {
    expect(expandMonthMarks(makeBuckets(), 2026, 8)).toEqual({});
  });
});

describe('dayAgendaItems', () => {
  it('sorts the weekday bucket by start time', () => {
    const buckets = makeBuckets({
      1: [
        makeCalendarItem({ className: 'Noite', startTime: '20:15' }),
        makeCalendarItem({ className: 'Manhã', startTime: '07:00' }),
        makeCalendarItem({ className: 'Tarde', startTime: '18:30' }),
      ],
    });
    expect(dayAgendaItems(buckets, 1).map((item) => item.className)).toEqual([
      'Manhã',
      'Tarde',
      'Noite',
    ]);
  });

  it('returns an empty list for a free weekday', () => {
    expect(dayAgendaItems(makeBuckets(), 4)).toEqual([]);
  });
});

describe('showCheckinButton', () => {
  it('is true only for today and unchecked (spec 007 story 6-9)', () => {
    expect(showCheckinButton(true, false)).toBe(true);
    expect(showCheckinButton(true, true)).toBe(false);
    expect(showCheckinButton(false, false)).toBe(false);
    expect(showCheckinButton(false, true)).toBe(false);
  });
});

describe('levelChipLabel', () => {
  const base = { ageMin: null, ageMax: null, minBelt: null, maxBelt: null };

  it('composes the belt range', () => {
    expect(
      levelChipLabel({
        ...base,
        minBelt: { name: 'Branca' },
        maxBelt: { name: 'Azul' },
      }),
    ).toBe('Branca a Azul');
  });

  it('collapses an equal-belt range to the single belt', () => {
    expect(
      levelChipLabel({
        ...base,
        minBelt: { name: 'Azul' },
        maxBelt: { name: 'Azul' },
      }),
    ).toBe('Azul');
  });

  it('uses the single bound when only one belt is set', () => {
    expect(levelChipLabel({ ...base, minBelt: { name: 'Roxa' } })).toBe('Roxa');
    expect(levelChipLabel({ ...base, maxBelt: { name: 'Azul' } })).toBe('Azul');
  });

  it('falls back to the Kids age range', () => {
    expect(levelChipLabel({ ...base, ageMin: 6, ageMax: 9 })).toBe(
      '6 a 9 anos',
    );
  });

  it('defaults to "Todas as faixas"', () => {
    expect(levelChipLabel(base)).toBe('Todas as faixas');
  });
});

describe('labels', () => {
  it('vagasLabel renders the universal "N de M" form (never "Livre")', () => {
    expect(vagasLabel({ active: 12, capacity: 20 })).toBe('12 de 20 vagas');
  });

  it('timeRangeLabel joins server-derived bounds', () => {
    expect(timeRangeLabel('19:00', '20:00')).toBe('19:00 – 20:00');
  });

  it('monthTitlePt renders the echoed month', () => {
    expect(monthTitlePt('2026-08')).toBe('Agosto 2026');
    expect(monthTitlePt('2026-01')).toBe('Janeiro 2026');
  });

  it('dayHeadingPt renders the selected-day heading', () => {
    expect(dayHeadingPt(2026, 8, 2)).toBe('Domingo, 2 de agosto');
    expect(dayHeadingPt(2026, 8, 3)).toBe('Segunda-feira, 3 de agosto');
  });

  it('weekdayOf follows the 0=Sunday API convention', () => {
    expect(weekdayOf(2026, 8, 2)).toBe(0);
    expect(weekdayOf(2026, 8, 8)).toBe(6);
  });
});
