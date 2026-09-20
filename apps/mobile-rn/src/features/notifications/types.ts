/**
 * Local aliases over the generated contract for the notifications RN slice
 * (NOT.8-9). Same pattern as the enrollment/billing/events/store slices —
 * aliased here until a shared alias bump.
 */

import type { ApiSchemas } from '@tatame/shared';

export type NotificationItem = ApiSchemas['NotificationDto'];
export type NotificationCategory = NotificationItem['category'];
export type NotificationsPage = ApiSchemas['NotificationsListResponseDto'];
export type UnreadCountResponse = ApiSchemas['UnreadCountResponseDto'];
export type NotificationSettings =
  ApiSchemas['NotificationSettingsResponseDto'];

/** The three RN persona shells sharing the Notificações feature. */
export type NotificationPersona = 'aluno' | 'professor' | 'responsavel';
