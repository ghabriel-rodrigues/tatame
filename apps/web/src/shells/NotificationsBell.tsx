/**
 * NOT.7 — admin console bell (spec 010): unread dot fed by
 * `/v1/notifications/unread-count`, dropdown panel with the feed cards
 * (chip, title, body, relative PT-BR timestamp). Opening the panel fires
 * `read-all` and kills the dot; cards with an admin-relevant semantic route
 * navigate, the rest are inert. Admin surface only — the plataforma console
 * renders no bell in v1 (platform notifications are recorded debt).
 */
import { useState, type MouseEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import type { NotificationCategory, NotificationView } from '@tatame/shared';
import { $api, queryClient } from '../api/api';
import { adminRouteFor, relativeNotificationTime } from './notifications-format';

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.73 21a2 2 0 0 1-3.46 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 14px fallback glyphs when a row carries no pre-rendered chip label. */
const CATEGORY_ICONS: Record<NotificationCategory, ReactNode> = {
  payment: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2v20M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  event: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2.4" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  graduation: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="6" stroke="currentColor" strokeWidth="2.4" />
      <path d="M8.5 14 7 22l5-3 5 3-1.5-8" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  ),
  attendance: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12.5 9.5 18 20 6.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  store: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 8h14l-1 13H6L5 8Zm3 0a4 4 0 0 1 8 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

function NotificationCard({
  notification,
  onNavigate,
}: {
  notification: NotificationView;
  onNavigate: (path: string) => void;
}) {
  const target = adminRouteFor(notification.route);

  const content = (
    <>
      <Box
        aria-hidden="true"
        data-testid={
          notification.chip
            ? undefined
            : `notification-icon-${notification.category}`
        }
        sx={{
          width: 38,
          height: 38,
          borderRadius: '12px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--purple-50)',
          color: 'var(--purple-600)',
          fontSize: 12.5,
          fontWeight: 700,
        }}
      >
        {notification.chip ?? CATEGORY_ICONS[notification.category]}
      </Box>
      <Box sx={{ minWidth: 0, textAlign: 'left' }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg-1)' }}>
          {notification.title}
        </Typography>
        {notification.body ? (
          <Typography sx={{ fontSize: 12, color: 'var(--fg-2)' }}>
            {notification.body}
          </Typography>
        ) : null}
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-3)' }}>
          {relativeNotificationTime(notification.createdAt)}
        </Typography>
      </Box>
    </>
  );

  const rowSx = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    width: '100%',
    padding: '10px 16px',
  } as const;

  if (!target) {
    return (
      <Box role="listitem" sx={rowSx}>
        {content}
      </Box>
    );
  }
  return (
    <ButtonBase
      role="listitem"
      onClick={() => onNavigate(target)}
      sx={{ ...rowSx, justifyContent: 'flex-start' }}
    >
      {content}
    </ButtonBase>
  );
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;

  const unread = $api.useQuery('get', '/v1/notifications/unread-count', undefined, {
    refetchInterval: 60_000,
  });
  const feed = $api.useQuery('get', '/v1/notifications', undefined, { enabled: open });
  const readAll = $api.useMutation('post', '/v1/notifications/read-all', {
    onSuccess: () => {
      // The server flipped every row; pin the badge locally, no refetch race.
      queryClient.setQueriesData(
        { queryKey: ['get', '/v1/notifications/unread-count'] },
        { count: 0 },
      );
    },
  });

  const hasUnread = (unread.data?.count ?? 0) > 0;
  const notifications = feed.data?.notifications ?? [];

  function handleOpen(event: MouseEvent<HTMLButtonElement>) {
    setAnchor(event.currentTarget);
    readAll.mutate({});
  }

  function handleNavigate(path: string) {
    setAnchor(null);
    void navigate(path);
  }

  return (
    <>
      <IconButton
        aria-label="Notificações"
        onClick={handleOpen}
        sx={{ position: 'relative', color: 'var(--fg-2)' }}
      >
        <BellIcon />
        {hasUnread ? (
          <Box
            component="span"
            data-testid="notifications-unread-dot"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 9,
              height: 9,
              borderRadius: '999px',
              background: 'var(--pink-500)',
              border: '2px solid var(--bg-surface)',
            }}
          />
        ) : null}
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box
          role="region"
          aria-label="Painel de notificações"
          sx={{ width: 360, maxHeight: 440, overflowY: 'auto', paddingBottom: '6px' }}
        >
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--fg-1)',
              padding: '14px 16px 8px',
            }}
          >
            Notificações
          </Typography>
          {feed.isPending ? (
            <Typography sx={{ fontSize: 12.5, color: 'var(--fg-3)', padding: '4px 16px 12px' }}>
              Carregando…
            </Typography>
          ) : notifications.length === 0 ? (
            <Typography sx={{ fontSize: 12.5, color: 'var(--fg-3)', padding: '4px 16px 12px' }}>
              Nenhuma notificação
            </Typography>
          ) : (
            <Stack role="list" aria-label="Notificações recebidas">
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onNavigate={handleNavigate}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Popover>
    </>
  );
}
