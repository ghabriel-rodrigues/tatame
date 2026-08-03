/**
 * (aluno) shell (AUTH.20, rn-02): inicio/agenda/carteira/perfil tabs with
 * the glass pill tab bar; center FAB = check-in (sheet route lands with the
 * check-in slice — placeholder toast for now).
 */

import { Calendar, CreditCard, Home, QrCode, User } from 'lucide-react-native';
import { PersonaTabs } from '../../components/PersonaTabs';

export const unstable_settings = {
  initialRouteName: '(inicio)',
};

export default function AlunoLayout() {
  return (
    <PersonaTabs
      fab={{ icon: QrCode, label: 'Check-in' }}
      tabs={[
        { name: '(inicio)', title: 'Início', icon: Home },
        { name: '(agenda)', title: 'Agenda', icon: Calendar },
        { name: '(carteira)', title: 'Carteira', icon: CreditCard },
        { name: '(perfil)', title: 'Perfil', icon: User },
      ]}
    />
  );
}
