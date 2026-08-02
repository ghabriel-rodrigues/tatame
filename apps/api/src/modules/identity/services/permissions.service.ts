import { Inject, Injectable } from '@nestjs/common';
import { rolePermissions, withTenant, type DbHandle } from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { AcademyRole } from '../../../common/decorators.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { PERMISSION_REGISTRY, findDefinition } from './permission-registry.js';

interface CacheEntry {
  overrides: Map<string, boolean>; // `${role}:${key}` -> allowed
  expiresAt: number;
}

const TTL_MS = 30_000;

export interface ResolvedPermission {
  role: AcademyRole;
  key: string;
  label: string;
  defaultAllowed: boolean;
  allowed: boolean;
}

/**
 * Toggleable-permission resolution (guard chain layer 4) + the admin
 * management surface. Rows can only exist for registry entries; absent row =
 * code default. Toggles are per-academy data — never in the JWT, so changes
 * apply without token re-issue (short cache TTL).
 */
@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  private async loadOverrides(tenantId: string): Promise<Map<string, boolean>> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.overrides;

    const rows = await withTenant(this.appDb.db, tenantId, (tx) =>
      tx
        .select({
          role: rolePermissions.role,
          key: rolePermissions.permissionKey,
          allowed: rolePermissions.allowed,
        })
        .from(rolePermissions),
    );
    const overrides = new Map(rows.map((r) => [`${r.role}:${r.key}`, r.allowed]));
    this.cache.set(tenantId, { overrides, expiresAt: Date.now() + TTL_MS });
    return overrides;
  }

  /** Roles without a registry entry for `key` are governed by RolesGuard only. */
  async isAllowed(tenantId: string, role: string, key: string): Promise<boolean> {
    const definition = findDefinition(role, key);
    if (!definition) return true;
    const overrides = await this.loadOverrides(tenantId);
    return overrides.get(`${role}:${key}`) ?? definition.defaultAllowed;
  }

  /** Full resolved matrix (admin screen + the `/auth/me` toggle map). */
  async resolveAll(tenantId: string): Promise<ResolvedPermission[]> {
    const overrides = await this.loadOverrides(tenantId);
    return PERMISSION_REGISTRY.map((d) => ({
      role: d.role,
      key: d.key,
      label: d.label,
      defaultAllowed: d.defaultAllowed,
      allowed: overrides.get(`${d.role}:${d.key}`) ?? d.defaultAllowed,
    }));
  }

  /** Resolved toggle map for one role — the `/auth/me` bootstrap shape. */
  async resolveForRole(tenantId: string, role: string): Promise<Record<string, boolean>> {
    const all = await this.resolveAll(tenantId);
    return Object.fromEntries(all.filter((p) => p.role === role).map((p) => [p.key, p.allowed]));
  }

  /** Admin PUT: upserts toggles; unknown (role, key) pairs are rejected. */
  async update(
    tenantId: string,
    userId: string,
    entries: Array<{ role: AcademyRole; key: string; allowed: boolean }>,
  ): Promise<ResolvedPermission[]> {
    for (const entry of entries) {
      if (!findDefinition(entry.role, entry.key)) {
        throw problem(
          422,
          ErrorCodes.VALIDATION_FAILED,
          `Unknown toggleable permission: ${entry.role}/${entry.key}`,
        );
      }
    }

    await withTenant(this.appDb.db, { tenantId, userId }, async (tx) => {
      for (const entry of entries) {
        await tx
          .insert(rolePermissions)
          .values({
            tenantId,
            role: entry.role,
            permissionKey: entry.key,
            allowed: entry.allowed,
          })
          .onConflictDoUpdate({
            target: [rolePermissions.tenantId, rolePermissions.role, rolePermissions.permissionKey],
            set: { allowed: entry.allowed, updatedAt: new Date() },
          });
      }
    });

    this.cache.delete(tenantId);
    return this.resolveAll(tenantId);
  }
}
