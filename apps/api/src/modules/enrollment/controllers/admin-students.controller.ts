import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import {
  CreateStudentDto,
  MoveStudentsDto,
  StatusFilterQueryDto,
  UpdateStudentDto,
} from '../dto/requests.dto.js';
import {
  MoveStudentsResponseDto,
  StudentListResponseDto,
  StudentResponseDto,
} from '../dto/responses.dto.js';
import { EnrollmentService } from '../services/enrollment.service.js';
import { RegistryService } from '../services/registry.service.js';
import { requireTenantContext } from './context.js';

/** Admin Cadastros — alunos segment (ENR.6) + the bulk move flow (ENR.9). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/students')
export class AdminStudentsController {
  constructor(
    private readonly registry: RegistryService,
    private readonly enrollment: EnrollmentService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Student registry with derived Ativo/Pendente badges',
  })
  @ApiOkResponse({ type: StudentListResponseDto })
  async list(@Query() query: StatusFilterQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return {
      students: await this.registry.listStudents(ctx, query.status ?? 'active'),
    };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a student record (minor ⇒ guardian required)',
  })
  @ApiCreatedResponse({ type: StudentResponseDto })
  async create(@Body() dto: CreateStudentDto) {
    const ctx = requireTenantContext(this.cls);
    return { student: await this.registry.createStudent(ctx, dto) };
  }

  @Post('move')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Atomic bulk move: whole selection or nothing (capacity-checked)',
  })
  @ApiOkResponse({ type: MoveStudentsResponseDto })
  async move(@Body() dto: MoveStudentsDto) {
    const ctx = requireTenantContext(this.cls);
    return this.enrollment.moveStudents(
      ctx,
      dto.studentIds,
      dto.destinationClassId,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit name and/or mensalidade plan assignment (spec 006 additive extension)',
  })
  @ApiOkResponse({ type: StudentResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    const ctx = requireTenantContext(this.cls);
    return { student: await this.registry.updateStudent(ctx, id, dto) };
  }

  @Post(':id/archive')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Soft archive: inactive + active enrollments ended atomically',
  })
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const ctx = requireTenantContext(this.cls);
    await this.registry.archiveStudent(ctx, id);
  }
}
