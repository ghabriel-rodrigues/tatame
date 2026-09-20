/**
 * Graduation display helpers (GRD.16/17). Pure formatting over server
 * payloads — belt, degrees and progress are all derived server-side
 * (derive-on-read doctrine); nothing here recomputes rules.
 */

import type { BeltView, GraduationEntry, GraduationProgress } from './types';

/** "2 graus" / "1 grau". */
export function degreesLabel(degrees: number): string {
  return `${degrees} ${degrees === 1 ? 'grau' : 'graus'}`;
}

/** Black belts count dans, everything else counts graus (belt-data keyed). */
function isBlackBelt(belt: BeltView): boolean {
  return belt.colorSlug === 'belt.black' || belt.colorSlug === 'black';
}

/** Hero title (aluno-09): "Azul · 2 graus"; degree-less: just the name. */
export function beltHeroTitle(belt: BeltView): string {
  return belt.degrees > 0
    ? `${belt.name} · ${degreesLabel(belt.degrees)}`
    : belt.name;
}

/** Rank chip (professor-12): "Faixa preta · 2º dan" / "Faixa azul · 2 graus". */
export function beltChipLabel(belt: BeltView): string {
  const base = `Faixa ${belt.name.toLocaleLowerCase('pt-BR')}`;
  if (belt.degrees <= 0) return base;
  return isBlackBelt(belt)
    ? `${base} · ${belt.degrees}º dan`
    : `${base} · ${degreesLabel(belt.degrees)}`;
}

/** Timeline entry title: "Azul · 2º grau" / "Faixa azul" / revogação. */
export function timelineEntryTitle(entry: GraduationEntry): string {
  if (entry.kind === 'revocation') return 'Graduação revogada';
  if (entry.kind === 'belt')
    return `Faixa ${entry.belt.name.toLocaleLowerCase('pt-BR')}`;
  return `${entry.belt.name} · ${entry.degree}º grau`;
}

/** "38 de 40 aulas · Próximo 3º grau" (professor-11 progress line). */
export function progressLine(progress: GraduationProgress): string {
  return `${progress.current} de ${progress.target} aulas · ${progress.label}`;
}

const MONTH_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

const MONTH_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

/** "Maio de 2026" — timeline entry date (aluno-09). */
export function monthYearPt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = MONTH_LONG[date.getMonth()] ?? '';
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} de ${date.getFullYear()}`;
}

/** "14 de novembro de 2024" — certificate award date (REP.12, spec 013). */
export function fullDatePt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} de ${MONTH_LONG[date.getMonth()] ?? ''} de ${date.getFullYear()}`;
}

/** "12 jul" — observação meta line (professor-11). */
export function shortDatePt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()] ?? ''}`;
}

/** "Prof. Rafael" — first-name author tag on observações (professor-11). */
export function professorTag(fullName: string): string {
  return `Prof. ${fullName.split(' ')[0] ?? fullName}`;
}
