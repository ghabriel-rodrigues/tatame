import { and, asc, eq, inArray } from 'drizzle-orm';
import { charges, type DbTransaction } from '@tatame/db';

/**
 * "Mensalidade em aberto" alert data (spec 006, BIL.8/BIL.9): the aluno home
 * alert and the responsável dependent cards derive from REAL charge rows —
 * pure predicate reads (`open|overdue`, overdue = past due date), no
 * materialization side effects at these entry points (those belong to the
 * wallet/overview fetches per the resolved on-read decision).
 */
export interface MensalidadeAlert {
  chargeId: string;
  amountCents: number;
  currency: string;
  /** Tenant-local YYYY-MM-DD. */
  dueDate: string;
  /** Derived truth — never trusts the lazy status flip. */
  overdue: boolean;
  /** Competência start (client derives the month label). */
  periodStart: string | null;
}

/**
 * Earliest-due open plan charge per student. Absent key = nothing open (paid
 * up or no plan) — billing never invents money.
 */
export async function mensalidadeAlerts(
  tx: DbTransaction,
  studentIds: string[],
  todayIso: string,
): Promise<Map<string, MensalidadeAlert>> {
  const map = new Map<string, MensalidadeAlert>();
  if (studentIds.length === 0) return map;
  const rows = await tx
    .select({
      studentId: charges.studentId,
      id: charges.id,
      amountCents: charges.amountCents,
      currency: charges.currency,
      dueDate: charges.dueDate,
      periodStart: charges.periodStart,
    })
    .from(charges)
    .where(
      and(
        eq(charges.origin, 'plan'),
        inArray(charges.status, ['open', 'overdue']),
        inArray(charges.studentId, studentIds),
      ),
    )
    .orderBy(asc(charges.dueDate));
  for (const row of rows) {
    // Plan charges always carry their student; the null branch is unreachable
    // here (order charges are filtered out) but keeps the types honest.
    if (!row.studentId || map.has(row.studentId)) continue; // earliest due wins
    map.set(row.studentId, {
      chargeId: row.id,
      amountCents: row.amountCents,
      currency: row.currency,
      dueDate: row.dueDate,
      overdue: row.dueDate < todayIso,
      periodStart: row.periodStart,
    });
  }
  return map;
}
