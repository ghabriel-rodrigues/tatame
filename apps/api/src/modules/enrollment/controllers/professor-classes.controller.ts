import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { AddRosterStudentDto } from '../dto/requests.dto.js';
import {
  ClassDetailResponseDto,
  ClassListResponseDto,
  EnrollmentResultResponseDto,
} from '../dto/responses.dto.js';
import { ClassService } from '../services/class.service.js';
import { EnrollmentService } from '../services/enrollment.service.js';
import { requireTenantContext } from './context.js';

/**
 * Professor surface (ENR.10): own classes only. Ownership is service-level
 * filtering by `professor_user_id = ctx.userId` — a class the caller does not
 * teach behaves as if it did not exist (404, story 28).
 */
@ApiTags('professor')
@ApiBearerAuth()
@Roles('professor')
@Controller('professor/classes')
export class ProfessorClassesController {
  constructor(
    private readonly classService: ClassService,
    private readonly enrollment: EnrollmentService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Minhas turmas: days, times, occupancy' })
  @ApiOkResponse({ type: ClassListResponseDto })
  async list() {
    const ctx = requireTenantContext(this.cls);
    return {
      classes: await this.classService.list(ctx, 'active', { professorUserId: ctx.userId }),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Own turma detail with roster (foreign class → 404)' })
  @ApiOkResponse({ type: ClassDetailResponseDto })
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return { class: await this.classService.detail(ctx, id, { professorUserId: ctx.userId }) };
  }

  @Post(':id/students')
  @HttpCode(201)
  @ApiOperation({ summary: 'Adicionar aluno — same capacity rule that binds the admin' })
  @ApiCreatedResponse({ type: EnrollmentResultResponseDto })
  async addStudent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddRosterStudentDto) {
    const ctx = requireTenantContext(this.cls);
    return {
      enrollment: await this.enrollment.addStudent(ctx, id, dto.studentId, {
        professorUserId: ctx.userId,
      }),
    };
  }

  @Delete(':id/students/:studentId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove from own roster' })
  @ApiOkResponse({ type: EnrollmentResultResponseDto })
  async removeStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const ctx = requireTenantContext(this.cls);
    return {
      enrollment: await this.enrollment.removeStudent(ctx, id, studentId, {
        professorUserId: ctx.userId,
      }),
    };
  }
}
