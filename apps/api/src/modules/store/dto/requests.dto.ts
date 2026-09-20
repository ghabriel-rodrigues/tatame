import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Kimonos',
    description: '"+ Nova categoria" — unique per academy',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
}

export class RenameCategoryDto extends CreateCategoryDto {}

/**
 * Exactly the admin-06 form: nome, preço, estoque (+ threshold), categoria,
 * tags (the comma input, already split client-side), tamanhos. Monogram and
 * gradient preset are derived/cycled at creation but overridable — the seeds
 * pin the prototype letters the same way.
 */
export class CreateProductDto {
  @ApiProperty({ example: 'Kimono Oficial' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({
    minimum: 1,
    description: 'Integer cents — a product always costs something',
  })
  @IsInt()
  @Min(1)
  priceCents!: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @ApiPropertyOptional({
    minimum: 0,
    default: 5,
    description: 'Per-product "estoque baixo" cut-off (story 7)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'Rendered as #chips, searched by the vitrine',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Size pills; empty = product has no sizes',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(10, { each: true })
  sizes?: string[];

  @ApiPropertyOptional({
    example: 'GI',
    description: '1–3 letters; derived from the name when omitted',
  })
  @IsOptional()
  @IsString()
  @Length(1, 3)
  monogram?: string;

  @ApiPropertyOptional({
    example: 'store-blue-purple',
    description:
      'Design-system gradient catalog slug; cycles the catalog when omitted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  gradientPreset?: string;
}

export class UpdateProductDto {
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

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  priceCents?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(10, { each: true })
  sizes?: string[];

  @ApiPropertyOptional({ example: 'GI' })
  @IsOptional()
  @IsString()
  @Length(1, 3)
  monogram?: string;

  @ApiPropertyOptional({ example: 'store-teal-green' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  gradientPreset?: string;
}

/** "Comprar com Pix · R$ X" — one product, optional size, quantity ≥ 1. */
export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Required iff the product defines sizes; must be one of its pills',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  size?: string | null;

  @ApiProperty({
    minimum: 1,
    description: 'Capped by available stock at creation',
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}

/** Store purchases are Pix-only in v1 (the prototype's single CTA). */
export class CreateOrderChargePaymentDto {
  @ApiProperty({ enum: ['pix'] })
  @IsIn(['pix'])
  method!: 'pix';
}

export class OrderStatusTransitionDto {
  @ApiProperty({
    enum: ['ready', 'delivered', 'canceled'],
    description:
      'ready = Em andamento (from paid), delivered = Entregue (from ready, terminal), ' +
      'canceled = Cancelado (from paid/ready — runs the audited Pix refund). ' +
      '`paid` is never set by hand: payment truth comes only from the provider-event handler.',
  })
  @IsIn(['ready', 'delivered', 'canceled'])
  status!: 'ready' | 'delivered' | 'canceled';
}
