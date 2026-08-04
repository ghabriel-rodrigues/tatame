// Professor turma detail model (spec 003, ENR.24/25 — stories 25-27, 29):
// detail + roster, remove-with-confirm, and the Adicionar aluno picker.
//
// Spec 004 (ATT.24) closed the recorded API gap: the picker now calls
// GET /professor/students?notEnrolledInClassId= instead of unioning other
// rosters, and the disabled chamada placeholder became the real live/manual
// chamada entry points.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class TurmaDetailModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(ClassDetail)
        case failed(message: String)
    }

    public enum CandidatesPhase: Equatable, Sendable {
        case idle
        case loading
        case loaded([RosterStudent])
        case failed(message: String)
    }

    public let classId: UUID
    public private(set) var phase: Phase = .idle
    /// Roster row pending removal — non-nil drives the confirm dialog.
    public var removalCandidate: RosterStudent?
    /// PT-BR banner for a failed roster mutation.
    public private(set) var actionError: String?
    /// Adicionar aluno sheet visibility.
    public var showAddSheet = false
    /// Chamada ao vivo sheet visibility (spec 004).
    public var showLiveChamada = false
    /// Chamada manual sheet visibility (spec 004).
    public var showRollCall = false
    public private(set) var candidatesPhase: CandidatesPhase = .idle

    @ObservationIgnored private let repository: any EnrollmentRepository
    @ObservationIgnored private let attendanceRepository: any AttendanceRepository

    public init(
        classId: UUID,
        repository: any EnrollmentRepository,
        attendanceRepository: any AttendanceRepository = UnimplementedAttendanceRepository()
    ) {
        self.classId = classId
        self.repository = repository
        self.attendanceRepository = attendanceRepository
    }

    public var detail: ClassDetail? {
        if case .loaded(let detail) = phase { return detail }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.professorClassDetail(classId: classId))
        } catch let error as ApiError {
            phase = .failed(message: EnrollmentMessages.message(for: error))
        } catch {
            phase = .failed(message: EnrollmentMessages.generic)
        }
    }

    // MARK: Remove (story 27 — single tap + confirm)

    public func askRemove(_ student: RosterStudent) {
        actionError = nil
        removalCandidate = student
    }

    public func cancelRemove() {
        removalCandidate = nil
    }

    /// Confirms the pending removal; reloads the detail (occupancy and
    /// lotada are server-derived) on success.
    public func confirmRemove() async {
        guard let student = removalCandidate else { return }
        removalCandidate = nil
        do {
            _ = try await repository.removeStudent(classId: classId, studentId: student.studentId)
            await load()
        } catch let error as ApiError {
            actionError = EnrollmentMessages.message(for: error)
        } catch {
            actionError = EnrollmentMessages.generic
        }
    }

    // MARK: Adicionar aluno (stories 26, 29)

    public func openAddSheet() {
        actionError = nil
        showAddSheet = true
    }

    /// Loads the picker candidates from GET /professor/students with the
    /// not-enrolled filter (spec 004, ATT.24 — story 37).
    public func loadCandidates() async {
        candidatesPhase = .loading
        do {
            let candidates = try await attendanceRepository
                .students(notEnrolledInClassId: classId)
                .sorted { $0.fullName.localizedCompare($1.fullName) == .orderedAscending }
            candidatesPhase = .loaded(candidates)
        } catch let error as ApiError {
            candidatesPhase = .failed(message: EnrollmentMessages.message(for: error))
        } catch {
            candidatesPhase = .failed(message: EnrollmentMessages.generic)
        }
    }

    /// Adds a picked student; on success drops them from the candidates and
    /// reloads the detail. Capacity/duplicate conflicts surface as PT-BR
    /// copy on their stable codes (class.full, enrollment.already_enrolled).
    public func add(_ student: RosterStudent) async {
        actionError = nil
        do {
            _ = try await repository.addStudent(classId: classId, studentId: student.studentId)
            if case .loaded(let candidates) = candidatesPhase {
                candidatesPhase = .loaded(candidates.filter { $0.studentId != student.studentId })
            }
            await load()
        } catch let error as ApiError {
            actionError = EnrollmentMessages.message(for: error)
        } catch {
            actionError = EnrollmentMessages.generic
        }
    }
}
