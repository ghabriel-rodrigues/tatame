/**
 * (responsavel) shell (AUTH.20, rn-02): inicio/pagamentos/eventos/perfil
 * tabs; center FAB = cadastrar filho (stepped flow lands with the
 * dependents slice — placeholder toast for now).
 */

import { CalendarDays, CreditCard, Home, User, UserPlus } from 'lucide-react-native';
import { PersonaTabs } from '../../components/PersonaTabs';

export const unstable_settings = {
  initialRouteName: '(inicio)',
};

export default function ResponsavelLayout() {
  return (
    <PersonaTabs
      fab={{ icon: UserPlus, label: 'Cadastrar filho' }}
      tabs={[
        { name: '(inicio)', title: 'Início', icon: Home },
        { name: '(pagamentos)', title: 'Pagamentos', icon: CreditCard },
        { name: '(eventos)', title: 'Eventos', icon: CalendarDays },
        { name: '(perfil)', title: 'Perfil', icon: User },
      ]}
    />
  );
}
