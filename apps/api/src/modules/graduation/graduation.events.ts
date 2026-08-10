/**
 * Domain events for the graduation slice (spec 010 delta — the module's
 * first bus event). Emitted on the `@nestjs/event-emitter` bus AFTER the
 * tenant transaction commits (mirrors the attendance pattern), by the award
 * path ONLY: the initial-belt seed at student creation is setup (not news)
 * and revocations stay audit-only (a correction is not news). The audit seam
 * (`graduation.awarded` audit action) is unchanged — audit is the record,
 * the bus event is the announcement.
 */

export const GRADUATION_AWARDED = 'graduation.awarded';

export interface GraduationAwardedEvent {
  tenantId: string;
  studentId: string;
  /** PT-BR display name — templates render "{aluno} recebeu …". */
  studentName: string;
  /** Guardian of the student (minors); null = no guardian audience. */
  guardianId: string | null;
  /** Catalog belt display name, e.g. `Azul`. */
  beltName: string;
  /** Degree awarded; 0 on belt promotions. */
  degree: number;
  kind: 'degree' | 'belt';
  /** Display name for the "Registrado pelo Prof. …" body line. */
  awardedByName: string;
}
