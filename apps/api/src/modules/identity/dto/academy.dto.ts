import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsString,
  Length,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { HEX_COLOR_RE } from '../lib/brand.js';

const HEX_MESSAGE = 'each brand color must be a #RRGGBB hex';

/**
 * The 3-color brand input (spec 011, CFG.4). Any hex case is accepted here —
 * the service normalizes to uppercase before it reaches the DB CHECK. A
 * partial triplet can never validate: all three members are required.
 */
export class BrandInputDto {
  @ApiProperty({ example: '#14213D', pattern: '^#[0-9a-fA-F]{6}$' })
  @IsString()
  @Matches(HEX_COLOR_RE, { message: HEX_MESSAGE })
  deep!: string;

  @ApiProperty({ example: '#3A5FA8', pattern: '^#[0-9a-fA-F]{6}$' })
  @IsString()
  @Matches(HEX_COLOR_RE, { message: HEX_MESSAGE })
  vibrant!: string;

  @ApiProperty({ example: '#E63946', pattern: '^#[0-9a-fA-F]{6}$' })
  @IsString()
  @Matches(HEX_COLOR_RE, { message: HEX_MESSAGE })
  accent!: string;
}

/** Full-document PUT: name + brand triplet (null clears) + the toggle. */
export class UpdateAcademyDto {
  @ApiProperty({ minLength: 2, maxLength: 80, example: 'Alpha Jiu-Jitsu' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({
    type: BrandInputDto,
    nullable: true,
    description: 'White-label triplet; null clears back to the default Tatame brand',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => BrandInputDto)
  brand!: BrandInputDto | null;

  @ApiProperty({ description: 'Gates the automatic notification fan-out tenant-wide' })
  @IsBoolean()
  autoNotificationsEnabled!: boolean;
}
