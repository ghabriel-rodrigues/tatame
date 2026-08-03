import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { RequiresPermission, Roles } from '../../../common/decorators.js';
import { ClassSuggestionQueryDto, RegisterDependentDto } from '../dto/requests.dto.js';
import {
  ClassSuggestionResponseDto,
  DependentListResponseDto,
  DependentResponseDto,
  RegisterDependentResponseDto,
} from '../dto/responses.dto.js';
import { ClassService } from '../services/class.service.js';
import { DependentsService } from '../services/dependents.service.js';
import { requireTenantContext } from './context.js';

/**
 * Responsável surface (ENR.11). A dependent that is not the caller's behaves
 * as a 404 (story 35 — the 001 debt); cadastrar filho is gated by the
 * academy's `dependents.register` toggle.
 */
@ApiTags('responsavel')
@ApiBearerAuth()
@Roles('guardian')
@Controller('responsavel')
export class ResponsavelDependentsController {
  constructor(
    private readonly dependents: DependentsService,
    private readonly classService: ClassService,
    private readonly cls: ClsService,
  ) {}

  @Get('dependents')
  @ApiOperation({ summary: 'My children with class and next scheduled slot' })
  @ApiOkResponse({ type: DependentListResponseDto })
  async list() {
    const ctx = requireTenantContext(this.cls);
    return { dependents: await this.dependents.list(ctx) };
  }

  @Get('dependents/:id')
  @ApiOperation({ summary: 'Child detail (foreign dependent → 404, no existence leak)' })
  @ApiOkResponse({ type: DependentResponseDto })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const ctx = requireTenantContext(this.cls);
    return { dependent: await this.dependents.get(ctx, id) };
  }

  @Post('dependents')
  @RequiresPermission('dependents.register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Cadastrar filho: auto guardian link + enrollment into the accepted suggestion',
  })
  @ApiCreatedResponse({ type: RegisterDependentResponseDto })
  async register(@Body() dto: RegisterDependentDto) {
    const ctx = requireTenantContext(this.cls);
    return this.dependents.register(ctx, dto);
  }

  @Get('class-suggestion')
  @ApiOperation({ summary: 'Age-suggested class for a birth date (null when no match/room)' })
  @ApiOkResponse({ type: ClassSuggestionResponseDto })
  async suggestion(@Query() query: ClassSuggestionQueryDto) {
    const ctx = requireTenantContext(this.cls);
    return { suggestion: await this.classService.suggest(ctx, query.birthDate) };
  }
}
