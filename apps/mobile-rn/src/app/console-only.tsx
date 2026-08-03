/**
 * console-only (AUTH.19, rn-02): admin and platform roles are web consoles
 * — the mobile inverse of web's "/baixe-o-app" landing. No shell is
 * scaffolded for these personas (rn-04: "do not scaffold their shells").
 */

import { SessionNotice } from '../components/SessionNotice';
import { ROLE_LABELS } from '../session/role-labels';
import { useSession } from '../session/session-store';

export default function ConsoleOnlyScreen() {
  const { session } = useSession();
  const roleLabel = session ? ROLE_LABELS[session.activeRole] : 'Admin';
  return (
    <SessionNotice
      title="Use o console web"
      body={`Contas de ${roleLabel} são gerenciadas no console web do Tatame. Acesse pelo navegador do seu computador para continuar.`}
    />
  );
}
