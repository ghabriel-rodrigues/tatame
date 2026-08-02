import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { requireAuthContext } from '../../../common/auth-context.js';
import { Roles } from '../../../common/decorators.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { PermissionsService } from '../services/permissions.service.js';
import { UpdatePermissionsDto } from '../dto/permissions.dto.js';
import { PermissionMatrixResponseDto } from '../dto/responses.dto.js';

/** Admin-17 screen: per-role permission toggles for the active academy. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/permissions')
export class AdminPermissionsController {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly cls: ClsService,
  ) {}

  private tenantId(): string {
    const ctx = requireAuthContext(this.cls);
    if (!ctx.tenantId) {
      throw problem(403, ErrorCodes.AUTHZ_FORBIDDEN_ROLE, 'No active academy context');
    }
    return ctx.tenantId;
  }

  @Get()
  @ApiOperation({ summary: 'Resolved toggle matrix (defaults overlaid with rows)' })
  @ApiOkResponse({ type: PermissionMatrixResponseDto })
  async list() {
    return { permissions: await this.permissions.resolveAll(this.tenantId()) };
  }

  @Put()
  @HttpCode(200)
  @ApiOperation({ summary: 'Upsert permission toggles (registry keys only)' })
  @ApiOkResponse({ type: PermissionMatrixResponseDto })
  async update(@Body() dto: UpdatePermissionsDto) {
    const ctx = requireAuthContext(this.cls);
    return {
      permissions: await this.permissions.update(this.tenantId(), ctx.userId, dto.entries),
    };
  }
}
