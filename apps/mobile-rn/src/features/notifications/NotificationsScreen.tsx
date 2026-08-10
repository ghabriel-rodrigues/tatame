/**
 * Notificações screen (NOT.8-9, aluno-20/responsavel-09): shared by the
 * three persona shells — back-arrow header, card rows (38px icon chip,
 * bold 13.5 title, 12 body, 11 relative PT-BR timestamp), cursor
 * pagination on scroll and the empty state. Opening the screen fires
 * POST /read-all (the dot dies — spec 010 story 8); rows with a semantic
 * route hint navigate through this persona's shell-route map, unknown or
 * null hints render inert cards. Row content arrives render-ready from
 * the API — the screen composes nothing.
 */

import { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';
import { Card, Text, fadeUp, useTheme } from '@tatame/design-system/native';
import { api } from '../../api/query';
import { QueryState } from '../enrollment/ui';
import {
  EMPTY_NOTIFICATIONS,
  EMPTY_NOTIFICATIONS_CAPTION,
  NOTIFICATIONS_TITLE,
} from './copy';
import { relativeDayPt } from './format';
import { shellRouteFor } from './routes';
import { NotificationChip } from './ui';
import type { NotificationItem, NotificationPersona, NotificationsPage } from './types';

/** Start loading the next page within this distance of the bottom (px). */
const END_REACHED_THRESHOLD = 320;

function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (() => void) | null;
}) {
  const theme = useTheme();
  const content = (
    <Card padding={theme.space['4']}>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space['3'] }}
      >
        <NotificationChip category={item.category} chip={item.chip} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="label" weight="semibold" style={{ fontSize: 13.5 }}>
            {item.title}
          </Text>
          {item.body ? (
            <Text variant="caption" style={{ fontSize: 12 }}>
              {item.body}
            </Text>
          ) : null}
        </View>
        <Text
          variant="caption"
          color={theme.color.fg['4']}
          style={{ fontSize: 11 }}
        >
          {relativeDayPt(item.createdAt)}
        </Text>
      </View>
    </Card>
  );
  if (!onPress) return <View testID={`notification-${item.id}`}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      testID={`notification-${item.id}`}
    >
      {content}
    </Pressable>
  );
}

export function NotificationsScreen({ persona }: { persona: NotificationPersona }) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const listQuery = api.useInfiniteQuery(
    'get',
    '/v1/notifications',
    {},
    {
      // openapi-fetch drops null query params — the first page goes cursorless.
      initialPageParam: null,
      getNextPageParam: (lastPage: NotificationsPage) => lastPage.nextCursor ?? null,
    },
  );
  const readAll = api.useMutation('post', '/v1/notifications/read-all');

  // Story 8: opening the screen clears the unread badge — idempotent
  // server-side, fired exactly once per mount.
  const readAllFired = useRef(false);
  const readAllMutate = readAll.mutate;
  useEffect(() => {
    if (readAllFired.current) return;
    readAllFired.current = true;
    readAllMutate(
      {},
      {
        onSuccess: () =>
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/notifications/unread-count'],
          }),
      },
    );
  }, [readAllMutate, queryClient]);

  const notifications = listQuery.data?.pages.flatMap((page) => page.notifications) ?? [];

  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    const distanceFromEnd =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (
      distanceFromEnd < END_REACHED_THRESHOLD &&
      listQuery.hasNextPage &&
      !listQuery.isFetchingNextPage
    ) {
      void listQuery.fetchNextPage();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        testID="notifications-scroll"
        onScroll={onScroll}
        scrollEventThrottle={80}
        contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}
      >
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              onPress={() => router.back()}
              hitSlop={8}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.color.border['1'],
                backgroundColor: theme.color.bg.surface,
              }}
            >
              <ChevronLeft size={18} color={theme.color.fg['2']} />
            </Pressable>
            <Text variant="subtitle" weight="bold">
              {NOTIFICATIONS_TITLE}
            </Text>
          </View>

          <QueryState loading={listQuery.isPending} error={listQuery.isError}>
            {notifications.length === 0 ? (
              <Card testID="notifications-empty">
                <View style={{ gap: 4 }}>
                  <Text variant="label">{EMPTY_NOTIFICATIONS}</Text>
                  <Text variant="caption">{EMPTY_NOTIFICATIONS_CAPTION}</Text>
                </View>
              </Card>
            ) : (
              notifications.map((item) => {
                const target = shellRouteFor(persona, item.route);
                return (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onPress={target ? () => router.push(target) : null}
                  />
                );
              })
            )}
            {listQuery.isFetchingNextPage ? (
              <Text variant="caption" testID="notifications-loading-more">
                Carregando…
              </Text>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default NotificationsScreen;
