import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pipeline).
 * Controllers return the service objects untouched.
 */

export class StoreCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Kimonos' })
  name!: string;

  @ApiProperty({ description: 'The chip count, derived on read' })
  productCount!: number;
}

export class StoreCategoriesResponseDto {
  @ApiProperty({ type: [StoreCategoryDto] })
  categories!: StoreCategoryDto[];
}

/** The vitrine/product-row card base every surface renders. */
export class ProductCardDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Kimono Oficial' })
  name!: string;

  @ApiProperty({ description: 'Integer cents' })
  priceCents!: number;

  @ApiProperty({ example: 'GI', description: '1–3 letters on the gradient tile' })
  monogram!: string;

  @ApiProperty({ example: 'store-blue-purple', description: 'Design-system gradient slug' })
  gradientPreset!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  categoryId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  categoryName!: string | null;
}

export class ProductDetailDto extends ProductCardDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ type: [String], description: 'Rendered as #chips' })
  tags!: string[];

  @ApiProperty({ type: [String], description: 'Size pills; empty = no sizes' })
  sizes!: string[];

  @ApiProperty({ description: 'Caps the quantity stepper; may go negative (recorded oversell)' })
  stockQty!: number;
}

export class AdminProductDto extends ProductDetailDto {
  @ApiProperty({ minimum: 0 })
  lowStockThreshold!: number;

  @ApiProperty({ enum: ['active', 'archived'] })
  status!: 'active' | 'archived';

  @ApiProperty({ description: 'Derived: active AND stock_qty <= low_stock_threshold' })
  lowStock!: boolean;

  @ApiProperty({ description: '"N vendidos" — Σ quantities across paid/ready/delivered orders' })
  soldCount!: number;
}

export class AdminProductsResponseDto {
  @ApiProperty({ type: [AdminProductDto] })
  products!: AdminProductDto[];
}

export class VitrineCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class VitrineResponseDto {
  @ApiProperty({ type: [ProductCardDto], description: 'Active products only' })
  products!: ProductCardDto[];

  @ApiProperty({
    type: [VitrineCategoryDto],
    description: 'The "Tudo + chips" carousel data',
  })
  categories!: VitrineCategoryDto[];
}

export class LowStockProductDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'PB' })
  monogram!: string;

  @ApiProperty({ example: 'store-teal-green' })
  gradientPreset!: string;

  @ApiProperty({ description: 'May be negative — the recorded oversell surfaced here' })
  stockQty!: number;

  @ApiProperty()
  lowStockThreshold!: number;
}

export class LowStockDto {
  @ApiProperty()
  count!: number;

  @ApiProperty({ type: [LowStockProductDto] })
  products!: LowStockProductDto[];
}

export class StoreOverviewResponseDto {
  @ApiProperty({ example: '2026-08', description: 'Tenant-local month' })
  month!: string;

  @ApiProperty({ description: '"R$ N vendas no mês" — settled order payments by paid_at' })
  vendasMesCents!: number;

  @ApiProperty({ description: '"N pedidos no mês" — orders that reached paid in the month' })
  pedidosMesCount!: number;

  @ApiProperty({ type: LowStockDto })
  lowStock!: LowStockDto;
}

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Kimono Oficial' })
  productName!: string;

  @ApiProperty({ example: 'GI' })
  monogram!: string;

  @ApiProperty({ example: 'store-blue-purple' })
  gradientPreset!: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Null for sizeless products' })
  size!: string | null;

  @ApiProperty({ minimum: 1 })
  quantity!: number;

  @ApiProperty({ description: 'Price snapshot at purchase — never the live price' })
  unitPriceCents!: number;
}

export class OrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 2431, description: 'Per-tenant sequential, rendered #2431' })
  number!: number;

  @ApiProperty({ enum: ['pending', 'paid', 'ready', 'delivered', 'canceled'] })
  status!: 'pending' | 'paid' | 'ready' | 'delivered' | 'canceled';

  @ApiProperty({ description: 'unit_price × quantity from the snapshot' })
  totalCents!: number;

  @ApiProperty({ example: 'Retirada na recepção' })
  pickupNote!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: OrderItemDto, nullable: true })
  item!: OrderItemDto | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Open order charge to pay (pending only) — drives the Pix sheet',
  })
  chargeId!: string | null;
}

export class OrdersResponseDto {
  @ApiProperty({ type: [OrderDto], description: 'Meus pedidos — own orders, newest first' })
  orders!: OrderDto[];
}

export class CreateOrderResponseDto {
  @ApiProperty({ type: OrderDto })
  order!: OrderDto;

  @ApiProperty({
    format: 'uuid',
    description:
      'The order-origin charge: pay it via POST /store/charges/{id}/payments (Pix) and the ' +
      'existing simulate button — addressed "Pedido #NNNN · <produto>"',
  })
  chargeId!: string;
}

export class OrderBuyerDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Ana Aluna' })
  fullName!: string;
}

export class AdminOrderDto extends OrderDto {
  @ApiProperty({ type: OrderBuyerDto, description: 'Student or professor buyer' })
  buyer!: OrderBuyerDto;
}

export class AdminOrdersResponseDto {
  @ApiProperty({
    type: [AdminOrderDto],
    description: 'The pedidos board — pending excluded, newest first',
  })
  orders!: AdminOrderDto[];
}
