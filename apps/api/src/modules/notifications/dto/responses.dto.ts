import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pipeline).
 * Controllers return the service objects untouched.
 */

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: ['payment', 'event', 'graduation', 'attendance', 'store'],
  })
  category!: 'payment' | 'event' | 'graduation' | 'attendance' | 'store';

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'R$',
    description:
      'Pre-rendered chip label ("R$", "15", "2º", initials); null = client falls back to the category icon',
  })
  chip!: string | null;

  @ApiProperty({ example: 'Mensalidade de agosto disponível' })
  title!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'Vence em 05/08 · R$ 180,00',
  })
  body!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'wallet',
    description:
      "Semantic deep-link hint (wallet, event/{eventId}, graduation, orders, store) — mapped to each shell's local navigation; unknown/null routes are inert",
  })
  route!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  readAt!: string | null;

  @ApiProperty({
    format: 'date-time',
    description: 'Clients render the relative PT-BR timestamp',
  })
  createdAt!: string;
}

export class NotificationsListResponseDto {
  @ApiProperty({
    type: [NotificationDto],
    description: 'Own rows, newest first (~30 per page)',
  })
  notifications!: NotificationDto[];

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Opaque keyset cursor for the next page; null = no further pages',
  })
  nextCursor!: string | null;
}

export class UnreadCountResponseDto {
  @ApiProperty({ description: '0 while the active membership is muted' })
  count!: number;
}

export class MarkReadResponseDto {
  @ApiProperty({ type: NotificationDto })
  notification!: NotificationDto;
}

export class MarkAllReadResponseDto {
  @ApiProperty({ description: 'Rows flipped unread → read by this call' })
  updated!: number;
}

export class NotificationSettingsResponseDto {
  @ApiProperty({
    description: "The active membership's notifications_enabled flag",
  })
  enabled!: boolean;
}
