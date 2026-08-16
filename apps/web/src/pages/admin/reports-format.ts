/**
 * Reports display + export helpers (REP.9, admin-18, spec 013). The row
 * catalog carries the five report titles and the spec's exact subtitles; the
 * CSV path is an authenticated fetch through the shared client saved via a
 * blob URL (the API wants the bearer header, so a bare <a href> cannot
 * work) with the server's Content-Disposition filename. The PDF path is the
 * print-friendly route — print-to-PDF is the v1 delivery (recorded debt).
 */
import type { AdminReportSlug, ApiClient } from '@tatame/shared';
import { monthName } from '../billing-format';
import { ORDER_STATUS_LABELS } from './store-format';

export interface ReportRowSpec {
  slug: AdminReportSlug;
  title: string;
  /** admin-18 subtitle; month-windowed reports interpolate the chosen mês. */
  subtitle: (month: string) => string;
}

/** The five admin-18 rows, subtitles verbatim from spec 013. */
export const REPORT_ROWS: ReportRowSpec[] = [
  {
    slug: 'financeiro',
    title: 'Financeiro mensal',
    subtitle: (month) => `Receita, inadimplência e previsto · ${monthName(month)}`,
  },
  {
    slug: 'frequencia',
    title: 'Frequência por turma',
    subtitle: (month) => `Presenças e faltas por aluno · ${monthName(month)}`,
  },
  {
    slug: 'inadimplencia',
    title: 'Inadimplência',
    subtitle: () => 'Cobranças vencidas e notificações enviadas',
  },
  {
    slug: 'graduacoes',
    title: 'Graduações',
    subtitle: () => 'Promoções e graus registrados no semestre',
  },
  {
    slug: 'loja',
    title: 'Vendas da loja',
    subtitle: () => 'Pedidos, itens e vendas do mês',
  },
];

const SLUGS: ReadonlyArray<AdminReportSlug> = REPORT_ROWS.map((row) => row.slug);

export function isReportSlug(value: string | undefined): value is AdminReportSlug {
  return SLUGS.includes(value as AdminReportSlug);
}

/** Report title for a slug ("Financeiro mensal"). */
export function reportTitle(slug: AdminReportSlug): string {
  return REPORT_ROWS.find((row) => row.slug === slug)!.title;
}

/** "2026-08" — the current month in the browser's local calendar. */
export function currentPeriod(today: Date = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

/** The "2026-06" period preceding a "2026-07" period. */
export function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return `${prev.year}-${String(prev.month).padStart(2, '0')}`;
}

/** "Julho 2026" — capitalized picker/print label for a "2026-07" period. */
export function periodLabel(period: string): string {
  const name = monthName(period);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${period.slice(0, 4)}`;
}

/** Newest-first month options for the picker (current month included). */
export function monthOptions(
  count = 12,
  today: Date = new Date(),
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  let period = currentPeriod(today);
  for (let i = 0; i < count; i += 1) {
    options.push({ value: period, label: periodLabel(period) });
    period = previousPeriod(period);
  }
  return options;
}

/** "1º semestre de 2026" from a "2026-S1" window label. */
export function semesterLabel(label: string): string {
  const year = label.slice(0, 4);
  return `${label.endsWith('S1') ? '1º' : '2º'} semestre de ${year}`;
}

/** The print-friendly route the PDF button opens in a new tab. */
export function reportPrintUrl(slug: AdminReportSlug, month: string): string {
  return `/admin/relatorios/${slug}/imprimir?month=${month}`;
}

/** Filename from a Content-Disposition header, or the contract fallback. */
export function contentDispositionFilename(
  header: string | null,
  fallback: string,
): string {
  const match = header?.match(/filename="?([^";]+)"?/);
  return match?.[1] ?? fallback;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Authenticated CSV download (REP.9): bearer fetch through the shared
 * client, saved as a file named by the server. Resolves the filename;
 * rejects on any non-2xx so the caller can surface the error state.
 */
export async function downloadReportCsv(
  client: ApiClient,
  report: AdminReportSlug,
  month: string,
): Promise<string> {
  const { data, error, response } = await client.GET('/v1/admin/reports/{report}/csv', {
    params: { path: { report }, query: { month } },
    parseAs: 'blob',
  });
  if (error !== undefined || !data) throw new Error(`csv export failed for ${report}`);
  const filename = contentDispositionFilename(
    response.headers.get('Content-Disposition'),
    `${report}-${month}.csv`,
  );
  saveBlob(data, filename);
  return filename;
}

/** Financeiro origin chips (plan/event/order → PT-BR). */
export const ORIGIN_LABELS: Record<'plan' | 'event' | 'order', string> = {
  plan: 'Plano',
  event: 'Evento',
  order: 'Loja',
};

/** Charge status vocabulary for the financeiro table (fallback: raw). */
const CHARGE_STATUS_LABELS: Record<string, string> = {
  open: 'Em aberto',
  overdue: 'Vencida',
  paid: 'Paga',
  canceled: 'Cancelada',
};

export function chargeStatusLabel(status: string): string {
  return CHARGE_STATUS_LABELS[status] ?? status;
}

/** Loja table statuses reuse the spec-009 vocabulary (fallback: raw). */
export function orderStatusLabel(status: string): string {
  return (ORDER_STATUS_LABELS as Record<string, string>)[status] ?? status;
}
