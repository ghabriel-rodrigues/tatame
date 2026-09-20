import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { interval, map, merge, type Observable } from 'rxjs';
import {
  Public,
  RequiresPermission,
  Roles,
} from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import {
  LiveCodeResponseDto,
  LiveSnapshotResponseDto,
  LiveStreamCheckinEventDto,
  LiveStreamRevokeEventDto,
  StreamTicketResponseDto,
} from '../dto/responses.dto.js';
import { LiveRoomRegistry } from '../realtime/live-room.registry.js';
import { StreamTicketService } from '../realtime/stream-ticket.service.js';
import { LiveCodeService } from '../services/live-code.service.js';

/** Heartbeat cadence — keeps proxies from idle-closing the stream (be-09). */
export const STREAM_HEARTBEAT_MS = 20_000;

/**
 * Professor live chamada (spec 004, ATT.6/ATT.10): open (idempotent
 * session upsert + code/QR mint), encerrar, snapshot (doubles as the polling
 * fallback), stream-ticket mint and the SSE stream itself. Ownership is
 * service-level: a foreign class or live code is a 404, never a 403.
 */
@ApiTags('professor')
@ApiBearerAuth()
@Roles('professor')
@Controller('professor')
export class ProfessorLiveController {
  constructor(
    private readonly liveCodes: LiveCodeService,
    private readonly tickets: StreamTicketService,
    private readonly rooms: LiveRoomRegistry,
    private readonly cls: ClsService,
  ) {}

  @Post('classes/:id/live-codes')
  @HttpCode(201)
  @RequiresPermission('attendance.record')
  @ApiOperation({
    summary: "Iniciar chamada — materialize today's session + mint code/QR",
    description:
      'Idempotent: an already-open chamada benignly returns its active code. Reopening ' +
      'after encerrar mints a fresh code for the same session (one active per session).',
  })
  @ApiOkResponse({ type: LiveCodeResponseDto })
  async open(@Param('id', ParseUUIDPipe) classId: string) {
    const ctx = requireTenantContext(this.cls);
    return this.liveCodes.open(ctx, classId);
  }

  @Post('live-codes/:id/close')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Encerrar chamada — invalidate code + QR, session → done',
  })
  @ApiOkResponse({ type: LiveCodeResponseDto })
  async close(@Param('id', ParseUUIDPipe) liveCodeId: string) {
    const ctx = requireTenantContext(this.cls);
    return this.liveCodes.close(ctx, liveCodeId);
  }

  @Get('live-codes/:id/attendances')
  @ApiOperation({
    summary: 'Live snapshot — also the 5 s polling fallback target',
    description: 'Active attendances only; revokes decrement the count.',
  })
  @ApiOkResponse({ type: LiveSnapshotResponseDto })
  async snapshot(@Param('id', ParseUUIDPipe) liveCodeId: string) {
    const ctx = requireTenantContext(this.cls);
    return this.liveCodes.snapshot(ctx, liveCodeId);
  }

  @Post('live-codes/:id/stream-ticket')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Mint the ~60 s single-purpose SSE ticket',
    description:
      'Normal bearer REST. The HMAC-signed ticket binds { liveCode, user, tenant } and is ' +
      'accepted only on the stream route — it is never a session credential. Reconnect ' +
      'after expiry mints a new one.',
  })
  @ApiOkResponse({ type: StreamTicketResponseDto })
  async mintTicket(@Param('id', ParseUUIDPipe) liveCodeId: string) {
    const ctx = requireTenantContext(this.cls);
    const ref = await this.liveCodes.ownedRef(ctx, liveCodeId);
    return this.tickets.mint({
      liveCodeId: ref.liveCodeId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });
  }

  /**
   * DOCUMENTED EXCEPTION to the generated REST contract (be-09): described in
   * the OpenAPI spec with its event payloads as component schemas, but the
   * generated clients do not call it — each client wires its own streaming
   * primitive (EventSource / react-native-sse / OkHttp SSE / URLSession).
   *
   * @Public because native EventSource cannot send Authorization headers; the
   * signed ticket in the query string IS the authentication (signature + TTL
   * + live-code binding verified before the stream opens, and the room lookup
   * runs under the ticket's tenant through withTenant so RLS stays intact).
   */
  @Public()
  @Sse('live-codes/:id/stream')
  @ApiProduces('text/event-stream')
  @ApiQuery({
    name: 'ticket',
    description: 'Ticket from POST /professor/live-codes/{id}/stream-ticket',
  })
  @ApiExtraModels(LiveStreamCheckinEventDto, LiveStreamRevokeEventDto)
  @ApiOperation({
    summary:
      'SSE stream: checkin / revoke events + 20 s heartbeat (contract exception)',
    description:
      'Server-Sent Events, not JSON. Protocol: fetch the snapshot first, then attach ' +
      '(no replay; Last-Event-ID unused in v1). `event: checkin` carries ' +
      'LiveStreamCheckinEventDto, `event: revoke` carries LiveStreamRevokeEventDto; a ' +
      '`heartbeat` event fires every 20 s. Events are emitted post-commit — only ' +
      'accepted check-ins ever appear. Fall back to polling the snapshot endpoint ' +
      'every 5 s when the stream fails to connect or drops twice.',
  })
  @ApiOkResponse({
    description: 'Event stream',
    content: {
      'text/event-stream': {
        schema: {
          oneOf: [
            { $ref: getSchemaPath(LiveStreamCheckinEventDto) },
            { $ref: getSchemaPath(LiveStreamRevokeEventDto) },
          ],
        },
      },
    },
  })
  async stream(
    @Param('id', ParseUUIDPipe) liveCodeId: string,
    @Query('ticket') ticket?: string,
  ): Promise<Observable<MessageEvent>> {
    const claims = this.tickets.verify(ticket, liveCodeId);
    // Belt & braces: the room lookup re-checks existence under the ticket's
    // tenant (RLS enforced) — a revoked/deleted live code cannot be attached.
    const room = await this.liveCodes.roomForTicket(
      claims.ten,
      claims.uid,
      liveCodeId,
    );

    const events$ = this.rooms
      .subscribe(room.classSessionId)
      .pipe(
        map((event): MessageEvent => ({ type: event.type, data: event.data })),
      );
    const heartbeat$ = interval(STREAM_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: 'ping' })),
    );
    return merge(events$, heartbeat$);
  }
}
