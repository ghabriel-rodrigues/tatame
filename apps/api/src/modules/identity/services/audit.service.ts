import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { DbHandle } from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';

export interface AuditEntry {
  tenantId: string | null;
  actorUserId: string;
  impersonatorUserId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only audit trail (AUTH.10). Writes go through the `audit_append`
 * SECURITY DEFINER seam — audit_logs is FORCE RLS with no app write policy,
 * so this is the only path a compromised app-role connection could use, and
 * it can only ever insert.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.appDb.db.execute(sql`
      SELECT audit_append(
        ${entry.tenantId}::uuid,
        ${entry.actorUserId}::uuid,
        ${entry.impersonatorUserId}::uuid,
        ${entry.action},
        ${entry.targetType ?? null},
        ${entry.targetId ?? null},
        ${entry.metadata ? JSON.stringify(entry.metadata) : null}::jsonb
      )
    `);
  }
}
