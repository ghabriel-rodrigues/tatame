import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { authenticator } from 'otplib';
import type { DbHandle } from '@tatame/db';
import {
  APP_CONFIG,
  type AppConfig,
} from '../../../infra/config/app-config.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import {
  MembershipService,
  type PlatformProfile,
} from './membership.service.js';
import { TokenService } from './token.service.js';

const RECOVERY_CODE_COUNT = 10;

/**
 * Opt-in TOTP for platform staff (RFC 6238 via otplib). Secrets are encrypted
 * at rest (AES-256-GCM under TOTP_ENC_KEY); recovery codes are hashed
 * single-use. Enforcement flag is out of v1 scope.
 */
@Injectable()
export class TotpService {
  private readonly encKey: Buffer;

  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly memberships: MembershipService,
    private readonly tokens: TokenService,
  ) {
    this.encKey = createHash('sha256').update(config.totpEncKey).digest();
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((b) => b.toString('base64url'))
      .join('.');
  }

  private decrypt(stored: string): string {
    const [iv, tag, data] = stored
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }

  /** Generates + stores the pending secret; returns the provisioning URI. */
  async setup(
    userId: string,
    email: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const secret = authenticator.generateSecret();
    const result = await this.appDb.db.execute(
      sql`SELECT auth_totp_set_secret(${userId}::uuid, ${this.encrypt(secret)}) AS status`,
    );
    const status = (result.rows[0] as { status: string }).status;
    if (status === 'already_enabled') {
      throw problem(
        409,
        ErrorCodes.CONFLICT,
        'TOTP is already enabled for this account',
      );
    }
    if (status !== 'stored') {
      throw problem(
        403,
        ErrorCodes.AUTHZ_FORBIDDEN_ROLE,
        'TOTP is available to platform staff only',
      );
    }
    return {
      secret,
      otpauthUri: authenticator.keyuri(email, 'Tatame', secret),
    };
  }

  /** Verifies the first code, arms the factor, returns one-time recovery codes. */
  async enable(
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const profile = await this.memberships.getPlatformProfile(userId);
    if (!profile?.totpSecret) {
      throw problem(409, ErrorCodes.CONFLICT, 'Run TOTP setup before enabling');
    }
    if (profile.totpEnabled) {
      throw problem(
        409,
        ErrorCodes.CONFLICT,
        'TOTP is already enabled for this account',
      );
    }
    if (!authenticator.check(code, this.decrypt(profile.totpSecret))) {
      throw problem(400, ErrorCodes.AUTH_MFA_INVALID_CODE, 'Invalid TOTP code');
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomBytes(5).toString('hex'),
    );
    const hashes = recoveryCodes.map((c) => this.tokens.hashToken(c));
    const result = await this.appDb.db.execute(
      sql`SELECT auth_totp_enable(${userId}::uuid, ${JSON.stringify(hashes)}::jsonb) AS status`,
    );
    const status = (result.rows[0] as { status: string }).status;
    if (status !== 'enabled') {
      throw problem(409, ErrorCodes.CONFLICT, `TOTP enable failed: ${status}`);
    }
    return { recoveryCodes };
  }

  /** Login completion: accepts a live TOTP code or a single-use recovery code. */
  async verifyLoginCode(
    userId: string,
    profile: PlatformProfile,
    code: string,
  ): Promise<boolean> {
    if (
      profile.totpSecret &&
      authenticator.check(code, this.decrypt(profile.totpSecret))
    ) {
      return true;
    }
    const result = await this.appDb.db.execute(
      sql`SELECT auth_totp_consume_recovery(${userId}::uuid, ${this.tokens.hashToken(code)}) AS ok`,
    );
    return (result.rows[0] as { ok: boolean }).ok;
  }
}
