import { Injectable } from '@nestjs/common';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import {
  beltLadders,
  belts,
  martialArts,
  studentGraduations,
  users,
  type DbTransaction,
} from '@tatame/db';
import { ErrorCodes, problem } from '../../../common/problem.js';
import type { BeltRef, BeltView, CatalogBelt, GraduationEntry } from '../graduation.types.js';

/** v1 ships jiu-jitsu only; other arts are future catalog rows (charter). */
const MARTIAL_ART_KEY = 'bjj';

/**
 * Current-belt derivation + catalog reads (GRD.6). The current belt is
 * DERIVED, never cached: the latest non-reversed award row (`kind` in
 * degree/belt) ordered by `awarded_at` then insertion; no row ⇒ presentation
 * default of white (Branca, adult position 1) with zero degrees — no
 * synthetic row is ever written. Kids vs adult comes from the awarded belt
 * itself. All methods run inside a caller-provided tenant transaction so the
 * numbers share the snapshot of whatever surface folds them in.
 */
@Injectable()
export class GraduationQueryService {
  /**
   * Catalog belts in the handoff régua display order — the kids ladder
   * splices between Branca and Azul (documented server-side merge rule):
   * Branca, Cinza, Amarela, Laranja, Verde, Azul, Roxa, Marrom, Preta,
   * Vermelha.
   */
  async mergedCatalog(tx: DbTransaction): Promise<CatalogBelt[]> {
    const rows = await tx
      .select({
        beltId: belts.id,
        ladderKind: beltLadders.kind,
        position: belts.position,
        name: belts.name,
        colorSlug: belts.colorSlug,
        tipColorSlug: belts.tipColorSlug,
        maxDegrees: belts.maxDegrees,
      })
      .from(belts)
      .innerJoin(beltLadders, eq(beltLadders.id, belts.ladderId))
      .innerJoin(martialArts, eq(martialArts.id, beltLadders.martialArtId))
      .where(eq(martialArts.key, MARTIAL_ART_KEY))
      .orderBy(asc(belts.position));
    const adult = rows.filter((r) => r.ladderKind === 'adult');
    const kids = rows.filter((r) => r.ladderKind === 'kids');
    const first = adult[0];
    return first ? [first, ...kids, ...adult.slice(1)] : kids;
  }

  /** Catalog belts keyed by id (same merged read, map form). */
  async catalogById(tx: DbTransaction): Promise<Map<string, CatalogBelt>> {
    const catalog = await this.mergedCatalog(tx);
    return new Map(catalog.map((belt) => [belt.beltId, belt]));
  }

  /** The presentation default: Branca (adult ladder, position 1), 0 degrees. */
  async defaultBelt(tx: DbTransaction): Promise<CatalogBelt> {
    const catalog = await this.mergedCatalog(tx);
    const branca = catalog.find((b) => b.ladderKind === 'adult' && b.position === 1);
    if (!branca) {
      throw problem(500, ErrorCodes.INTERNAL, 'Belt catalog not seeded (no adult position-1 belt)');
    }
    return branca;
  }

  /**
   * Batch current-belt derivation for list surfaces (registry rows, rosters,
   * dependents): one graduations query + the catalog, resolved in memory —
   * every requested student gets an entry (white default when historyless).
   */
  async currentBeltMap(tx: DbTransaction, studentIds: string[]): Promise<Map<string, BeltView>> {
    const map = new Map<string, BeltView>();
    if (studentIds.length === 0) return map;
    const [catalog, fallback] = [await this.catalogById(tx), await this.defaultBelt(tx)];

    const rows =
      studentIds.length === 0
        ? []
        : await tx
            .select({
              id: studentGraduations.id,
              studentId: studentGraduations.studentId,
              beltId: studentGraduations.beltId,
              kind: studentGraduations.kind,
              degree: studentGraduations.degree,
              awardedAt: studentGraduations.awardedAt,
              createdAt: studentGraduations.createdAt,
              reversesGraduationId: studentGraduations.reversesGraduationId,
            })
            .from(studentGraduations)
            .where(inArray(studentGraduations.studentId, studentIds))
            .orderBy(asc(studentGraduations.awardedAt), asc(studentGraduations.createdAt));

    const latestByStudent = new Map<string, (typeof rows)[number]>();
    const reversed = new Set(
      rows.filter((r) => r.reversesGraduationId != null).map((r) => r.reversesGraduationId),
    );
    for (const row of rows) {
      if (row.kind === 'revocation' || reversed.has(row.id)) continue;
      // Rows arrive ordered by (awarded_at, created_at) — last one wins.
      latestByStudent.set(row.studentId, row);
    }

    for (const studentId of studentIds) {
      const latest = latestByStudent.get(studentId);
      const belt = latest ? catalog.get(latest.beltId) : undefined;
      map.set(studentId, {
        beltId: (belt ?? fallback).beltId,
        name: (belt ?? fallback).name,
        colorSlug: (belt ?? fallback).colorSlug,
        tipColorSlug: (belt ?? fallback).tipColorSlug,
        maxDegrees: (belt ?? fallback).maxDegrees,
        degrees: latest && belt ? latest.degree : 0,
      });
    }
    return map;
  }

