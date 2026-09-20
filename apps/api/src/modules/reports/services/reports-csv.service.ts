import { Injectable } from '@nestjs/common';
import { localDate } from '../../attendance/lib/time.js';
import { csvLine, csvMoney } from '../lib/csv.js';
import type { ReportView } from './reports.service.js';

export interface CsvDocument {
  /** `<slug>-<YYYY-MM>.csv` — the Content-Disposition filename. */
  filename: string;
  /** Lines WITHOUT the BOM — the controller streams BOM + lines. */
  lines: string[];
}

/** Tenant-local ISO date of a timestamp, empty for null. */
const isoDay = (at: Date | null): string => (at ? localDate(at) : '');

/**
 * CSV serialization of the report read models (spec 013, REP.4) — one source
 * of truth, two serializations: the JSON view is computed once and rendered
 * here as the pt-BR-Excel-friendly file (BOM + semicolon + decimal-comma
 * money + ISO dates; headers are PT-BR client copy, snake_cased).
 */
@Injectable()
export class ReportsCsvService {
  render(view: ReportView): CsvDocument {
    switch (view.report) {
      case 'financeiro':
        return {
          filename: `financeiro-${view.month}.csv`,
          lines: [
            csvLine([
              'aluno',
              'origem',
              'competencia',
              'vencimento',
              'status',
              'valor',
              'pago_em',
            ]),
            ...view.rows.map((r) =>
              csvLine([
                r.studentName,
                r.origin,
                r.periodStart,
                r.dueDate,
                r.status,
                csvMoney(r.amountCents),
                isoDay(r.paidAt),
              ]),
            ),
          ],
        };
      case 'frequencia':
        return {
          filename: `frequencia-${view.month}.csv`,
          lines: [
            csvLine(['turma', 'aluno', 'presencas', 'faltas', 'percentual']),
            ...view.classes.flatMap((klass) =>
              klass.students.map((s) =>
                csvLine([
                  klass.className,
                  s.studentName,
                  s.presencas,
                  s.faltas,
                  s.presencePct,
                ]),
              ),
            ),
          ],
        };
      case 'inadimplencia':
        return {
          // As-of-now snapshot — the filename carries the current month.
          filename: `inadimplencia-${view.asOf.slice(0, 7)}.csv`,
          lines: [
            csvLine([
              'aluno',
              'responsavel',
              'vencimento',
              'dias_em_atraso',
              'notificacoes_enviadas',
              'valor',
            ]),
            ...view.rows.map((r) =>
              csvLine([
                r.studentName,
                r.guardianName,
                r.dueDate,
                r.daysOverdue,
                r.notificationsSent,
                csvMoney(r.amountCents),
              ]),
            ),
          ],
        };
      case 'graduacoes':
        return {
          filename: `graduacoes-${view.month}.csv`,
          lines: [
            csvLine(['aluno', 'tipo', 'faixa', 'grau', 'professor', 'data']),
            ...view.rows.map((r) =>
              csvLine([
                r.studentName,
                r.kind === 'belt' ? 'faixa' : 'grau',
                r.beltName,
                r.degree,
                r.awardedByName,
                isoDay(r.awardedAt),
              ]),
            ),
          ],
        };
      case 'loja':
        return {
          filename: `loja-${view.month}.csv`,
          lines: [
            csvLine([
              'pedido',
              'data',
              'comprador',
              'produto',
              'tamanho',
              'quantidade',
              'valor',
              'status',
            ]),
            ...view.rows.map((r) =>
              csvLine([
                `#${r.number}`,
                r.date,
                r.buyerName,
                r.productName,
                r.size,
                r.quantity,
                csvMoney(r.amountCents),
                r.status,
              ]),
            ),
          ],
        };
    }
  }
}
