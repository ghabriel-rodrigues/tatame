import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DependentDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: '2015-04-20' })
  @IsDateString()
  birthDate!: string;
}

export class AcceptInviteDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '1996-02-11' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({
    type: [DependentDto],
    description:
      'Guardian (responsável) invites only: minor dependents enrolled with the guardian. Consumed by the enrollment slice.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DependentDto)
  dependents?: DependentDto[];
}

export class CreateInviteDto {
  @ApiProperty({ enum: ['student', 'guardian'] })
  @IsIn(['student', 'guardian'])
  kind!: 'student' | 'guardian';

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Turma binding (class slice)',
  })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Academy plan binding (billing slice)',
  })
  @IsOptional()
  @IsUUID()
  academyPlanId?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Absent = unlimited until expiry',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;
}
