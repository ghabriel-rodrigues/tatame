/**
 * professor perfil tab (AUTH.20 + GRD.17, professor-12): session identity +
 * own belt chip (display-only membership rank) + the "Graduações válidas"
 * card — the academy's merged régua as belt chips, kids belts reflecting
 * the admin toggles (dimmed when disabled) — fed by GET
 * /v1/professor/profile. "Sair" stays.
 */

import { View } from 'react-native';
import { BeltChip, Card, Text, useTheme } from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { beltChipLabel } from '../../../features/graduation/format';

export default function ProfessorPerfilScreen() {
  const theme = useTheme();
  const profileQuery = api.useQuery('get', '/v1/professor/profile');
  const profile = profileQuery.data;
  const belt = profile?.belt ?? null;

  return (
    <ProfileScreen
      identityExtra={
        belt ? (
          <View style={{ flexDirection: 'row', marginTop: theme.space['2'] }}>
            <BeltChip belt={belt} label={beltChipLabel(belt)} testID="perfil-belt-chip" />
          </View>
        ) : null
      }
    >
      {profile ? (
        <Card testID="valid-graduations-card">
          <View style={{ gap: theme.space['3'] }}>
            <Text variant="subtitle">Graduações válidas</Text>
            <Text variant="caption">
              Definição conjunta com o admin, para toda a academia. Faixas infantis
              desativadas aparecem esmaecidas.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space['2'] }}>
              {profile.validGraduations.map((item) => (
                <BeltChip
                  key={item.beltId}
                  belt={item}
                  dimmed={!item.enabled}
                  testID={`valid-belt-${item.beltId}`}
                />
              ))}
            </View>
          </View>
        </Card>
      ) : null}
    </ProfileScreen>
  );
}
