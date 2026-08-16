/**
 * Ranking fixtures for the RN suites (REP.11, spec 013). Shaped to the
 * handoff screenshots aluno-06/07 and professor-05/06 — Lucas Almeida is
 * the requesting aluno ("você" at position 2 on both segments).
 */

import type { ApiSchemas } from '@tatame/shared';

type RankingResponse = ApiSchemas['RankingResponseDto'];
type RankingRow = ApiSchemas['RankingRowDto'];

const row = (position: number, name: string, count: number, isMe = false): RankingRow => ({
  position,
  name,
  count,
  isMe,
});

export const LESSONS_WINDOW = {
  label: '2026-08',
  start: '2026-08-01',
  endExclusive: '2026-09-01',
};

export const EVENTS_WINDOW = {
  label: '2026-S2',
  start: '2026-07-01',
  endExclusive: '2027-01-01',
};

export interface RankingFixtureOptions {
  /** Marks Lucas Almeida as the requester (aluno); false for professors. */
  isMe?: boolean;
  me?: RankingResponse['me'];
}

/** aluno-06 / professor-05: Por aulas, Marina leads with 17. */
export function makeLessonsRanking(options: RankingFixtureOptions = {}): RankingResponse {
  const isMe = options.isMe ?? true;
  return {
    by: 'lessons',
    window: LESSONS_WINDOW,
    top: [
      row(1, 'Marina Costa', 17),
      row(2, 'Lucas Almeida', 14, isMe),
      row(3, 'Júlia Silveira', 13),
      row(4, 'Pedro Silveira', 12),
      row(5, 'João Ferraz', 11),
      row(6, 'Bia Andrade', 9),
      row(7, 'Tiago Mota', 8),
    ],
    me: options.me !== undefined ? options.me : isMe ? { position: 2, count: 14 } : null,
    totalRanked: 24,
  };
}

/** aluno-07 / professor-06: Por eventos, João leads with 5, Tiago has 1. */
export function makeEventsRanking(options: RankingFixtureOptions = {}): RankingResponse {
  const isMe = options.isMe ?? true;
  return {
    by: 'events',
    window: EVENTS_WINDOW,
    top: [
      row(1, 'João Ferraz', 5),
      row(2, 'Lucas Almeida', 4, isMe),
      row(3, 'Marina Costa', 4),
      row(4, 'Bia Andrade', 3),
      row(5, 'Júlia Silveira', 3),
      row(6, 'Pedro Silveira', 2),
      row(7, 'Tiago Mota', 1),
    ],
    me: options.me !== undefined ? options.me : isMe ? { position: 2, count: 4 } : null,
    totalRanked: 24,
  };
}

/** Route the two segments from one handler (`?by=` query switch). */
export function rankingBySearch(
  search: string,
  options: RankingFixtureOptions = {},
): RankingResponse {
  return search.includes('by=events')
    ? makeEventsRanking(options)
    : makeLessonsRanking(options);
}
