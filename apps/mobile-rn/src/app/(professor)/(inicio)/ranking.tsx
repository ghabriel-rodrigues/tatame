/**
 * Professor full ranking (REP.11, professor-05/06): the shared RankingScreen
 * under the professor title — reached from the dashboard "Ranking de
 * presença" section. Academy-wide by design (story 20); the professor is
 * never ranked, so no "você" highlight appears (isMe is server-false).
 */

import { RankingScreen } from '../../../features/rankings/RankingScreen';
import { RANKING_TITLE_PROFESSOR } from '../../../features/rankings/copy';

export default function ProfessorRankingScreen() {
  return <RankingScreen title={RANKING_TITLE_PROFESSOR} layout="list" />;
}
