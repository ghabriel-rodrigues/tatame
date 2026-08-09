/**
 * Attendance fixtures for the RN suites (ATT.15-18). Local mirror of the
 * shared contract types (the shared testing entry pulls msw, which the RN
 * jest env does not run), shaped to the handoff screenshots aluno-03/04/05
 * and professor-02/03/10.
 */

import type {
  AlunoHomeResponse,
  AlunoStats,
  CheckinResponse,
  LiveCodeResponse,
  LiveSnapshotResponse,
  ProfessorDashboardResponse,
  ProfessorStudent,
  RollCallResponse,
  SnapshotAttendance,
} from '@tatame/shared';
import { makeBeltView, makeProgress } from './graduation';

const uuid = (block: string, counter: number) =>
  `018f0000-0000-7000-${block}-${counter.toString(16).padStart(12, '0')}`;

export const STUDENT_ID = uuid('9001', 1);
export const OPEN_MAT_CLASS_ID = uuid('9002', 1);
export const SESSION_ID = uuid('9003', 1);
export const LIVE_CODE_ID = uuid('9004', 1);
export const ATTENDANCE_ID = uuid('9005', 1);

export function makeAlunoStats(overrides: Partial<AlunoStats> = {}): AlunoStats {
  return {
    monthPresencePct: 86,
    monthAttendedSessions: 12,
    monthTotalSessions: 14,
    streak: 6,
    totalLessons: 26,
    ...overrides,
  };
}

export interface AlunoHomeOptions {
  checkedIn?: boolean;
  stats?: Partial<AlunoStats>;
  /** `null` removes the today class entirely. */
  todayClass?: null;
  /** `null` removes the graduation payload (defensive rendering path). */
  graduation?: null;
}

/** aluno-03/09: Open mat today at 10:00; faixa azul 2 graus, 26 de 40. */
export function makeAlunoHome(options: AlunoHomeOptions = {}): AlunoHomeResponse {
  return {
    student: { id: STUDENT_ID, fullName: 'Lucas Almeida' },
    todayClass:
      options.todayClass === null
        ? null
        : {
            classId: OPEN_MAT_CLASS_ID,
            className: 'Open mat',
            slot: { weekday: 6, startTime: '10:00', durationMinutes: 120 },
            checkedIn: options.checkedIn ?? false,
          },
    stats: makeAlunoStats(options.stats),
    ...(options.graduation === null
      ? {}
      : { graduation: { belt: makeBeltView(), progress: makeProgress() } }),
  };
}

export function makeCheckinResponse(
  overrides: Partial<CheckinResponse> = {},
  stats: Partial<AlunoStats> = {},
): CheckinResponse {
  return {
    status: 'checked_in',
    attendance: {
      id: ATTENDANCE_ID,
      classSessionId: SESSION_ID,
      method: 'code',
      checkedInAt: '2026-08-03T10:02:00.000Z',
    },
    session: {
      id: SESSION_ID,
      classId: OPEN_MAT_CLASS_ID,
      className: 'Open mat',
      sessionDate: '2026-08-03',
    },
    stats: makeAlunoStats({ monthPresencePct: 88, streak: 7, totalLessons: 27, ...stats }),
    ...overrides,
  };
}

/** professor-03: code 4729, expiring, 5 presents already. */
export function makeLiveCode(overrides: Partial<LiveCodeResponse> = {}): LiveCodeResponse {
  return {
    id: LIVE_CODE_ID,
    code: '4729',
    qrToken: 'qr-token-opaque-128bit',
    expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
    revokedAt: null,
    session: {
      id: SESSION_ID,
      classId: OPEN_MAT_CLASS_ID,
      className: 'Open mat',
      sessionDate: '2026-08-03',
      startsAt: '2026-08-03T10:00:00.000Z',
      status: 'scheduled',
    },
    presentCount: 5,
    ...overrides,
  };
}

let snapshotCounter = 0;
export function makeSnapshotAttendance(
  studentName: string,
  overrides: Partial<SnapshotAttendance> = {},
): SnapshotAttendance {
  snapshotCounter += 1;
  return {
    id: uuid('9005', 100 + snapshotCounter),
    studentId: uuid('9001', 100 + snapshotCounter),
    studentName,
    method: 'qr',
    checkedInAt: '2026-08-03T10:01:00.000Z',
    ...overrides,
  };
}

export function makeSnapshot(
  attendances: SnapshotAttendance[],
  overrides: Partial<LiveSnapshotResponse> = {},
): LiveSnapshotResponse {
  return {
    presentCount: attendances.length,
    code: {
      id: LIVE_CODE_ID,
      expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
      revokedAt: null,
    },
    attendances,
    ...overrides,
  };
}

export const ROLL_CALL_STUDENTS = {
  lucas: uuid('9001', 11),
  joao: uuid('9001', 12),
  tiago: uuid('9001', 13),
};
export const LUCAS_ATTENDANCE_ID = uuid('9005', 11);
export const JOAO_ATTENDANCE_ID = uuid('9005', 12);

/** professor-10: Lucas self (qr), João manual (professor), Tiago absent. */
export function makeRollCall(): RollCallResponse {
  return {
    session: {
      id: SESSION_ID,
      classId: OPEN_MAT_CLASS_ID,
      className: 'Fundamentos',
      sessionDate: '2026-08-03',
      startsAt: '2026-08-03T19:00:00.000Z',
      status: 'scheduled',
    },
    presentCount: 2,
    roster: [
      {
        studentId: ROLL_CALL_STUDENTS.lucas,
        fullName: 'Lucas Almeida',
        attendance: {
          id: LUCAS_ATTENDANCE_ID,
          method: 'qr',
          checkedInAt: '2026-08-03T18:58:00.000Z',
          recordedByUserId: null,
        },
      },
      {
        studentId: ROLL_CALL_STUDENTS.joao,
        fullName: 'João Ferraz',
        attendance: {
          id: JOAO_ATTENDANCE_ID,
          method: 'manual',
          checkedInAt: '2026-08-03T19:01:00.000Z',
          recordedByUserId: uuid('8004', 1),
        },
      },
      { studentId: ROLL_CALL_STUDENTS.tiago, fullName: 'Tiago Mota', attendance: null },
    ],
  };
}

/** professor-02: 23 alunos hoje, 81% média, Open mat 10:00 with 18 in. */
export function makeDashboard(
  overrides: Partial<ProfessorDashboardResponse> = {},
): ProfessorDashboardResponse {
  return {
    alunosHoje: 23,
    presencaMediaPct: 81,
    nextClass: {
      classId: OPEN_MAT_CLASS_ID,
      className: 'Open mat',
      slot: { weekday: 6, startTime: '10:00', durationMinutes: 120 },
      checkedInCount: 18,
    },
    todayClasses: [],
    ...overrides,
  };
}

/** professor-09 picker candidates, now served by GET /professor/students. */
export function makeProfessorStudents(): ProfessorStudent[] {
  return [
    { id: uuid('9001', 21), fullName: 'Marina Costa', birthDate: '2004-02-11', badge: 'ativo' },
    { id: uuid('9001', 22), fullName: 'Pedro Silveira', birthDate: '2016-08-02', badge: 'ativo' },
    { id: uuid('9001', 23), fullName: 'Bia Andrade', birthDate: '2001-12-30', badge: 'pendente' },
  ];
}
