// Professor turma detail model (spec 003, ENR.24/25 — stories 25-27, 29):
// detail + roster, remove-with-confirm, and the Adicionar aluno picker.
//
// Candidate pool note (recorded API-gap workaround): the contract has no
// professor students-list endpoint, so the picker's candidates are the union
// of the rosters of the professor's OTHER classes (everything the professor
// role can read) minus the current roster. A dedicated
// GET /professor/students endpoint is an open backend issue.

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
    public private(set) var candidatesPhase: CandidatesPhase = .idle

    @ObservationIgnored private let repository: any EnrollmentRepository

    public init(classId: UUID, repository: any EnrollmentRepository) {
        self.classId = classId
        self.repository = repository
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

    /// Loads the picker candidates (see the API-gap note above).
    public func loadCandidates() async {
        candidatesPhase = .loading
        do {
            let classes = try await repository.professorClasses()
            var pool: [UUID: RosterStudent] = [:]
            for summary in classes where summary.id != classId {
                let other = try await repository.professorClassDetail(classId: summary.id)
                for student in other.roster {
                    pool[student.studentId] = student
                }
            }
            let enrolled = Set((detail?.roster ?? []).map(\.studentId))
            let candidates = pool.values
                .filter { !enrolled.contains($0.studentId) }
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
