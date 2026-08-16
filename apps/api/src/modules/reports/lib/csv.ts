/**
 * CSV serialization for the report exports (spec 013, REP.4): UTF-8 with BOM,
 * SEMICOLON delimiter and decimal-comma money — the combination pt-BR Excel
 * opens correctly by double-click. ISO dates; CRLF line endings.
 */

/** UTF-8 byte-order mark — pt-BR Excel's cue that the file is UTF-8. */
export const CSV_BOM = '\ufeff';

export type CsvValue = string | number | null | undefined;

/** Integer cents → decimal-comma money string (`18000` → `"180,00"`). */
export function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Quotes a field when it carries the delimiter, quotes or line breaks. */
function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One CRLF-terminated CSV line from its cells. */
export function csvLine(cells: CsvValue[]): string {
  return `${cells.map(csvField).join(';')}\r\n`;
}
