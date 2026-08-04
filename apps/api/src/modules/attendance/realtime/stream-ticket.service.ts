import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_CONFIG, type AppConfig } from '../../../infra/config/app-config.js';

/** Single-purpose claims bound into the ticket — never a session credential. */
export interface StreamTicketClaims {
  /** Purpose tag: domain separation from every other signed artifact. */
  pur: 'live-stream';
  /** Live code (stream room) the ticket is valid for — and nothing else. */
  lc: string;
  ten: string;
  uid: string;
  /** Unix epoch seconds. */
  exp: number;
}

export const STREAM_TICKET_TTL_SECONDS = 60;

/**
 * HMAC-signed SSE stream tickets (resolved realtime decision be-09). Native
 * EventSource cannot set Authorization headers and bearer tokens in URLs
 * leak, so the mint endpoint (normal bearer REST) issues a ~60 s stateless
 * ticket over `{ liveCodeId, userId, tenantId }`; the stream route verifies
 * signature + TTL + live-code binding. Accepted only on the stream route.
 */
@Injectable()
export class StreamTicketService {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // Domain-separated key: a leaked ticket signature can never be confused
    // with (or forged from) an access token, and vice versa.
    this.key = createHmac('sha256', config.jwtAccessSecret).update('sse-stream-ticket-v1').digest();
  }

  mint(input: { liveCodeId: string; tenantId: string; userId: string }, ttlSeconds = STREAM_TICKET_TTL_SECONDS): {
    ticket: string;
    expiresInSeconds: number;
  } {
    const claims: StreamTicketClaims = {
      pur: 'live-stream',
      lc: input.liveCodeId,
      ten: input.tenantId,
      uid: input.userId,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { ticket: `${payload}.${this.sign(payload)}`, expiresInSeconds: ttlSeconds };
  }

  /** Throws 401 `stream.ticket_invalid` on any failure (forged, expired, wrong room). */
  verify(ticket: string | undefined, liveCodeId: string): StreamTicketClaims {
    if (!ticket) throw this.invalid('Missing stream ticket');
    const [payload, signature] = ticket.split('.');
    if (!payload || !signature) throw this.invalid('Malformed stream ticket');

    const expected = Buffer.from(this.sign(payload));
    const provided = Buffer.from(signature);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw this.invalid('Bad ticket signature');
    }

    let claims: StreamTicketClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw this.invalid('Malformed stream ticket');
    }
    if (claims.pur !== 'live-stream') throw this.invalid('Wrong ticket purpose');
    if (claims.lc !== liveCodeId) throw this.invalid('Ticket is bound to another live code');
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
      throw this.invalid('Stream ticket expired');
    }
    return claims;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }

  private invalid(detail: string) {
    return problem(401, ErrorCodes.STREAM_TICKET_INVALID, detail);
  }
}
