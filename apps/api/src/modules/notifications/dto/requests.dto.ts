import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @ApiProperty({
    description:
      'The perfil "Notificações" switch — false mutes the badge (rows keep being written; the feed doubles as the receipt trail).',
  })
  @IsBoolean()
  enabled!: boolean;
}
