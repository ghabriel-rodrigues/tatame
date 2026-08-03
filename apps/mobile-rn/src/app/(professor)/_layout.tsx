/**
 * (professor) shell (AUTH.20, rn-02): inicio/turmas/alunos/perfil tabs;
 * center FAB = chamada (roll-call sheet lands with the attendance slice —
 * placeholder toast for now). No financial tab: professor has no financial
 * surface, structurally (charter rule).
 */

import { ClipboardList, Home, QrCode, User, Users } from 'lucide-react-native';
import { PersonaTabs } from '../../components/PersonaTabs';

export const unstable_settings = {
  initialRouteName: '(inicio)',
};

export default function ProfessorLayout() {
  return (
    <PersonaTabs
      fab={{ icon: QrCode, label: 'Chamada' }}
      tabs={[
        { name: '(inicio)', title: 'Início', icon: Home },
        { name: '(turmas)', title: 'Turmas', icon: ClipboardList },
        { name: '(alunos)', title: 'Alunos', icon: Users },
        { name: '(perfil)', title: 'Perfil', icon: User },
      ]}
    />
  );
}
