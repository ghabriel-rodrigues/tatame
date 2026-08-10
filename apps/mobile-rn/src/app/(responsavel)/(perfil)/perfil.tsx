/**
 * responsavel perfil tab (AUTH.20 + NOT.9): session identity, the
 * Notificações mute switch (spec 010 story 9) and "Sair" (logout).
 */

import { ProfileScreen } from '../../../components/ProfileScreen';
import { NotificationsSettingsRow } from '../../../features/notifications/NotificationsSettingsRow';

export default function ResponsavelPerfilScreen() {
  return (
    <ProfileScreen>
      <NotificationsSettingsRow />
    </ProfileScreen>
  );
}
