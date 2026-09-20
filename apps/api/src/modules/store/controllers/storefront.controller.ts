import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { BypassReadOnly, Roles } from '../../../common/decorators.js';
import { PaymentCreatedResponseDto } from '../../billing/dto/responses.dto.js';
import { PaymentFlowService } from '../../billing/services/payment-flow.service.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import {
  CreateOrderChargePaymentDto,
  CreateOrderDto,
} from '../dto/requests.dto.js';
import {
  CreateOrderResponseDto,
  OrdersResponseDto,
  ProductDetailDto,
  VitrineResponseDto,
} from '../dto/responses.dto.js';
import { StoreOrdersService } from '../services/store-orders.service.js';
import { StorefrontService } from '../services/storefront.service.js';

/**
 * The shared aluno + professor storefront (spec 009, STO.5 — aluno-16/17,
 * professor-13/14): one feature, two shells, persona-neutral routes. The
 * professor consumes exactly like the aluno; guardian/responsável and
 * platform roles are denied (no responsável store in v1). Order creation is
 * blocked for read-only academies like every write; paying an EXISTING order
 * charge carries @BypassReadOnly — the established rule, unchanged.
 */
@ApiTags('store')
@ApiBearerAuth()
@Roles('student', 'professor')
@Controller('store')
export class StorefrontController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly storeOrders: StoreOrdersService,
    private readonly paymentFlow: PaymentFlowService,
    private readonly cls: ClsService,
  ) {}

  @Get('products')
  @ApiOperation({
    summary: 'Vitrine: active products + the category chip carousel data',
    description:
      '"Buscar por nome ou tag" via ?search= (name AND tags), one chip via ?categoryId=. ' +
      'Archived products exist only in order history — never here (story 31).',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiOkResponse({ type: VitrineResponseDto })
  async list(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.storefront.list(requireTenantContext(this.cls), {
      search,
      categoryId,
    });
  }

  @Get('products/:id')
  @ApiOperation({
    summary:
      'Product detail: gallery derivation inputs, size pills, stock, price',
    description:
      'The 3 "fotos" are deterministic monogram-tile variants derived client-side from ' +
      '`gradientPreset` + `monogram` (no image upload in v1 — recorded debt).',
  })
  @ApiOkResponse({ type: ProductDetailDto })
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.storefront.detail(requireTenantContext(this.cls), id);
  }

  @Post('orders')
  @HttpCode(201)
  @ApiOperation({
    summary: '"Comprar com Pix · R$ X" — pending order + order-origin charge',
    description:
      'Validates active product, size ∈ sizes (required iff the product has sizes) and ' +
      'quantity ≤ stock (no reservation — stock moves only at paid). Assigns the per-tenant ' +
      '#NNNN, snapshots the unit price, and returns the chargeId for the existing Pix sheet.',
  })
  @ApiCreatedResponse({ type: CreateOrderResponseDto })
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.storeOrders.create(requireTenantContext(this.cls), {
      productId: dto.productId,
      size: dto.size ?? null,
      quantity: dto.quantity,
    });
  }

  @Get('orders')
  @ApiOperation({
    summary:
      'Meus pedidos — own orders with status chips and the retirada note',
  })
  @ApiOkResponse({ type: OrdersResponseDto })
  async myOrders() {
    return this.storeOrders.myOrders(requireTenantContext(this.cls));
  }

  @Delete('orders/:id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Cancel an own order still awaiting payment (voids its open charge)',
    description:
      'Pending only — a paid order is undone exclusively by the admin refund path ' +
      '(409 `store.order_not_cancelable`).',
  })
  async cancelOrder(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.storeOrders.cancelPending(requireTenantContext(this.cls), id);
  }

  @Post('charges/:id/payments')
  @BypassReadOnly()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Pix payment on an own order charge — persona-neutral wallet twin',
    description:
      "Ownership is the order's buyer (student or professor alike). Returns the render-ready " +
      'Pix payload; settlement flows only through "Simular pagamento" (or the future webhook) ' +
      'via the normalized provider-event handler. @BypassReadOnly: paying an existing charge ' +
      'always works, even for delinquent academies.',
  })
  @ApiCreatedResponse({ type: PaymentCreatedResponseDto })
  async pay(
    @Param('id', ParseUUIDPipe) chargeId: string,
    @Body() dto: CreateOrderChargePaymentDto,
  ) {
    return this.paymentFlow.createPayment(
      requireTenantContext(this.cls),
      'buyer',
      chargeId,
      {
        method: dto.method,
      },
    );
  }
}
