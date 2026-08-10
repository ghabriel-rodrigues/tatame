/**
 * Perfil "Tema escuro" switch (CFG.13, spec 011 stories 17-20): the aluno
 * perfil row (moon icon + switch, per the aluno prototype's settings card)
 * wired to the persisted theme-mode store — flipping it re-renders the
 * whole shell on the dark token set + brand overlay (aluno-21) and the
 * status bar follows. Per-device preference, no server involvement.
 */

import { Switch, View } from 'react-native';
import { Moon } from 'lucide-react-native';
import { Card, ListRow, useTheme } from '@tatame/design-system/native';
import { setThemeMode, useThemePreferences } from './theme-store';

export function DarkThemeRow() {
  const theme = useTheme();
  const { mode } = useThemePreferences();
  const dark = mode === 'dark';

  return (
    <Card padding={0}>
      <ListRow
        title="Tema escuro"
        divider={false}
        testID="perfil-dark-theme-row"
        leading={
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: theme.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.color.brand.tint,
            }}
          >
            <Moon size={15} color={theme.color.brand['2']} />
          </View>
        }
        trailing={
          <Switch
            testID="perfil-dark-theme-switch"
            value={dark}
            onValueChange={(next) => void setThemeMode(next ? 'dark' : 'light')}
            trackColor={{
              false: theme.color.bg.sunken,
              true: theme.color.brand['2'],
            }}
          />
        }
      />
    </Card>
  );
}

export default DarkThemeRow;
