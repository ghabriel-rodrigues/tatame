import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import {
  AwardGraduationDto,
  CreateStudentNoteDto,
  RevokeGraduationDto,
  UpdateGraduationRulesDto,
} from '../dto/requests.dto.js';
import {
  AwardGraduationResponseDto,
  GraduationHistoryResponseDto,
  GraduationRulesResponseDto,
  RevokeGraduationResponseDto,
  StudentNoteResponseDto,
  StudentNotesResponseDto,
} from '../dto/responses.dto.js';
import { GraduationAwardService } from '../services/graduation-award.service.js';
import { GraduationQueryService } from '../services/graduation-query.service.js';
import { GraduationRulesService } from '../services/graduation-rules.service.js';
import { StudentNotesService } from '../services/student-notes.service.js';
import { withTenant, students, type DbHandle } from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';

/**
 * Admin surface (GRD.9): Regras de graduação (admin-16), per-student history
 * with revocations, the ungated award path (story 28 — the academy owner can
 * always graduate) and the audited compensation-row revocation.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminGraduationController {
  constructor(
    private readonly rules: GraduationRulesService,
    private readonly awards: GraduationAwardService,
    private readonly query: GraduationQueryService,
    private readonly notes: StudentNotesService,
    private readonly cls: ClsService,
    @Inject(APP_DB) private readonly appDb: DbHandle,
  ) {}

  @Get('graduation-rules')
  @ApiOperation({
    summary: 'Regras de graduação: merged ladder (defaults + overrides) in régua order',
  })
  @ApiOkResponse({ type: GraduationRulesResponseDto })
  async getRules() {
    const ctx = requireTenantContext(this.cls);
    return { rules: await this.rules.adminView(ctx) };
  }

  @Put('graduation-rules')
  @ApiOperation({
    summary: 'Salvar: bulk upsert (≥ 10 lessons; only kids belts can be disabled)',
    description: 'Changed rules immediately re-aim every progress bar in the academy (story 27).',
  })
  @ApiOkResponse({ type: GraduationRulesResponseDto })
  async putRules(@Body() dto: UpdateGraduationRulesDto) {
    const ctx = requireTenantContext(this.cls);
    return { rules: await this.rules.update(ctx, dto.rules) };
  }

  @Get('students/:id/graduations')
  @ApiOperation({ summary: 'Full graduation history including revocations, newest first' })
  @ApiOkResponse({ type: GraduationHistoryResponseDto })
  async history(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    const graduations = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const [student] = await tx
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.id, id)));
        if (!student) throw problem(404, ErrorCodes.NOT_FOUND, 'Student not found');
        return this.query.timeline(tx, id);
      },
    );
    return { graduations };
  }

  @Post('students/:id/graduations')
  @HttpCode(201)
  @ApiOperation({ summary: 'Award (no toggle gates the admin — role-fixed, story 28)' })
  @ApiCreatedResponse({ type: AwardGraduationResponseDto })
  async award(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AwardGraduationDto) {
    const ctx = requireTenantContext(this.cls);
    return this.awards.award(ctx, id, dto);
  }

  @Post('graduations/:id/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revogar: append a compensation row restoring the previous belt/degree',
    description:
      'Never an edit — history stays immutable. Each award is revocable at most once (409 on a ' +
      'second attempt); audited with who and why (graduation.revoked).',
  })
  @ApiOkResponse({ type: RevokeGraduationResponseDto })
  async revoke(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeGraduationDto) {
    const ctx = requireTenantContext(this.cls);
    return this.awards.revoke(ctx, id, dto.reason);
  }

  @Get('students/:id/notes')
  @ApiOperation({ summary: 'Observações history — the staff shares one memory (story 19)' })
  @ApiOkResponse({ type: StudentNotesResponseDto })
  async listNotes(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return { notes: await this.notes.list(ctx, id) };
  }

  @Post('students/:id/notes')
  @HttpCode(201)
  @ApiOperation({ summary: 'Persist an observação as the admin' })
  @ApiCreatedResponse({ type: StudentNoteResponseDto })
  async createNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateStudentNoteDto) {
    const ctx = requireTenantContext(this.cls);
    return { note: await this.notes.create(ctx, id, dto.body) };
  }
}
