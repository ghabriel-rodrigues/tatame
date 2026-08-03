import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { CreateGuardianDto, UpdateNameDto } from '../dto/requests.dto.js';
import { GuardianListResponseDto, GuardianResponseDto } from '../dto/responses.dto.js';
import { RegistryService } from '../services/registry.service.js';
import { requireTenantContext } from './context.js';

/**
 * Admin Cadastros — responsáveis segment (ENR.6). No archive endpoint: BOSS
 * ruling — guardians carry no status column in this slice; archiving a
 * guardian's last dependent leaves the guardian row dormant (harmless).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/guardians')
export class AdminGuardiansController {
  constructor(
    private readonly registry: RegistryService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Guardian registry with dependent counts' })
  @ApiOkResponse({ type: GuardianListResponseDto })
  async list() {
    const ctx = requireTenantContext(this.cls);
    return { guardians: await this.registry.listGuardians(ctx) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a guardian record without a login' })
  @ApiCreatedResponse({ type: GuardianResponseDto })
  async create(@Body() dto: CreateGuardianDto) {
    const ctx = requireTenantContext(this.cls);
    return { guardian: await this.registry.createGuardian(ctx, dto) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Name-only edit' })
  @ApiOkResponse({ type: GuardianResponseDto })
  async rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNameDto) {
    const ctx = requireTenantContext(this.cls);
    return { guardian: await this.registry.updateGuardianName(ctx, id, dto.fullName) };
  }
}
