/**
 * Shared graduation view shapes (spec 005). `BeltView` is the one belt payload
 * folded into every surface that lists students (GRD.6) — clients render it
 * with `BeltBar`/chips and never re-derive. Colors are design-token SLUGS
 * (`belt.blue`), never hex.
 */

/** Catalog belt reference — no per-student state. */
export interface BeltRef {
  beltId: string;
  /** PT-BR display name (client copy), e.g. `Azul`. */
  name: string;
  /** Design-token slug, e.g. `belt.blue`. */
  colorSlug: string;
  /** Ponteira override slug; null = the component's default `belt.tip`. */
  tipColorSlug: string | null;
  maxDegrees: number;
}

/** Current belt of a student — derived, never cached (GRD.6). */
export interface BeltView extends BeltRef {
  /** Current degree count on this belt (0 right after a belt promotion). */
  degrees: number;
}

/** Catalog belt in the merged handoff ladder display order. */
export interface CatalogBelt extends BeltRef {
  ladderKind: 'adult' | 'kids';
  /** Promotion order within its own ladder, 1-based. */
  position: number;
}

/**
 * Derived progress toward the next milestone (GRD.7): active attendances
 * since the last non-reversed award vs the academy's lessons-per-degree rule
 * for the current belt.
 */
export interface ProgressView {
  /** Active (non-revoked) lessons since the last award (lifetime when none). */
  current: number;
  /** The academy's lessons_per_degree for the current belt (default 40). */
  target: number;
  /** PT-BR convenience label: `Próximo 3º grau` / `Próxima faixa`. */
  label: string;
  nextMilestone: {
    kind: 'degree' | 'belt';
    /** The degree the bar points at; null when the milestone is the next belt. */
    degree: number | null;
  };
}

/** One immutable history row (award or revocation compensation). */
export interface GraduationEntry {
  id: string;
  kind: 'degree' | 'belt' | 'revocation';
  belt: BeltRef;
  /** Degree awarded; 0 on belt promotions and revocations. */
  degree: number;
  awardedAt: Date;
  awardedBy: { userId: string; fullName: string };
  notes: string | null;
  /** Award reversed by a later revocation compensation row. */
  reversed: boolean;
  /** Set on revocation rows — the reversed award. */
  reversesGraduationId: string | null;
  /**
   * "Ver certificado" unlock — real since spec 013 (REP.7): true exactly on
   * non-reversed belt-promotion entries; the certificate renders client-side.
   */
  certificateAvailable: boolean;
}

/** Régua row: catalog belt merged with the academy's rule override. */
export interface GraduationRuleRow extends BeltRef {
  ladderKind: 'adult' | 'kids';
  lessonsPerDegree: number;
  enabled: boolean;
  /** Only kids-ladder belts can be toggled off (story 24/25). */
  toggleable: boolean;
}

/** Persistent staff observação (GRD.10) — never visible to the aluno. */
export interface StudentNoteView {
  id: string;
  body: string;
  createdAt: Date;
  author: { userId: string; fullName: string };
}

/** Default lessons-per-degree when the academy has no override row. */
export const DEFAULT_LESSONS_PER_DEGREE = 40;
/** Configuration floor (story 23, CHECK constraint mirror). */
export const MIN_LESSONS_PER_DEGREE = 10;
