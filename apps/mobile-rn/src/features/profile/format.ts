/**
 * Dados pessoais display helpers (REP.10, aluno-18). Pure formatting and
 * the Cidade / UF single-input parsing — validation truth stays
 * server-side (CPF checksum, UF list, CEP format); these helpers only
 * render masks and split the combined field into the two typed columns.
 */

import type { ProfileGender } from './types';

/** "12345678900" → "123.456.789-00" (server stores bare digits). */
export function formatCpf(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 11);
  if (d.length !== 11) return digits;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Mask while typing: keeps digits, dots and dash in CPF positions. */
export function maskCpfInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter((p) => p.length > 0);
  const base = parts.join('.');
  return d.length > 9 ? `${base}-${d.slice(9)}` : base;
}

/** "01310100" → "01310-100" (server stores 8 bare digits). */
export function formatCep(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8);
  if (d.length !== 8) return digits;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Mask while typing: "01310100" → "01310-100". */
export function maskCepInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** ISO "2000-03-15" → "15/03/2000" (read-only birth-date field). */
export function isoToBrDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** ("São Paulo", "SP") → "São Paulo / SP" — the aluno-18 combined field. */
export function joinCityUf(city: string | null, state: string | null): string {
  if (city && state) return `${city} / ${state}`;
  return city ?? state ?? '';
}

/**
 * "São Paulo / SP" → { city, state } for the two typed columns; a value
 * without the separator is all city (state null). Empty → both null.
 */
export function parseCityUf(input: string): { city: string | null; state: string | null } {
  const trimmed = input.trim();
  if (!trimmed) return { city: null, state: null };
  const slash = trimmed.lastIndexOf('/');
  if (slash === -1) return { city: trimmed, state: null };
  const city = trimmed.slice(0, slash).trim();
  const state = trimmed.slice(slash + 1).trim().toUpperCase();
  return { city: city || null, state: state || null };
}

/** PT-BR labels for the gender enum (aluno-18 "Sexo" field). */
export const GENDER_LABELS: Record<ProfileGender, string> = {
  female: 'Feminino',
  male: 'Masculino',
  other: 'Outro',
  unspecified: 'Prefiro não informar',
};

export const GENDER_OPTIONS = Object.keys(GENDER_LABELS) as ProfileGender[];
