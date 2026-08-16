/**
 * Ranking PT-BR copy (REP.11, spec 013). The selos footnote is static copy
 * by recorded decision (badge computation is not a v1 feature) and is
 * adapted per segment — fixing the professor-06 prototype bug where the
 * "12+ aulas" Constância line rendered on the Por eventos segment too.
 */

import type { RankingBy } from './types';

export const RANKING_TITLE_ALUNO = 'Ranking do mês';
export const RANKING_TITLE_PROFESSOR = 'Ranking de presença';

export const SEGMENT_AULAS = 'Por aulas';
export const SEGMENT_EVENTOS = 'Por eventos';

/** Selo name highlighted inside the footnote card (pink ink per prototype). */
export const SELO_CONSTANCIA = 'Constância';
export const SELO_ESPIRITO = 'Espírito de equipe';

interface FootnoteCopy {
  /** Text before the highlighted selo name. */
  lead: string;
  selo: string;
  /** Text after the selo name. */
  tail: string;
}

/** Per-segment selos footnote (spec 013 story 17, prototype bug fixed). */
export function seloFootnote(by: RankingBy): FootnoteCopy {
  if (by === 'events') {
    return { lead: 'Presença em eventos vale o selo ', selo: SELO_ESPIRITO, tail: '.' };
  }
  return { lead: '12+ aulas no mês valem o selo ', selo: SELO_CONSTANCIA, tail: '.' };
}

/** Aluno home entry card line (aluno-03): "Você está em 2º em presença…". */
export function homeRankingLine(positionOrdinal: string): string {
  return `Você está em ${positionOrdinal} em presença — continue assim`;
}