  /** Single-student convenience over `currentBeltMap`. */
  async currentBelt(tx: DbTransaction, studentId: string): Promise<BeltView> {
    const map = await this.currentBeltMap(tx, [studentId]);
    const belt = map.get(studentId);
    if (!belt) throw problem(500, ErrorCodes.INTERNAL, 'Belt derivation returned no entry');
    return belt;
  }

  /**
   * Derived state for the progress engine: the current belt plus the progress
   * anchor — the latest non-reversed award's `awarded_at` (null when the
   * student has no award, meaning lifetime lesson count).
   */
  async currentState(
    tx: DbTransaction,
    studentId: string,
  ): Promise<{ belt: BeltView; anchor: Date | null }> {
    const rows = await tx
      .select({
        id: studentGraduations.id,
        beltId: studentGraduations.beltId,
        kind: studentGraduations.kind,
        degree: studentGraduations.degree,
        awardedAt: studentGraduations.awardedAt,
        createdAt: studentGraduations.createdAt,
        reversesGraduationId: studentGraduations.reversesGraduationId,
      })
      .from(studentGraduations)
      .where(eq(studentGraduations.studentId, studentId))
      .orderBy(asc(studentGraduations.awardedAt), asc(studentGraduations.createdAt));
    const reversed = new Set(
      rows.filter((r) => r.reversesGraduationId != null).map((r) => r.reversesGraduationId),
    );
    const awards = rows.filter((r) => r.kind !== 'revocation' && !reversed.has(r.id));
    const latest = awards[awards.length - 1];
    if (!latest) {
      const fallback = await this.defaultBelt(tx);
      return { belt: { ...this.toRef(fallback), degrees: 0 }, anchor: null };
    }
    const catalog = await this.catalogById(tx);
    const belt = catalog.get(latest.beltId);
    if (!belt) throw problem(500, ErrorCodes.INTERNAL, 'Awarded belt missing from catalog');
    return { belt: { ...this.toRef(belt), degrees: latest.degree }, anchor: latest.awardedAt };
  }

  /**
   * Full immutable history, newest first — the aluno "Histórico de evolução"
   * timeline and the admin per-student history (revocations included; awards
   * carry a `reversed` flag). `certificateAvailable` is REAL since spec 013
   * (REP.7): true exactly on non-reversed belt-promotion entries — the
   * client-rendered certificate view unlocks on it; degree, revocation and
   * reversed entries stay false. No certificate endpoint exists — the view
   * renders from timeline data plus the session's academy name and brand.
   */
  async timeline(tx: DbTransaction, studentId: string): Promise<GraduationEntry[]> {
    const rows = await tx
      .select({
        id: studentGraduations.id,
        beltId: studentGraduations.beltId,
        kind: studentGraduations.kind,
        degree: studentGraduations.degree,
        awardedAt: studentGraduations.awardedAt,
        notes: studentGraduations.notes,
        reversesGraduationId: studentGraduations.reversesGraduationId,
        awardedByUserId: studentGraduations.awardedByUserId,
        awardedByName: users.fullName,
      })
      .from(studentGraduations)
      .innerJoin(users, eq(users.id, studentGraduations.awardedByUserId))
      .where(eq(studentGraduations.studentId, studentId))
      .orderBy(desc(studentGraduations.awardedAt), desc(studentGraduations.createdAt));
    const catalog = await this.catalogById(tx);
    const reversed = new Set(
      rows.filter((r) => r.reversesGraduationId != null).map((r) => r.reversesGraduationId),
    );
    return rows.map((row) => {
      const belt = catalog.get(row.beltId);
      if (!belt) throw problem(500, ErrorCodes.INTERNAL, 'Awarded belt missing from catalog');
      return {
        id: row.id,
        kind: row.kind,
        belt: this.toRef(belt),
        degree: row.degree,
        awardedAt: row.awardedAt,
        awardedBy: { userId: row.awardedByUserId, fullName: row.awardedByName },
        notes: row.notes,
        reversed: reversed.has(row.id),
        reversesGraduationId: row.reversesGraduationId,
        certificateAvailable: row.kind === 'belt' && !reversed.has(row.id),
      };
    });
  }

  private toRef(belt: CatalogBelt): BeltRef {
    return {
      beltId: belt.beltId,
      name: belt.name,
      colorSlug: belt.colorSlug,
      tipColorSlug: belt.tipColorSlug,
      maxDegrees: belt.maxDegrees,
    };
  }
}
