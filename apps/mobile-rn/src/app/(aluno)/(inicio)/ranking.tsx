/**
 * Aluno full ranking (REP.11, aluno-06/07): the shared RankingScreen under
 * the aluno title — reached from the home "Ranking do mês" entry card.
 */

import { RankingScreen } from '../../../features/rankings/RankingScreen';
import { RANKING_TITLE_ALUNO } from '../../../features/rankings/copy';

export default function AlunoRankingScreen() {
  return <RankingScreen title={RANKING_TITLE_ALUNO} />;
}
