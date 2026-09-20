import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ACADEMY_ROLES, type AcademyRole } from '../../../common/decorators.js';

export class PermissionEntryDto {
  @ApiProperty({ enum: ACADEMY_ROLES })
  @IsIn([...ACADEMY_ROLES])
  role!: AcademyRole;

  @ApiProperty({ example: 'invites.create' })
  @IsString()
  key!: string;

  @ApiProperty()
  @IsBoolean()
  allowed!: boolean;
}

export class UpdatePermissionsDto {
  @ApiProperty({ type: [PermissionEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  entries!: PermissionEntryDto[];
}
