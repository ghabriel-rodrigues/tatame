import { Inject, Injectable } from '@nestjs/common';
import { academies, withTenant, type DbHandle } from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';

export type AcademyStatus = 'trial' | 'active' | 'delinquent' | 'suspended';

interface CacheEntry {
  status: AcademyStatus;
  expiresAt: number;
}

/** Status changes are rare and platform-driven — 30 s staleness is accepted. */
const TTL_MS = 30_000;

/**
 * Academy (tenant) status resolution for the AcademyStatusGuard, with a
 * short-TTL in-process cache. Reads the academy's own row through the
 * RLS-scoped path (`academies_own_row_select` policy).
 */
@Injectable()
export class AcademyStatusService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async getStatus(tenantId: string): Promise<AcademyStatus | null> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.status;

    const rows = await withTenant(this.appDb.db, tenantId, (tx) =>
      tx.select({ status: academies.status }).from(academies),
    );
    const status = (rows[0]?.status as AcademyStatus | undefined) ?? null;
    if (status) {
      this.cache.set(tenantId, { status, expiresAt: Date.now() + TTL_MS });
    }
    return status;
  }

  /** Reactivation must be instant in tests/admin flows. */
  invalidate(tenantId?: string): void {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }
}
