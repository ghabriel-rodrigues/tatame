import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { RegisterProfessorDto } from '../dto/requests.dto.js';
import { ProfessorListResponseDto, RegisterProfessorResponseDto } from '../dto/responses.dto.js';
import { ProfessorRegistryService } from '../services/professor-registry.service.js';
import { requireTenantContext } from './context.js';

/** Admin Cadastros — professores segment (ENR.7). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/professors')
export class AdminProfessorsController {
  constructor(
    private readonly professors: ProfessorRegistryService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Active professor memberships of the academy' })
  @ApiOkResponse({ type: ProfessorListResponseDto })
  async list() {
    const ctx = requireTenantContext(this.cls);
    return { professors: await this.professors.list(ctx) };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register a professor: reuse-or-create user by email + membership + set-password email',
  })
  @ApiCreatedResponse({ type: RegisterProfessorResponseDto })
  async register(@Body() dto: RegisterProfessorDto) {
    const ctx = requireTenantContext(this.cls);
    return this.professors.register(ctx, dto);
  }
}
