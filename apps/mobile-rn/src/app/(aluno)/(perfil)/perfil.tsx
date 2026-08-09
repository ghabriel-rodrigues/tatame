/**
 * aluno perfil tab (AUTH.20 + GRD.16): session identity + the derived belt
 * chip (fed by the home graduation payload — rank consistent everywhere,
 * story 7) with a "Ver graduação" entry into the Graduação screen +
 * "Sair".
 */

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BeltChip, TatameButton, useTheme } from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { beltChipLabel } from '../../../features/graduation/format';

export default function AlunoPerfilScreen() {
  const theme = useTheme();
  const router = useRouter();
  const homeQuery = api.useQuery('get', '/v1/aluno/home');
  const belt = homeQuery.data?.graduation?.belt ?? null;

  return (
    <ProfileScreen
      identityExtra={
        belt ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space['2'],
              marginTop: theme.space['2'],
            }}
          >
            <BeltChip belt={belt} label={beltChipLabel(belt)} testID="perfil-belt-chip" />
            <TatameButton
              size="sm"
              variant="ghost"
              label="Ver graduação"
              onPress={() => router.push('/graduacao')}
            />
          </View>
        ) : null
      }
    />
  );
}
