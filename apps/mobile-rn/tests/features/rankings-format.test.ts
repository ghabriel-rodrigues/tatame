/**
 * Ranking pure helpers (REP.11, spec 013): count labels, ordinal position,
 * bar scaling against the leader, window subtitles and the per-segment
 * selos footnote (professor-06 copy bug fixed).
 */

import { homeRankingLine, seloFootnote } from '../../src/features/rankings/copy';
import {
  barFraction,
  countLabel,
  positionOrdinal,
  rankingSubtitle,
  windowMonthCapPt,
  windowMonthPt,
} from '../../src/features/rankings/format';
import { EVENTS_WINDOW, LESSONS_WINDOW } from '../helpers/rankings';

describe('rankings format (REP.11)', () => {
  it('labels counts with the right unit and plural', () => {
    expect(countLabel(17, 'lessons')).toBe('17 aulas');
    expect(countLabel(1, 'lessons')).toBe('1 aula');
    expect(countLabel(5, 'events')).toBe('5 eventos');
    expect(countLabel(1, 'events')).toBe('1 evento');
    expect(countLabel(0, 'events')).toBe('0 eventos');
  });

  it('formats the pt-BR ordinal position', () => {
    expect(positionOrdinal(1)).toBe('1º');
    expect(positionOrdinal(2)).toBe('2º');
    expect(positionOrdinal(11)).toBe('11º');
  });

  it('scales bars to the leader, clamped and zero-safe', () => {
    const row = { position: 2, name: 'Lucas', count: 14, isMe: true };
    expect(barFraction(row, 17)).toBeCloseTo(14 / 17);
    expect(barFraction({ ...row, count: 17 }, 17)).toBe(1);
    expect(barFraction(row, 0)).toBe(0);
  });

  it('derives the month from the window start', () => {
    expect(windowMonthPt(LESSONS_WINDOW)).toBe('agosto');
    expect(windowMonthCapPt(LESSONS_WINDOW)).toBe('Agosto');
  });

  it('builds the per-segment subtitles', () => {
    expect(rankingSubtitle('lessons', LESSONS_WINDOW, 'Alpha Jiu-Jitsu')).toBe(
      'Agosto · Alpha Jiu-Jitsu',
    );
    expect(rankingSubtitle('lessons', LESSONS_WINDOW, null)).toBe('Agosto · sua academia');
    expect(rankingSubtitle('events', EVENTS_WINDOW, 'Alpha Jiu-Jitsu')).toBe(
      'Participações em eventos no semestre',
    );
  });

  it('adapts the selos footnote per segment (professor-06 bug fixed)', () => {
    const lessons = seloFootnote('lessons');
    expect(lessons.selo).toBe('Constância');
    expect(`${lessons.lead}${lessons.selo}${lessons.tail}`).toBe(
      '12+ aulas no mês valem o selo Constância.',
    );
    const events = seloFootnote('events');
    expect(events.selo).toBe('Espírito de equipe');
    expect(`${events.lead}${events.selo}${events.tail}`).toBe(
      'Presença em eventos vale o selo Espírito de equipe.',
    );
  });

  it('composes the home entry-card line', () => {
    expect(homeRankingLine('2º')).toBe('Você está em 2º em presença — continue assim');
  });
});
