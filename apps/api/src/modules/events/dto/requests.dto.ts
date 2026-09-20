import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Exactly the admin form (spec 008 story 2): nome, descrição, banner
 * (gradient preset slug), local, data/horário, valor (vazio = gratuito) and
 * responsável. `@IsOptional()` also admits explicit nulls — clearing a draft
 * field is a legitimate edit.
 */
export class CreateEventDto {
  @ApiProperty({ example: 'Open mat de verão' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    example: 'event-purple-pink',
    description: 'Design-system gradient catalog slug (no image upload in v1)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  bannerPreset?: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'Tatame principal',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'ISO instant; drafts may omit it ("Data a definir")',
  })
  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    minimum: 1,
    description: 'Integer cents; omitted/null = gratuito (never 0)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  priceCents?: number | null;

  @ApiProperty({
    format: 'uuid',
    description: 'The "Responsável: Prof. …" line',
  })
  @IsUUID()
  responsibleUserId!: string;

  @ApiPropertyOptional({
    enum: ['draft', 'published'],
    description:
      'Default draft — creating and publishing are separate gestures',
  })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: 'event-purple-pink' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  bannerPreset?: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Null clears it on drafts only (published keeps date + local)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  priceCents?: number | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;
}
