import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { AlunoGraduationResponseDto } from '../dto/responses.dto.js';
import { GraduationProfileService } from '../services/graduation-profile.service.js';

/** Aluno Graduação screen (GRD.7, aluno-09): hero, progress, timeline. */
@ApiTags('aluno')
@ApiBearerAuth()
@Roles('student')
@Controller('aluno')
export class AlunoGraduationController {
  constructor(
    private readonly profiles: GraduationProfileService,
    private readonly cls: ClsService,
  ) {}

  @Get('graduation')
  @ApiOperation({
    summary: 'Graduação: belt hero, progress to the next milestone, evolution timeline',
    description:
      'Current belt is derived (latest non-reversed award; white default). Progress counts ' +
      'active lessons since the last award against the academy rule; non-reversed belt entries ' +
      'carry certificateAvailable: true (spec 013) — the certificate renders client-side.',
  })
  @ApiOkResponse({ type: AlunoGraduationResponseDto })
  async graduation() {
    const ctx = requireTenantContext(this.cls);
    return this.profiles.alunoGraduation(ctx);
  }
}
