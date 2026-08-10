import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { requireAuthContext, type AuthContext } from '../../../common/auth-context.js';
import { Roles } from '../../../common/decorators.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { UpdateAcademyDto } from '../dto/academy.dto.js';
import { AdminAcademyResponseDto } from '../dto/responses.dto.js';
import { AcademySettingsService } from '../services/academy-settings.service.js';

/**
 * Admin-15 Configurações — identidade visual + academy toggles (spec 011,
 * CFG.4). Name, the white-label brand triplet and the auto-notifications
 * gate; slug/status/logo stay out of reach (platform-owned / recorded debt).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/academy')
export class AdminAcademyController {
  constructor(
    private readonly settings: AcademySettingsService,
    private readonly cls: ClsService,
  ) {}

  private tenantContext(): AuthContext & { tenantId: string } {
    const ctx = requireAuthContext(this.cls);
    if (!ctx.tenantId) {
      throw problem(403, ErrorCodes.AUTHZ_FORBIDDEN_ROLE, 'No active academy context');
    }
    return ctx as AuthContext & { tenantId: string };
  }

  @Get()
  @ApiOperation({ summary: 'Academy identity settings: name, brand triplet, toggles' })
  @ApiOkResponse({ type: AdminAcademyResponseDto })
  async get() {
    return this.settings.get(this.tenantContext().tenantId);
  }

  @Put()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update name + brand + auto-notifications (audited)',
    description:
      'Full document. Brand accepts any valid hex triplet (case-normalized to uppercase); ' +
      '`brand: null` clears back to the default Tatame brand. Audited as `academy.updated` ' +
      'with before/after of the changed fields.',
  })
  @ApiOkResponse({ type: AdminAcademyResponseDto })
  async update(@Body() dto: UpdateAcademyDto) {
    return this.settings.update(this.tenantContext(), {
      name: dto.name,
      brand: dto.brand,
      autoNotificationsEnabled: dto.autoNotificationsEnabled,
    });
  }
}
