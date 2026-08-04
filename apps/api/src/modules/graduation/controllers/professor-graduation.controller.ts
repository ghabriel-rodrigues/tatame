import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { RequiresPermission, Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { AwardGraduationDto, CreateStudentNoteDto } from '../dto/requests.dto.js';
import {
  AwardGraduationResponseDto,
  ProfessorProfileResponseDto,
  StudentNoteResponseDto,
  StudentNotesResponseDto,
  StudentProfileResponseDto,
} from '../dto/responses.dto.js';
import { GraduationAwardService } from '../services/graduation-award.service.js';
import { GraduationProfileService } from '../services/graduation-profile.service.js';
import { StudentNotesService } from '../services/student-notes.service.js';

/**
 * Professor surface (GRD.8/GRD.10): perfil do aluno (professor-11), the award
 * write path behind the admin's "atualizar graduações" toggle, persistent
 * observações, and the professor's own profile (professor-12). Professors may
 * graduate any active student of the academy, not only their rosters.
 */
@ApiTags('professor')
@ApiBearerAuth()
@Roles('professor')
@Controller('professor')
export class ProfessorGraduationController {
  constructor(
    private readonly awards: GraduationAwardService,
    private readonly notes: StudentNotesService,
    private readonly profiles: GraduationProfileService,
    private readonly cls: ClsService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Own profile: belt chip + Graduações válidas (merged régua)' })
  @ApiOkResponse({ type: ProfessorProfileResponseDto })
  async profile() {
    const ctx = requireTenantContext(this.cls);
    return this.profiles.professorProfile(ctx);
  }

  @Get('students/:id/profile')
  @ApiOperation({
    summary: 'Perfil do aluno: belt, progress, Phase-4 stat tiles, observações',
    description: 'Any student of the academy (grading day works across turmas); foreign id → 404.',
  })
  @ApiOkResponse({ type: StudentProfileResponseDto })
  async studentProfile(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return this.profiles.studentProfile(ctx, id);
  }

  @Post('students/:id/graduations')
  @HttpCode(201)
  @RequiresPermission('graduation.update')
  @ApiOperation({
    summary: 'Adicionar grau / Promover faixa (gated by the graduation.update toggle)',
    description:
      'degree: current + 1 on the current belt, rejected at max. belt: any enabled non-current ' +
      'catalog belt, degrees reset. Audited in-transaction (graduation.awarded).',
  })
  @ApiCreatedResponse({ type: AwardGraduationResponseDto })
  async award(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AwardGraduationDto) {
    const ctx = requireTenantContext(this.cls);
    return this.awards.award(ctx, id, dto);
  }

  @Get('students/:id/notes')
  @ApiOperation({ summary: 'Observações history (staff-visible only), newest first' })
  @ApiOkResponse({ type: StudentNotesResponseDto })
  async listNotes(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return { notes: await this.notes.list(ctx, id) };
  }

  @Post('students/:id/notes')
  @HttpCode(201)
  @ApiOperation({ summary: 'Persist an observação (coaching notes outlive graduations)' })
  @ApiCreatedResponse({ type: StudentNoteResponseDto })
  async createNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateStudentNoteDto) {
    const ctx = requireTenantContext(this.cls);
    return { note: await this.notes.create(ctx, id, dto.body) };
  }
}
