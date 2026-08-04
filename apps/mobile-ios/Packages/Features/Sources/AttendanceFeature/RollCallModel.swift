// Professor manual chamada model (spec 004, ATT.24 — stories 27-33):
// per-tap immediate mark/revoke (no batch diff), "N presentes de M" header,
// self check-ins pre-toggled, same-day revoke window error surfaced in PT-BR.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class RollCallModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle
    public private(set) var session: LiveSession?
    public private(set) var rows: [RollCallRow] = []
    public private(set) var presentCount = 0
    /// Rows with an in-flight mutation (their toggle is disabled).
    public private(set) var busyStudentIds: Set<UUID> = []
    /// PT-BR banner for a failed toggle (e.g. revoke window closed).
    public var actionError: String?

    public let classId: UUID

    @ObservationIgnored private let repository: any AttendanceRepository
    /// The caller's user id — stamped on locally-built manual rows so the
    /// "manual" marker renders without a reload.
    @ObservationIgnored private let professorUserId: UUID?

    public init(classId: UUID, repository: any AttendanceRepository, professorUserId: UUID? = nil) {
        self.classId = classId
        self.repository = repository
        self.professorUserId = professorUserId
    }

    /// "3 presentes de 14" (story 31).
    public var headerCountPTBR: String {
        AttendanceFormatters.presentesLabelPTBR(present: presentCount, total: rows.count)
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            let rollCall = try await repository.openRollCall(classId: classId)
            session = rollCall.session
            rows = rollCall.roster
            presentCount = rollCall.presentCount
            phase = .loaded
        } catch let error as ApiError {
            phase = .failed(message: AttendanceMessages.message(for: error))
        } catch {
            phase = .failed(message: AttendanceMessages.generic)
        }
    }

    /// Toggles applied immediately as tapped — "Salvar chamada" is pure
    /// navigation (story 32).
    public func toggle(_ row: RollCallRow) async {
        guard let session, !busyStudentIds.contains(row.studentId) else { return }
        actionError = nil
        busyStudentIds.insert(row.studentId)
        defer { busyStudentIds.remove(row.studentId) }

        do {
            if let attendance = row.attendance {
                // Toggle off = same-day revoke through the void seam.
                let result = try await repository.revokeAttendance(id: attendance.id)
                update(studentId: row.studentId, attendance: nil)
                presentCount = result.presentCount
            } else {
                // Toggle on = manual attendance recorded by the professor.
                let result = try await repository.markAttendance(
                    sessionId: session.id,
                    studentId: row.studentId
                )
                update(
                    studentId: row.studentId,
                    attendance: RollCallAttendance(
                        id: result.attendanceId,
                        method: .manual,
                        checkedInAt: Date(),
                        recordedByUserId: professorUserId
                    )
                )
                presentCount = result.presentCount
            }
        } catch let error as ApiError {
            actionError = AttendanceMessages.message(for: error)
        } catch {
            actionError = AttendanceMessages.generic
        }
    }

    private func update(studentId: UUID, attendance: RollCallAttendance?) {
        rows = rows.map { row in
            row.studentId == studentId
                ? RollCallRow(studentId: row.studentId, fullName: row.fullName, attendance: attendance)
                : row
        }
    }
}
