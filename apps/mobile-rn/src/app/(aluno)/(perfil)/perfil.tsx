/**
 * aluno perfil tab (AUTH.20 + GRD.16 + STO.10): session identity + the
 * derived belt chip (fed by the home graduation payload — rank consistent
 * everywhere, story 7) with a "Ver graduação" entry into the Graduação
 * screen, the "Loja da academia" row with its "Novo" pill opening the
 * vitrine (spec 009 story 16 — the dead shortcut finally works) + the real
 * "Tema escuro" switch (CFG.13, spec 011) + "Sair".
 */

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BeltChip,
  Card,
  Chip,
  ListRow,
  TatameButton,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { beltChipLabel } from '../../../features/graduation/format';
import { NotificationsSettingsRow } from '../../../features/notifications/NotificationsSettingsRow';
import { STORE_ROW_TITLE, STORE_SUBTITLE } from '../../../features/store/copy';
import { DarkThemeRow } from '../../../theme/DarkThemeRow';

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
    >
      <Card padding={0}>
        <ListRow
          title={STORE_ROW_TITLE}
          subtitle={STORE_SUBTITLE}
          trailing={<Chip label="Novo" tone="brand" testID="loja-novo-pill" />}
          chevron
          divider={false}
          onPress={() => router.push('/loja')}
          testID="perfil-loja-row"
        />
      </Card>
      {/* NOT.8: the per-membership mute switch (spec 010 story 9). */}
      <NotificationsSettingsRow />
      {/* CFG.13: the real dark-theme switch (per-device, persisted). */}
      <DarkThemeRow />
    </ProfileScreen>
  );
}
