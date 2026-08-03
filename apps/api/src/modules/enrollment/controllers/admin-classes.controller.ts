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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import {
  AddRosterStudentDto,
  CreateClassDto,
  StatusFilterQueryDto,
  UpdateClassNameDto,
} from '../dto/requests.dto.js';
import {
  ClassDetailResponseDto,
  ClassListResponseDto,
  EnrollmentResultResponseDto,
} from '../dto/responses.dto.js';
import { ClassService } from '../services/class.service.js';
import { EnrollmentService } from '../services/enrollment.service.js';
import { requireTenantContext } from './context.js';

/** Admin turmas (ENR.8) + roster mutations (ENR.9). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/classes')
export class AdminClassesController {
  constructor(
    private readonly classService: ClassService,
    private readonly enrollment: EnrollmentService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Turmas with schedules, occupancy and derived Lotada' })
  @ApiOkResponse({ type: ClassListResponseDto })
  async list(@Query() query: StatusFilterQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return { classes: await this.classService.list(ctx, query.status ?? 'active') };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a recurring turma — weekday chips fan out into schedule rows' })
  @ApiCreatedResponse({ type: ClassDetailResponseDto })
  async create(@Body() dto: CreateClassDto) {
    const ctx = requireTenantContext(this.cls);
    return { class: await this.classService.create(ctx, dto) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Turma detail: schedule, occupancy, roster' })
  @ApiOkResponse({ type: ClassDetailResponseDto })
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return { class: await this.classService.detail(ctx, id) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Name-only edit (schedule/professor/capacity editing deferred)' })
  @ApiOkResponse({ type: ClassDetailResponseDto })
  async rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassNameDto) {
    const ctx = requireTenantContext(this.cls);
    return { class: await this.classService.updateName(ctx, id, dto.name) };
  }

  @Post(':id/archive')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft archive: archived + active enrollments ended atomically' })
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const ctx = requireTenantContext(this.cls);
    await this.classService.archive(ctx, id);
  }

  @Post(':id/students')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add to roster (row-locked capacity; reactivates a removed row)' })
  @ApiCreatedResponse({ type: EnrollmentResultResponseDto })
  async addStudent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddRosterStudentDto) {
    const ctx = requireTenantContext(this.cls);
    return { enrollment: await this.enrollment.addStudent(ctx, id, dto.studentId) };
  }

  @Delete(':id/students/:studentId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove from roster (soft: enrollment flips to removed)' })
  @ApiOkResponse({ type: EnrollmentResultResponseDto })
  async removeStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const ctx = requireTenantContext(this.cls);
    return { enrollment: await this.enrollment.removeStudent(ctx, id, studentId) };
  }
}
