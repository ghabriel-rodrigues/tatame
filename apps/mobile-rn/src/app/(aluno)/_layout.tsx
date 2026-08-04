/**
 * (aluno) shell (AUTH.20, rn-02): inicio/agenda/carteira/perfil tabs with
 * the glass pill tab bar; center FAB = check-in — opens the ATT.15 sheet
 * (also reachable from the home hero via the sheet store).
 */

import { Calendar, CreditCard, Home, QrCode, User } from 'lucide-react-native';
import { PersonaTabs } from '../../components/PersonaTabs';
import { CheckinSheet } from '../../features/attendance/CheckinSheet';
import {
  closeCheckinSheet,
  openCheckinSheet,
  useCheckinSheetOpen,
} from '../../features/attendance/checkin-sheet-store';

export const unstable_settings = {
  initialRouteName: '(inicio)',
};

export default function AlunoLayout() {
  const sheetOpen = useCheckinSheetOpen();
  return (
    <>
      <PersonaTabs
        fab={{ icon: QrCode, label: 'Check-in', onPress: openCheckinSheet }}
        tabs={[
          { name: '(inicio)', title: 'Início', icon: Home },
          { name: '(agenda)', title: 'Agenda', icon: Calendar },
          { name: '(carteira)', title: 'Carteira', icon: CreditCard },
          { name: '(perfil)', title: 'Perfil', icon: User },
        ]}
      />
      <CheckinSheet open={sheetOpen} onClose={closeCheckinSheet} />
    </>
  );
}
