import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { RequiresPermission, Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import { MarkAttendanceDto, RevokeAttendanceDto } from '../dto/requests.dto.js';
import {
  MarkAttendanceResponseDto,
  RevokeAttendanceResponseDto,
  RollCallResponseDto,
} from '../dto/responses.dto.js';
import { RollCallService } from '../services/roll-call.service.js';

/**
 * Professor manual chamada (spec 004, ATT.8): per-tap semantics — toggle on
 * is an immediate INSERT (method manual, recorded_by = professor, audited),
 * toggle off an immediate same-day revoke through the audited void seam.
 * "Salvar chamada" is pure client navigation; there is no batch protocol.
 */
@ApiTags('professor')
@ApiBearerAuth()
@Roles('professor')
@Controller('professor')
export class ProfessorRollCallController {
  constructor(
    private readonly rollCall: RollCallService,
    private readonly cls: ClsService,
  ) {}

  @Post('classes/:id/roll-call')
  @HttpCode(200)
  @RequiresPermission('attendance.record')
  @ApiOperation({
    summary: 'Abrir chamada manual — materialize session + roster with states',
    description: 'Self check-ins (QR/code/manual) appear pre-toggled — one truth for both modes.',
  })
  @ApiOkResponse({ type: RollCallResponseDto })
  async open(@Param('id', ParseUUIDPipe) classId: string) {
    const ctx = requireTenantContext(this.cls);
    return this.rollCall.open(ctx, classId);
  }

  @Post('sessions/:id/attendances')
  @HttpCode(200)
  @RequiresPermission('attendance.record')
  @ApiOperation({
    summary: 'Toggle on — professor-recorded manual presence (audited in-transaction)',
    description: 'A student already present returns status `already_checked_in` (benign).',
  })
  @ApiOkResponse({ type: MarkAttendanceResponseDto })
  async mark(@Param('id', ParseUUIDPipe) sessionId: string, @Body() dto: MarkAttendanceDto) {
    const ctx = requireTenantContext(this.cls);
    return this.rollCall.mark(ctx, sessionId, dto.studentId);
  }

  @Post('attendances/:id/revoke')
  @HttpCode(200)
  @RequiresPermission('attendance.record')
  @ApiOperation({
    summary: 'Toggle off — same-day revoke through the audited void seam',
    description:
      'After the session\'s day closes this returns 403 attendance.revoke_window_closed — ' +
      'late corrections go through the admin endpoint.',
  })
  @ApiOkResponse({ type: RevokeAttendanceResponseDto })
  async revoke(@Param('id', ParseUUIDPipe) attendanceId: string, @Body() dto: RevokeAttendanceDto) {
    const ctx = requireTenantContext(this.cls);
    return this.rollCall.revoke(ctx, attendanceId, 'professor', dto.reason);
  }
}
