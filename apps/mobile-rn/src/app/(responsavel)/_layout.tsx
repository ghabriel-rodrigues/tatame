/**
 * (responsavel) shell (AUTH.20 + ENR.20, rn-02): inicio/pagamentos/eventos/
 * perfil tabs; center FAB = cadastrar filho, now wired to the real sheet.
 * When the academy turned the dependents.register toggle off the sheet host
 * renders nothing and the FAB explains the denial instead (story 36 —
 * hidden client-side, enforced server-side).
 */

import { useState } from 'react';
import { View } from 'react-native';
import { CalendarDays, CreditCard, Home, User, UserPlus } from 'lucide-react-native';
import { Toast } from '@tatame/design-system/native';
import { PersonaTabs } from '../../components/PersonaTabs';
import { canRegisterDependents } from '../../features/enrollment/permissions';
import { openRegisterDependentSheet } from '../../features/enrollment/register-sheet-store';
import { RegisterDependentSheetHost } from '../../features/enrollment/RegisterDependentSheet';
import { useSession } from '../../session/session-store';

export const unstable_settings = {
  initialRouteName: '(inicio)',
};

export default function ResponsavelLayout() {
  const { session } = useSession();
  const canRegister = canRegisterDependents(session);
  const [deniedToast, setDeniedToast] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <PersonaTabs
        fab={{
          icon: UserPlus,
          label: 'Cadastrar filho',
          onPress: () =>
            canRegister ? openRegisterDependentSheet() : setDeniedToast(true),
        }}
        tabs={[
          { name: '(inicio)', title: 'Início', icon: Home },
          { name: '(pagamentos)', title: 'Pagamentos', icon: CreditCard },
          { name: '(eventos)', title: 'Eventos', icon: CalendarDays },
          { name: '(perfil)', title: 'Perfil', icon: User },
        ]}
      />
      <RegisterDependentSheetHost />
      <Toast
        open={deniedToast}
        onClose={() => setDeniedToast(false)}
        message="Cadastro de alunos desabilitado pela academia."
        offsetBottom={110}
      />
    </View>
  );
}
