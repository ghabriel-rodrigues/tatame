/**
 * Rankings contract aliases (REP.11, spec 013). Local mirror over the shared
 * schema — UI code never digs through `components["schemas"]` directly.
 */

import type { ApiSchemas } from '@tatame/shared';

export type RankingRow = ApiSchemas['RankingRowDto'];
export type RankingMe = ApiSchemas['RankingMeDto'];
export type RankingResponse = ApiSchemas['RankingResponseDto'];
export type ReportWindow = ApiSchemas['ReportWindowDto'];

/** The two segments (aluno-06/07, professor-05/06). */
export type RankingBy = RankingResponse['by'];
