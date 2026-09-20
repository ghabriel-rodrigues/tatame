import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { RevokeAttendanceDto } from '../dto/requests.dto.js';
import {
  AdminSessionListResponseDto,
  RevokeAttendanceResponseDto,
} from '../dto/responses.dto.js';
import { DirectoryService } from '../services/directory.service.js';
import { RollCallService } from '../services/roll-call.service.js';

/**
 * Admin surface (spec 004, ATT.9): minimal visibility (turma session list
 * with counts — feeds web ATT.14) plus the any-time audited revoke. The
 * console UI for the revoke is deferred to the reports slice (recorded debt).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminAttendanceController {
  constructor(
    private readonly rollCall: RollCallService,
    private readonly directory: DirectoryService,
    private readonly cls: ClsService,
  ) {}

  @Post('attendances/:id/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Any-time audited revoke (window same_day | admin_late in the audit row)',
  })
  @ApiOkResponse({ type: RevokeAttendanceResponseDto })
  async revoke(
    @Param('id', ParseUUIDPipe) attendanceId: string,
    @Body() dto: RevokeAttendanceDto,
  ) {
    const ctx = requireTenantContext(this.cls);
    return this.rollCall.revoke(ctx, attendanceId, 'admin', dto.reason);
  }

  @Get('classes/:id/sessions')
  @ApiOperation({
    summary:
      'Turma sessions with active attendance counts (replaces Phase-3 placeholders)',
  })
  @ApiOkResponse({ type: AdminSessionListResponseDto })
  async sessions(@Param('id', ParseUUIDPipe) classId: string) {
    const ctx = requireTenantContext(this.cls);
    return { sessions: await this.directory.adminClassSessions(ctx, classId) };
  }
}
