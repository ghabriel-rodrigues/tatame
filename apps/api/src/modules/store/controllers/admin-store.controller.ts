import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import {
  CreateCategoryDto,
  CreateProductDto,
  OrderStatusTransitionDto,
  RenameCategoryDto,
  UpdateProductDto,
} from '../dto/requests.dto.js';
import {
  AdminOrderDto,
  AdminOrdersResponseDto,
  AdminProductDto,
  AdminProductsResponseDto,
  StoreCategoriesResponseDto,
  StoreCategoryDto,
  StoreOverviewResponseDto,
} from '../dto/responses.dto.js';
import { StoreAdminService } from '../services/store-admin.service.js';
import { StoreOrdersService } from '../services/store-orders.service.js';

/**
 * Admin Loja console (spec 009, STO.4/STO.6 — admin-03/04/05/06): stat tiles,
 * categorias chip CRUD (guarded delete), produtos with "Remover da loja" =
 * archive, and the pedidos board with its status sheet. Strictly admin — the
 * professor's store access is consumer-side only, enforced by the CI
 * route-metadata assertion (story 35). All writes blocked for read-only
 * (delinquent) academies by the academy-status guard — no @BypassReadOnly.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/store')
export class AdminStoreController {
  constructor(
    private readonly storeAdmin: StoreAdminService,
    private readonly storeOrders: StoreOrdersService,
    private readonly cls: ClsService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Loja tiles: vendas do mês, pedidos no mês, estoque baixo',
    description:
      'All derived on read in the tenant timezone. Vendas is a standalone store aggregate — the ' +
      'billing Visão financeira keeps its all-payments derivation untouched (nothing ' +
      'double-counted, each screen owns its number).',
  })
  @ApiOkResponse({ type: StoreOverviewResponseDto })
  async overview() {
    return this.storeAdmin.overview(requireTenantContext(this.cls));
  }

  // ── categorias ────────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: '"Categorias da loja" — one chip per category with its count' })
  @ApiOkResponse({ type: StoreCategoriesResponseDto })
  async listCategories() {
    return this.storeAdmin.listCategories(requireTenantContext(this.cls));
  }

  @Post('categories')
  @HttpCode(201)
  @ApiOperation({ summary: '"+ Nova categoria" (name unique per academy — 409 on duplicate)' })
  @ApiCreatedResponse({ type: StoreCategoryDto })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.storeAdmin.createCategory(requireTenantContext(this.cls), dto.name);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Rename a category (audited)' })
  @ApiOkResponse({ type: StoreCategoryDto })
  async renameCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameCategoryDto) {
    return this.storeAdmin.renameCategory(requireTenantContext(this.cls), id, dto.name);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a category — only while no product references it',
    description: 'Referenced (archived products included) → 409 `category.in_use`.',
  })
  async deleteCategory(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.storeAdmin.deleteCategory(requireTenantContext(this.cls), id);
  }

  // ── produtos ──────────────────────────────────────────────────────────────

  @Get('products')
  @ApiOperation({
    summary: 'Produto rows per admin-03: tile, price, "N em estoque · N vendidos"',
    description: 'Vendidos is derived from real paid+ orders — truth, not a counter (story 8).',
  })
  @ApiOkResponse({ type: AdminProductsResponseDto })
  async listProducts() {
    return this.storeAdmin.listProducts(requireTenantContext(this.cls));
  }

  @Post('products')
  @HttpCode(201)
  @ApiOperation({
    summary: '"Novo produto" per admin-06',
    description:
      'Monogram derives from the name and the gradient preset cycles the design-system catalog ' +
      'when omitted. No image upload in v1 (recorded debt) — the galeria renders monogram-tile ' +
      'variants derived client-side.',
  })
  @ApiCreatedResponse({ type: AdminProductDto })
  async createProduct(@Body() dto: CreateProductDto) {
    return this.storeAdmin.createProduct(requireTenantContext(this.cls), dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: '"Editar produto" (archived products are frozen — 409)' })
  @ApiOkResponse({ type: AdminProductDto })
  async updateProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.storeAdmin.updateProduct(requireTenantContext(this.cls), id, dto);
  }

  @Delete('products/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: '"Remover da loja" — archives, never hard-deletes (story 6)',
    description: 'Order history referencing the product stays intact; the vitrine stops showing it.',
  })
  @ApiOkResponse({ type: AdminProductDto })
  async archiveProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.storeAdmin.archiveProduct(requireTenantContext(this.cls), id);
  }

  // ── pedidos ───────────────────────────────────────────────────────────────

  @Get('orders')
  @ApiOperation({
    summary: 'Pedidos board per admin-04 — pending excluded, newest first',
    description: 'Only sales that actually happened reach the board (story 13).',
  })
  @ApiOkResponse({ type: AdminOrdersResponseDto })
  async board() {
    return this.storeOrders.adminBoard(requireTenantContext(this.cls));
  }

  @Post('orders/:id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Status sheet per admin-05: paid → ready → delivered; canceled refunds',
    description:
      'No skips, no backward moves, delivered is terminal (409 `store.order_invalid_transition` ' +
      'otherwise). Cancelado runs the audited full Pix refund; the order flip + stock restore ' +
      'ride the resulting `payment.refunded` event ("Estorno do Pix em até 1 dia útil"). ' +
      '`paid` is never set by hand — payment truth comes only from the handler.',
  })
  @ApiOkResponse({ type: AdminOrderDto })
  async transition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderStatusTransitionDto) {
    return this.storeOrders.adminTransition(requireTenantContext(this.cls), id, dto.status);
  }
}
