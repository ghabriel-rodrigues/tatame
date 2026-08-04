/**
 * Append-only table registry (resolved audit/immutability decision, spec 004
 * ATT.3). Every table listed here is history: the meta-test in
 * `tests/migrations.spec.ts` asserts, straight from the pg catalogs, that
 * each entry has
 *
 *  - no UPDATE/DELETE grants for `tatame_app` or `tatame_platform`,
 *  - no UPDATE/DELETE (or ALL) RLS policies, and
 *  - the `forbid_mutation()` BEFORE UPDATE OR DELETE guard trigger —
 *
 * and, conversely, that every table carrying the guard trigger is declared
 * here. A future append-only table (e.g. `student_graduations`) joins the
 * sweep by adding its name and shipping the same hardening in its migration —
 * it cannot ship unguarded without failing the meta-test.
 *
 * `attendances` carries the trigger's single sanctioned exception: an UPDATE
 * whose only change is `revoked_at`/`revoked_by_user_id`/`revoke_reason`
 * going from NULL to non-NULL (the `attendance_revoke` void seam).
 */
export const APPEND_ONLY_TABLES = ['attendances', 'audit_logs'] as const;

export type AppendOnlyTable = (typeof APPEND_ONLY_TABLES)[number];
