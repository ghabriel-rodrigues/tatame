/**
 * suspended (AUTH.19): blocking screen for members of a suspended academy —
 * suspension blocks everything except this screen and logout (spec story
 * 38). Reactivation is instant server-side; the next bootstrap unblocks.
 */

import { SessionNotice } from '../components/SessionNotice';
import { useSession } from '../session/session-store';

export default function SuspendedScreen() {
  const { session } = useSession();
  const academyName = session?.academy?.name ?? 'sua academia';
  return (
    <SessionNotice
      title="Academia suspensa"
      body={`O acesso de ${academyName} está temporariamente suspenso. Fale com a administração da academia para regularizar a situação.`}
    />
  );
}
