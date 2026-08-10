/**
 * professor perfil tab (AUTH.20 + GRD.17, professor-12): session identity +
 * own belt chip (display-only membership rank) + the "Graduações válidas"
 * card — the academy's merged régua as belt chips, kids belts reflecting
 * the admin toggles (dimmed when disabled) — fed by GET
 * /v1/professor/profile. "Loja da academia" row opening the shared vitrine
 * (STO.10, spec 009 story 17 — per professor-13 the perfil row is the
 * professor's entry; consumer-side only, no tab-bar change). "Sair" stays.
 */

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BeltChip, Card, ListRow, Text, useTheme } from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { beltChipLabel } from '../../../features/graduation/format';
import { NotificationsSettingsRow } from '../../../features/notifications/NotificationsSettingsRow';
import { STORE_ROW_TITLE, STORE_SUBTITLE } from '../../../features/store/copy';

export default function ProfessorPerfilScreen() {
  const theme = useTheme();
  const router = useRouter();
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
      <Card padding={0}>
        <ListRow
          title={STORE_ROW_TITLE}
          subtitle={STORE_SUBTITLE}
          chevron
          divider={false}
          onPress={() => router.push('/loja')}
          testID="perfil-loja-row"
        />
      </Card>
      {/* NOT.9: the per-membership mute switch (spec 010 story 9). */}
      <NotificationsSettingsRow />
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
