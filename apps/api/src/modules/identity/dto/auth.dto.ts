import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MinLength,
} from 'class-validator';

/** cookie = web (httpOnly refresh cookie); body = mobile secure storage. */
export type RefreshTransport = 'cookie' | 'body';

export class LoginDto {
  @ApiProperty({ example: 'admin@tatame.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({ enum: ['cookie', 'body'], default: 'cookie' })
  @IsOptional()
  @IsIn(['cookie', 'body'])
  transport?: RefreshTransport;
}

export class TotpLoginDto {
  @ApiProperty()
  @IsString()
  challengeToken!: string;

  @ApiProperty({ description: 'TOTP code or single-use recovery code' })
  @IsString()
  @Length(6, 12)
  code!: string;

  @ApiPropertyOptional({ enum: ['cookie', 'body'], default: 'cookie' })
  @IsOptional()
  @IsIn(['cookie', 'body'])
  transport?: RefreshTransport;
}

export class RefreshDto {
  @ApiPropertyOptional({
    description: 'Required for body transport; web uses the cookie',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({ enum: ['cookie', 'body'], default: 'cookie' })
  @IsOptional()
  @IsIn(['cookie', 'body'])
  transport?: RefreshTransport;
}

export class SwitchMembershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  membershipId!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class TotpEnableDto {
  @ApiProperty({ description: 'Code from the authenticator app' })
  @IsString()
  @Length(6, 12)
  code!: string;
}
