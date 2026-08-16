import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { AlunoProfileResponseDto, UpdateAlunoProfileDto } from '../dto/profile.dto.js';
import { ProfileService } from '../services/profile.service.js';

/**
 * Aluno Dados pessoais (spec 013, REP.6 — aluno-18): the perfil's stub row
 * becomes real. Student-scoped in v1 (the only screen the handoff designed);
 * the storage on `users` is ready for guardian/professor screens later. The
 * PUT is a write — blocked in read-only (delinquent) academies like every
 * mutation.
 */
@ApiTags('aluno')
@ApiBearerAuth()
@Roles('student')
@Controller('aluno/profile')
export class AlunoProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Dados pessoais: identificação (CPF/RG lock state), contato, endereço, emergência',
    description:
      'Email and birth date are read-only (birth date served from the linked student row — the ' +
      'age-rule authority). cpfLocked/rgLocked drive the aluno-18 dashed lock boxes.',
  })
  @ApiOkResponse({ type: AlunoProfileResponseDto })
  async get() {
    const ctx = requireTenantContext(this.cls);
    return this.profiles.get(ctx);
  }

  @Put()
  @ApiOperation({
    summary: 'Salvar dados pessoais (partial update, per-field validation)',
    description:
      'CPF is normalized to digits and checksum-validated; CPF/RG are write-once (422 ' +
      'profile.field_locked on any change after set). Email/birthDate in the payload are a 422 ' +
      'profile.field_read_only. Name edits sync onto the linked student row in-transaction.',
  })
  @ApiOkResponse({ type: AlunoProfileResponseDto })
  async update(@Body() dto: UpdateAlunoProfileDto) {
    const ctx = requireTenantContext(this.cls);
    return this.profiles.update(ctx, dto);
  }
}
