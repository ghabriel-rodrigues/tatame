import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { DbHandle } from '@tatame/db';
import { APP_CONFIG, type AppConfig } from '../../../infra/config/app-config.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../../infra/notifications/notification.port.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 h, single use

/**
 * Password reset (ticket 02): forgot always answers 202 (no enumeration);
 * reset consumes the single-use token, swaps the argon2id hash and revokes
 * every session of the user — all inside the SECURITY DEFINER seams.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /** Fire-and-acknowledge: the caller returns 202 regardless. */
  async requestReset(email: string): Promise<void> {
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    const result = await this.appDb.db.execute(sql`
      SELECT * FROM auth_request_password_reset(
        ${email}, ${this.tokens.hashToken(raw)}, ${expiresAt.toISOString()}::timestamptz
      )
    `);
    const row = result.rows[0] as { email: string; full_name: string } | undefined;
    if (!row) return; // unknown email — same outward behavior

    await this.notifications.sendPasswordReset({
      to: row.email,
      fullName: row.full_name,
      resetUrl: `${this.config.webUrl}/reset-password?token=${raw}`,
      deepLink: `tatame://reset?token=${raw}`,
    });
  }

  async reset(rawToken: string, newPassword: string): Promise<void> {
    const newHash = await this.passwords.hash(newPassword);
    const result = await this.appDb.db.execute(sql`
      SELECT * FROM auth_consume_password_reset(${this.tokens.hashToken(rawToken)}, ${newHash})
    `);
    const row = result.rows[0] as { status: string } | undefined;
    if (row?.status !== 'reset') {
      throw problem(400, ErrorCodes.RESET_INVALID_OR_EXPIRED, 'Reset token is invalid or expired');
    }
  }
}
