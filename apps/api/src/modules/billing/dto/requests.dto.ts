import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Card sheet metadata. The PAN/validade/CVV NEVER travel to this API — at
 * the Stripe stage the client tokenizes with the provider SDK and only the
 * token/mandate reference reaches the backend; the simulated driver needs
 * nothing at all. Only display metadata is accepted.
 */
export class CardDetailsDto {
  @ApiPropertyOptional({ description: 'Nome impresso (display only)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  holderName?: string;

  @ApiPropertyOptional({ description: 'Display last4 (client-derived)' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  last4?: string;
}

export class CreateChargePaymentDto {
  @ApiProperty({ enum: ['pix', 'boleto', 'card'] })
  @IsIn(['pix', 'boleto', 'card'])
  method!: 'pix' | 'boleto' | 'card';

  @ApiPropertyOptional({
    description:
      '"Usar este cartão na recorrência mensal" — card only (422 billing.method_mandate_mismatch otherwise); creates the mandate in the same gesture.',
  })
  @IsOptional()
  @IsBoolean()
  recurrence?: boolean;

  @ApiPropertyOptional({ type: CardDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardDetailsDto)
  card?: CardDetailsDto;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'Mensal' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ minimum: 1, description: 'Integer cents (R$ 180,00 = 18000)' })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({ enum: ['monthly', 'quarterly', 'semiannual', 'yearly'] })
  @IsIn(['monthly', 'quarterly', 'semiannual', 'yearly'])
  recurrence!: 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

  @ApiProperty({
    minimum: 1,
    maximum: 28,
    description: 'Vencimento day — UI offers the handoff chips 5/10/15',
  })
  @IsInt()
  @Min(1)
  @Max(28)
  dueDay!: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ example: 'Mensal' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @ApiPropertyOptional({ enum: ['monthly', 'quarterly', 'semiannual', 'yearly'] })
  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'semiannual', 'yearly'])
  recurrence?: 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

  @ApiPropertyOptional({ minimum: 1, maximum: 28 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dueDay?: number;
}

export class RefundPaymentDto {
  @ApiPropertyOptional({ description: 'Estorno reason, recorded on the payment + audit' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
