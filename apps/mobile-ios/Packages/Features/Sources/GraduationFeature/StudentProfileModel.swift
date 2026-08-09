// Professor "perfil do aluno" model (spec 005, GRD.23 — stories 9-19):
// belt + progress + Phase-4 stat tiles + observações, with the Adicionar
// grau / Promover faixa award flow (gated by the admin's graduation.update
// toggle — hidden client-side, enforced server-side).

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class StudentProfileModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(StudentProfile)
        case failed(message: String)
    }

    public let studentId: UUID
    /// Client-side mirror of the admin's "atualizar graduações" toggle —
    /// false hides both award actions (story 15; the server still enforces).
    public let canAward: Bool

    public private(set) var phase: Phase = .idle
    /// Merged régua from the professor profile (promotion targets); nil
    /// while unavailable — Promover faixa disables rather than guessing.
    public private(set) var validGraduations: [ValidGraduation]?
    public private(set) var actionError: String?
    public private(set) var awarding = false
    public private(set) var savingNote = false

    /// Pending confirmation ("Adicionar grau" / "Promover faixa" tapped).
    public var pendingAward: AwardKind?
    /// Observação attached to the pending award (story 13, optional).
    public var awardNotesDraft = ""
    /// "Nova observação" input.
    public var noteDraft = ""

    @ObservationIgnored private let repository: any GraduationRepository

    public init(studentId: UUID, canAward: Bool, repository: any GraduationRepository) {
        self.studentId = studentId
        self.canAward = canAward
        self.repository = repository
    }

    public var profile: StudentProfile? {
        if case .loaded(let profile) = phase { return profile }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.studentProfile(studentId: studentId))
        } catch let error as ApiError {
            phase = .failed(message: GraduationMessages.message(for: error))
            return
        } catch {
            phase = .failed(message: GraduationMessages.generic)
            return
        }
        // Régua is best-effort: without it the promote action disables.
        if canAward, validGraduations == nil {
            validGraduations = try? await repository.professorProfile().validGraduations
        }
    }

    // MARK: Award flow (stories 10-15)

    /// "Adicionar grau" is blocked at the belt's maximum degrees (story 14).
    public var canAddDegree: Bool {
        guard canAward, let belt = profile?.belt else { return false }
        return belt.maxDegrees > 0 && belt.degrees < belt.maxDegrees
    }

    /// Default "Promover faixa" target: next *enabled* belt in the merged
    /// régua (disabled kids belts are excluded — story 14); nil disables.
    public var nextBelt: ValidGraduation? {
        guard canAward, let belt = profile?.belt, let ladder = validGraduations else { return nil }
        return ValidGraduation.nextBelt(after: belt.beltId, in: ladder)
    }

    public var canPromoteBelt: Bool {
        nextBelt != nil
    }

    public func askAward(_ kind: AwardKind) {
        awardNotesDraft = ""
        actionError = nil
        pendingAward = kind
    }

    public func cancelAward() {
        pendingAward = nil
        awardNotesDraft = ""
    }

    /// PT-BR confirmation copy: "Conceder o 3º grau a Lucas?" / "Promover
    /// Lucas para a Faixa roxa?".
    public var confirmationMessagePTBR: String? {
        guard let profile, let pendingAward else { return nil }
        let firstName = profile.student.fullName.split(separator: " ").first.map(String.init)
            ?? profile.student.fullName
        switch pendingAward {
        case .degree:
            return "Conceder o \(profile.belt.degrees + 1)º grau a \(firstName)?"
        case .belt:
            guard let target = nextBelt else { return nil }
            return "Promover \(firstName) para a Faixa \(target.name.lowercased())? Os graus voltam a zero."
        }
    }

    public func confirmAward() async {
        guard let kind = pendingAward, !awarding else { return }
        let targetBeltId: UUID?
        switch kind {
        case .degree:
            targetBeltId = nil
        case .belt:
            guard let target = nextBelt else { return }
            targetBeltId = target.beltId
        }
        awarding = true
        actionError = nil
        defer { awarding = false }
        do {
            let trimmed = awardNotesDraft.trimmingCharacters(in: .whitespacesAndNewlines)
            _ = try await repository.award(
                studentId: studentId,
                kind: kind,
                beltId: targetBeltId,
                notes: trimmed.isEmpty ? nil : trimmed
            )
            pendingAward = nil
            awardNotesDraft = ""
            // Re-derive belt + progress from the server truth (progress
            // anchors on the new award).
            await load()
        } catch let error as ApiError {
            pendingAward = nil
            actionError = GraduationMessages.message(for: error)
        } catch {
            pendingAward = nil
            actionError = GraduationMessages.generic
        }
    }

    // MARK: Observações (stories 18-19)

    public var canSaveNote: Bool {
        !noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !savingNote
    }

    public func saveNote() async {
        let body = noteDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !savingNote, case .loaded(let profile) = phase else { return }
        savingNote = true
        actionError = nil
        defer { savingNote = false }
        do {
            let note = try await repository.createNote(studentId: studentId, body: body)
            noteDraft = ""
            phase = .loaded(
                StudentProfile(
                    student: profile.student,
                    belt: profile.belt,
                    progress: profile.progress,
                    stats: profile.stats,
                    notes: [note] + profile.notes
                )
            )
        } catch let error as ApiError {
            actionError = GraduationMessages.message(for: error)
        } catch {
            actionError = GraduationMessages.generic
        }
    }
}
