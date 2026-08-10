/**
 * Perfil "Notificações" switch (NOT.8-9, spec 010 story 9): the ListRow +
 * switch the three perfis share, wired to GET/PUT
 * /v1/notifications/settings — the per-membership mute. Off silences the
 * unread badge only: rows keep being written (the feed doubles as the
 * receipt trail) and the screen stays reachable through the bell.
 */

import { Switch, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react-native';
import { Card, ListRow, useTheme } from '@tatame/design-system/native';
import { api } from '../../api/query';
import { NOTIFICATIONS_ROW_SUBTITLE, NOTIFICATIONS_ROW_TITLE } from './copy';
import type { NotificationSettings } from './types';

export function NotificationsSettingsRow() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const settingsQuery = api.useQuery('get', '/v1/notifications/settings');
  const updateSettings = api.useMutation('put', '/v1/notifications/settings');

  const enabled = settingsQuery.data?.enabled ?? true;

  const toggle = (next: boolean) => {
    if (updateSettings.isPending) return;
    updateSettings.mutate(
      { body: { enabled: next } },
      {
        onSuccess: (data: NotificationSettings) => {
          queryClient.setQueryData(['get', '/v1/notifications/settings'], data);
          // Mute zeroes the server-side count — the bell dot follows.
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/notifications/unread-count'],
          });
        },
      },
    );
  };

  return (
    <Card padding={0}>
      <ListRow
        title={NOTIFICATIONS_ROW_TITLE}
        subtitle={NOTIFICATIONS_ROW_SUBTITLE}
        divider={false}
        testID="perfil-notifications-row"
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
            <Bell size={15} color={theme.color.brand['2']} />
          </View>
        }
        trailing={
          <Switch
            testID="perfil-notifications-switch"
            value={enabled}
            disabled={settingsQuery.isPending || updateSettings.isPending}
            onValueChange={toggle}
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

export default NotificationsSettingsRow;
