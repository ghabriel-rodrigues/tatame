/**
 * Graduation fixtures for the RN suites (GRD.15-17). Local mirror of the
 * shared contract types, shaped to the handoff screenshots aluno-09,
 * professor-11/12 and responsavel-02.
 */

import type { ApiSchemas } from '@tatame/shared';

type BeltView = ApiSchemas['BeltViewDto'];
type GraduationProgress = ApiSchemas['GraduationProgressDto'];
type GraduationEntry = ApiSchemas['GraduationEntryDto'];
type AlunoGraduationResponse = ApiSchemas['AlunoGraduationResponseDto'];
type StudentProfileResponse = ApiSchemas['StudentProfileResponseDto'];
type ProfessorProfileResponse = ApiSchemas['ProfessorProfileResponseDto'];
type ValidGraduation = ApiSchemas['ValidGraduationDto'];
type StudentNote = ApiSchemas['StudentNoteDto'];

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

export const BELT_IDS = {
  branca: uuid('a001', 1),
  cinza: uuid('a001', 2),
  amarela: uuid('a001', 3),
  laranja: uuid('a001', 4),
  verde: uuid('a001', 5),
  azul: uuid('a001', 6),
  roxa: uuid('a001', 7),
  marrom: uuid('a001', 8),
  preta: uuid('a001', 9),
  vermelha: uuid('a001', 10),
};

export const PROFESSOR_ACTOR = { userId: uuid('8004', 1), fullName: 'Rafael Nunes' };

/** aluno-09 hero: Azul with 2 graus. */
export function makeBeltView(overrides: Partial<BeltView> = {}): BeltView {
  return {
    beltId: BELT_IDS.azul,
    name: 'Azul',
    colorSlug: 'belt.blue',
    tipColorSlug: null,
    maxDegrees: 4,
    degrees: 2,
    ...overrides,
  };
}

export function makeProgress(overrides: Partial<GraduationProgress> = {}): GraduationProgress {
  return {
    current: 26,
    target: 40,
    label: 'Próximo 3º grau',
    nextMilestone: { kind: 'degree', degree: 3 },
    ...overrides,
  };
}

let entryCounter = 0;
export function makeGraduationEntry(
  overrides: Partial<GraduationEntry> = {},
): GraduationEntry {
  entryCounter += 1;
  return {
    id: uuid('a002', entryCounter),
    kind: 'degree',
    belt: {
      beltId: BELT_IDS.azul,
      name: 'Azul',
      colorSlug: 'belt.blue',
      tipColorSlug: null,
      maxDegrees: 4,
    },
    degree: 2,
    awardedAt: '2026-05-12T18:00:00.000Z',
    awardedBy: PROFESSOR_ACTOR,
    notes: null,
    reversed: false,
    reversesGraduationId: null,
    certificateAvailable: false,
    ...overrides,
  };
}

/** aluno-09 timeline: 2º grau, 1º grau, faixa azul (certificado), branca. */
export function makeAlunoGraduation(
  overrides: Partial<AlunoGraduationResponse> = {},
): AlunoGraduationResponse {
  return {
    belt: makeBeltView(),
    progress: makeProgress(),
    timeline: [
      makeGraduationEntry({
        degree: 2,
        awardedAt: '2026-05-12T18:00:00.000Z',
        notes: 'Consistência exemplar nos fundamentos.',
      }),
      makeGraduationEntry({ degree: 1, awardedAt: '2025-06-10T18:00:00.000Z' }),
      makeGraduationEntry({
        kind: 'belt',
        degree: 0,
        awardedAt: '2024-11-20T18:00:00.000Z',
        notes: 'Exame de faixa — aprovado com distinção.',
        certificateAvailable: true,
      }),
      makeGraduationEntry({
        kind: 'belt',
        degree: 0,
        belt: {
          beltId: BELT_IDS.branca,
          name: 'Branca',
          colorSlug: 'belt.white',
          tipColorSlug: null,
          maxDegrees: 4,
        },
        awardedAt: '2023-02-01T18:00:00.000Z',
        notes: 'Início da jornada.',
      }),
    ],
    ...overrides,
  };
}

let noteCounter = 0;
export function makeStudentNote(
  body: string,
  overrides: Partial<StudentNote> = {},
): StudentNote {
  noteCounter += 1;
  return {
    id: uuid('a003', noteCounter),
    body,
    createdAt: '2026-07-12T15:00:00.000Z',
    author: PROFESSOR_ACTOR,
    ...overrides,
  };
}

/** professor-11: Lucas, faixa azul 2 graus, 38/40, two observações. */
export function makeStudentProfile(
  overrides: Partial<StudentProfileResponse> = {},
): StudentProfileResponse {
  return {
    student: {
      id: uuid('9001', 11),
      fullName: 'Lucas Almeida',
      birthDate: '2000-03-15',
      status: 'active',
      badge: 'ativo',
    },
    belt: makeBeltView(),
    progress: makeProgress({ current: 38, label: 'Próximo 3º grau' }),
    stats: {
      monthPresencePct: 86,
      monthAttendedSessions: 14,
      monthTotalSessions: 16,
      streak: 6,
      totalLessons: 120,
    },
    notes: [
      makeStudentNote(
        'Boa evolução na guarda fechada, precisa soltar mais o jogo de passagem.',
      ),
      makeStudentNote('Pediu foco em raspagens para o exame.', {
        createdAt: '2026-06-28T15:00:00.000Z',
      }),
    ],
    ...overrides,
  };
}

/** The handoff régua in display order (kids spliced after Branca). */
export function makeValidGraduations(
  options: { laranjaEnabled?: boolean } = {},
): ValidGraduation[] {
  const belt = (
    key: keyof typeof BELT_IDS,
    name: string,
    colorSlug: string,
    ladderKind: 'adult' | 'kids',
    extras: Partial<ValidGraduation> = {},
  ): ValidGraduation => ({
    beltId: BELT_IDS[key],
    name,
    colorSlug,
    tipColorSlug: null,
    maxDegrees: 4,
    ladderKind,
    enabled: true,
    ...extras,
  });
  return [
    belt('branca', 'Branca', 'belt.white', 'adult'),
    belt('cinza', 'Cinza', 'belt.gray', 'kids'),
    belt('amarela', 'Amarela', 'belt.yellow', 'kids'),
    belt('laranja', 'Laranja', 'belt.orange', 'kids', {
      enabled: options.laranjaEnabled ?? false,
    }),
    belt('verde', 'Verde', 'belt.green', 'kids'),
    belt('azul', 'Azul', 'belt.blue', 'adult'),
    belt('roxa', 'Roxa', 'belt.purple', 'adult'),
    belt('marrom', 'Marrom', 'belt.brown', 'adult'),
    belt('preta', 'Preta', 'belt.black', 'adult', {
      tipColorSlug: 'belt.red',
      maxDegrees: 6,
    }),
    belt('vermelha', 'Vermelha', 'belt.red', 'adult', { maxDegrees: 0 }),
  ];
}

/** professor-12: Rafael Nunes, faixa preta 2º dan + the régua chips. */
export function makeProfessorProfile(
  overrides: Partial<ProfessorProfileResponse> = {},
): ProfessorProfileResponse {
  return {
    professor: PROFESSOR_ACTOR,
    belt: makeBeltView({
      beltId: BELT_IDS.preta,
      name: 'Preta',
      colorSlug: 'belt.black',
      tipColorSlug: 'belt.red',
      maxDegrees: 6,
      degrees: 2,
    }),
    validGraduations: makeValidGraduations(),
    ...overrides,
  };
}
