/**
 * Notifications presentational pieces (NOT.8-9, spec 010): the home-header
 * bell with the pink unread dot (fed by GET /v1/notifications/unread-count,
 * refetched on screen focus) and the 38px rounded icon chip of the
 * aluno-20/responsavel-09 cards — pre-rendered chip label when the API sent
 * one, category icon fallback otherwise. Tones via Lumira theme tokens.
 */

import { useCallback, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Award,
  Bell,
  CalendarDays,
  ReceiptText,
  ShoppingBag,
  UserCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { Text, useTheme } from '@tatame/design-system/native';
import { api } from '../../api/query';
import { NOTIFICATIONS_TITLE } from './copy';
import type { NotificationCategory } from './types';

const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  payment: ReceiptText,
  event: CalendarDays,
  graduation: Award,
  attendance: UserCheck,
  store: ShoppingBag,
};

/**
 * Home-header bell (left of the avatar): pink `brand.accent` dot while the
 * unread count is positive — the count is 0 while the membership is muted,
 * so mute kills the dot server-side. Opens the shell's Notificações screen.
 */
export function NotificationBell({ size = 38 }: { size?: number }) {
  const theme = useTheme();
  const router = useRouter();
  const countQuery = api.useQuery('get', '/v1/notifications/unread-count');
  const refetch = countQuery.refetch;

  // Spec 010: badge refetched on screen focus. The first focus rides the
  // mount fetch; later tab returns force a fresh count.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );

  const unread = (countQuery.data?.count ?? 0) > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={NOTIFICATIONS_TITLE}
      testID="notifications-bell"
      onPress={() => router.push('/notificacoes')}
      hitSlop={6}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.bg.surface,
        borderWidth: 1,
        borderColor: theme.color.border['1'],
      }}
    >
      <Bell size={18} color={theme.color.fg['2']} />
      {unread ? (
        <View
          testID="notifications-bell-dot"
          style={{
            position: 'absolute',
            top: 8,
            right: 9,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.color.brand.accent,
            borderWidth: 1.5,
            borderColor: theme.color.bg.surface,
          }}
        />
      ) : null}
    </Pressable>
  );
}

/** 38px rounded chip: purple-tint wash, chip label or category icon. */
export function NotificationChip({
  category,
  chip,
}: {
  category: NotificationCategory;
  chip?: string | null;
}) {
  const theme = useTheme();
  const Icon = CATEGORY_ICONS[category];
  return (
    <View
      testID={chip ? undefined : `notification-icon-${category}`}
      style={{
        width: 38,
        height: 38,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.brand.tint,
      }}
    >
      {chip ? (
        <Text
          variant="caption"
          weight="bold"
          color={theme.color.purple['600']}
          numberOfLines={1}
          style={{ fontSize: 12 }}
        >
          {chip}
        </Text>
      ) : (
        <Icon size={16} color={theme.color.purple['600']} />
      )}
    </View>
  );
}
