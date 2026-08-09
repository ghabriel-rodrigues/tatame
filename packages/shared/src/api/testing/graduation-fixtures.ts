/**
 * Graduation fixtures (GRD.12-14 web slice). The BJJ catalog in the handoff
 * régua display order (Branca, Cinza, Amarela, Laranja, Verde, Azul, Roxa,
 * Marrom, Preta, Vermelha), rule rows with the seeded defaults (40 aulas por
 * grau, Laranja disabled) and graduation-history entries — all contract-typed
 * against the committed schema so tests read like the backend.
 */
import type {
  BeltRef,
  BeltView,
  GraduationEntry,
  GraduationRuleRow,
} from '../types.js';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

/** One catalog belt as the merged régua exposes it (BeltRef + ladder bits). */
export interface CatalogBeltFixture extends BeltRef {
  ladderKind: 'adult' | 'kids';
}

/**
 * Handoff ladder in régua display order — the kids ladder splices between
 * Branca and Azul (spec 005 seeds). Stable ids for cross-fixture references.
 */
export const BELT_CATALOG: CatalogBeltFixture[] = [
  { beltId: uuid('8010', 1), name: 'Branca', colorSlug: 'belt.white', tipColorSlug: null, maxDegrees: 4, ladderKind: 'adult' },
  { beltId: uuid('8010', 2), name: 'Cinza', colorSlug: 'belt.gray', tipColorSlug: null, maxDegrees: 4, ladderKind: 'kids' },
  { beltId: uuid('8010', 3), name: 'Amarela', colorSlug: 'belt.yellow', tipColorSlug: null, maxDegrees: 4, ladderKind: 'kids' },
  { beltId: uuid('8010', 4), name: 'Laranja', colorSlug: 'belt.orange', tipColorSlug: null, maxDegrees: 4, ladderKind: 'kids' },
  { beltId: uuid('8010', 5), name: 'Verde', colorSlug: 'belt.green', tipColorSlug: null, maxDegrees: 4, ladderKind: 'kids' },
  { beltId: uuid('8010', 6), name: 'Azul', colorSlug: 'belt.blue', tipColorSlug: null, maxDegrees: 4, ladderKind: 'adult' },
  { beltId: uuid('8010', 7), name: 'Roxa', colorSlug: 'belt.purple', tipColorSlug: null, maxDegrees: 4, ladderKind: 'adult' },
  { beltId: uuid('8010', 8), name: 'Marrom', colorSlug: 'belt.brown', tipColorSlug: null, maxDegrees: 4, ladderKind: 'adult' },
  { beltId: uuid('8010', 9), name: 'Preta', colorSlug: 'belt.black', tipColorSlug: 'belt.red', maxDegrees: 6, ladderKind: 'adult' },
  { beltId: uuid('8010', 10), name: 'Vermelha', colorSlug: 'belt.red', tipColorSlug: null, maxDegrees: 0, ladderKind: 'adult' },
];

/** Catalog lookup by PT-BR name ("Azul") — throws on a typo'd fixture. */
export function catalogBelt(name: string): CatalogBeltFixture {
  const belt = BELT_CATALOG.find((row) => row.name === name);
  if (!belt) throw new Error(`Unknown fixture belt: ${name}`);
  return belt;
}

/** Derived-belt payload (BeltViewDto) for a catalog belt + current degrees. */
export function makeBeltView(name: string, degrees = 0): BeltView {
  const { ladderKind: _ladderKind, ...ref } = catalogBelt(name);
  return { ...ref, degrees };
}

/**
 * Merged régua rows exactly as GET /v1/admin/graduation-rules returns them:
 * defaults (40 aulas por grau), toggles on kids belts only, Laranja seeded
 * off (admin-16 shows it disabled).
 */
export function makeGraduationRules(
  overrides: Partial<Record<string, Partial<GraduationRuleRow>>> = {},
): GraduationRuleRow[] {
  return BELT_CATALOG.map((belt) => ({
    beltId: belt.beltId,
    name: belt.name,
    colorSlug: belt.colorSlug,
    tipColorSlug: belt.tipColorSlug,
    maxDegrees: belt.maxDegrees,
    ladderKind: belt.ladderKind,
    lessonsPerDegree: 40,
    enabled: belt.name !== 'Laranja',
    toggleable: belt.ladderKind === 'kids',
    ...overrides[belt.name],
  }));
}

let graduationCounter = 0;
export function makeGraduationEntry(
  overrides: Partial<GraduationEntry> = {},
): GraduationEntry {
  graduationCounter += 1;
  return {
    id: uuid('8011', graduationCounter),
    kind: 'degree',
    belt: (({ ladderKind: _ladderKind, ...ref }) => ref)(catalogBelt('Azul')),
    degree: 1,
    awardedAt: '2026-06-10T19:30:00.000Z',
    awardedBy: { userId: uuid('8004', 1), fullName: 'Rafael Nunes' },
    notes: null,
    reversed: false,
    reversesGraduationId: null,
    certificateAvailable: false,
    ...overrides,
  };
}

/**
 * Screenshot-shaped history, newest first: a reversed 2º grau + its
 * revocation compensation row, a valid 1º grau and the belt promotion.
 */
export function makeGraduationHistory(): GraduationEntry[] {
  const promotion = makeGraduationEntry({
    kind: 'belt',
    degree: 0,
    awardedAt: '2026-01-15T19:00:00.000Z',
    notes: 'Exame de faixa — aprovado com distinção.',
    certificateAvailable: true,
  });
  const firstDegree = makeGraduationEntry({
    kind: 'degree',
    degree: 1,
    awardedAt: '2026-04-02T19:30:00.000Z',
  });
  const reversedDegree = makeGraduationEntry({
    kind: 'degree',
    degree: 2,
    awardedAt: '2026-06-20T19:30:00.000Z',
    reversed: true,
  });
  const revocation = makeGraduationEntry({
    kind: 'revocation',
    degree: 0,
    awardedAt: '2026-06-21T10:00:00.000Z',
    awardedBy: { userId: uuid('8004', 9), fullName: 'Amanda Admin' },
    notes: 'Lançamento incorreto.',
    reversesGraduationId: reversedDegree.id,
  });
  return [revocation, reversedDegree, firstDegree, promotion];
}
