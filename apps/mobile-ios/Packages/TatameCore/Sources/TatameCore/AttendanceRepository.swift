// Repository seam for the attendance slice (spec 004, ATT.22-24). Same
// convention as EnrollmentRepository: protocol in TatameCore, implementation
// in TatameAPI, features depend only on this protocol and throw `ApiError`.
//
// `liveStream` is the one non-REST member: the SSE endpoint is a documented
// exception to the OpenAPI contract (issue 09) — the Live implementation
// hand-rolls URLSession.bytes + an SSE parser; fakes hand the model a
// controllable stream.

import Foundation

public protocol AttendanceRepository: Sendable {
    // MARK: Aluno

    /// GET /aluno/home — hero context + stat tiles + graduation numerator.
    func alunoHome() async throws -> AlunoHome

    /// POST /aluno/checkins — one write path, three methods. Exactly one of
    /// `qrToken` (qr) / `code` (code) / `classId` (manual) per the method.
    /// Duplicates come back as `.alreadyCheckedIn`, never an error.
    func checkIn(method: CheckinMethod, qrToken: String?, code: String?, classId: UUID?) async throws -> CheckinResult

    // MARK: Professor — chamada ao vivo (own classes only; foreign ids are 404s)

    /// POST /professor/classes/:id/live-codes — open chamada (idempotent:
    /// reopening while a code is active returns the active code).
    func openLiveCode(classId: UUID) async throws -> LiveCode

    /// POST /professor/live-codes/:id/close — encerrar chamada.
    func closeLiveCode(id: UUID) async throws -> LiveCode

    /// GET /professor/live-codes/:id/attendances — snapshot + polling target.
    func liveSnapshot(liveCodeId: UUID) async throws -> LiveSnapshot

    /// POST /professor/live-codes/:id/stream-ticket — ~60 s signed ticket.
    func mintStreamTicket(liveCodeId: UUID) async throws -> StreamTicket

    /// GET /professor/live-codes/:id/stream?ticket= — named `checkin` /
    /// `revoke` events; heartbeats are transport noise the stream never
    /// surfaces. Finishes (throwing) when the connection drops.
    func liveStream(liveCodeId: UUID, ticket: String) -> AsyncThrowingStream<LiveStreamEvent, any Error>

    // MARK: Professor — chamada manual

    /// POST /professor/classes/:id/roll-call — open manual chamada; self
    /// check-ins arrive pre-toggled.
    func openRollCall(classId: UUID) async throws -> RollCall

    /// POST /professor/sessions/:id/attendances — toggle on (method manual,
    /// recorded by the professor).
    func markAttendance(sessionId: UUID, studentId: UUID) async throws -> MarkAttendanceResult

    /// POST /professor/attendances/:id/revoke — same-day toggle-off.
    /// Throws `.forbidden(attendance.revoke_window_closed)` after day close.
    func revokeAttendance(id: UUID) async throws -> RevokeAttendanceResult

    // MARK: Professor — dashboard & students

    /// GET /professor/dashboard — alunos hoje, presença média, next-class hero.
    func dashboard() async throws -> ProfessorDashboard

    /// GET /professor/students?notEnrolledInClassId= — the "Adicionar aluno"
    /// picker source (closes the spec-003 API-gap workaround).
    func students(notEnrolledInClassId: UUID?) async throws -> [RosterStudent]
}

/// Default used by environment entries / previews; every call traps.
public struct UnimplementedAttendanceRepository: AttendanceRepository {
    public init() {}

    public func alunoHome() async throws -> AlunoHome {
        fatalError("AttendanceRepository not injected")
    }

    public func checkIn(
        method _: CheckinMethod,
        qrToken _: String?,
        code _: String?,
        classId _: UUID?
    ) async throws -> CheckinResult {
        fatalError("AttendanceRepository not injected")
    }

    public func openLiveCode(classId _: UUID) async throws -> LiveCode {
        fatalError("AttendanceRepository not injected")
    }

    public func closeLiveCode(id _: UUID) async throws -> LiveCode {
        fatalError("AttendanceRepository not injected")
    }

    public func liveSnapshot(liveCodeId _: UUID) async throws -> LiveSnapshot {
        fatalError("AttendanceRepository not injected")
    }

    public func mintStreamTicket(liveCodeId _: UUID) async throws -> StreamTicket {
        fatalError("AttendanceRepository not injected")
    }

    public func liveStream(liveCodeId _: UUID, ticket _: String) -> AsyncThrowingStream<LiveStreamEvent, any Error> {
        fatalError("AttendanceRepository not injected")
    }

    public func openRollCall(classId _: UUID) async throws -> RollCall {
        fatalError("AttendanceRepository not injected")
    }

    public func markAttendance(sessionId _: UUID, studentId _: UUID) async throws -> MarkAttendanceResult {
        fatalError("AttendanceRepository not injected")
    }

    public func revokeAttendance(id _: UUID) async throws -> RevokeAttendanceResult {
        fatalError("AttendanceRepository not injected")
    }

    public func dashboard() async throws -> ProfessorDashboard {
        fatalError("AttendanceRepository not injected")
    }

    public func students(notEnrolledInClassId _: UUID?) async throws -> [RosterStudent] {
        fatalError("AttendanceRepository not injected")
    }
}
