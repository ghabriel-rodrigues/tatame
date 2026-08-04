// Cadastrar aluno sheet model (spec 003, ENR.26 — stories 31-34).
// The age suggestion is fetched only once a complete, valid birth date is
// typed (the gate), always server-side (clients never re-implement the
// matching rule). Registration succeeds even when the suggested class is
// full — `enrolled: false` surfaces the story-34 copy.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class RegisterDependentModel {
    public enum SuggestionPhase: Equatable, Sendable {
        /// No valid birth date typed yet — nothing fetched.
        case idle
        case loading
        /// Fetched: nil means no age-matching class with a free slot.
        case loaded(ClassSuggestion?)
        case failed
    }

    public enum Phase: Equatable, Sendable {
        case idle
        case submitting
        case failed(message: String)
        /// Registered — `message` carries the enrolled/not-enrolled outcome.
        case registered(message: String)
    }

    public var fullName = ""
    /// PT-BR "dd/mm/aaaa" text entry.
    public var birthDateBR = "" {
        didSet { birthDateChanged() }
    }
    public private(set) var suggestionPhase: SuggestionPhase = .idle
    /// The suggestion chip is selected by default; tapping toggles it off
    /// (registering without enrollment).
    public var suggestionAccepted = true
    public private(set) var phase: Phase = .idle

    @ObservationIgnored private let repository: any EnrollmentRepository
    @ObservationIgnored private var fetchedISO: String?
    @ObservationIgnored private var suggestionTask: Task<Void, Never>?

    public init(repository: any EnrollmentRepository) {
        self.repository = repository
    }

    /// ISO birth date once the entry is complete and valid; nil gates the
    /// suggestion fetch and the submit.
    public var birthDateISO: String? {
        BirthDates.isoFromBR(birthDateBR)
    }

    public var suggestion: ClassSuggestion? {
        if case .loaded(let suggestion) = suggestionPhase { return suggestion }
        return nil
    }

    private func birthDateChanged() {
        suggestionTask?.cancel()
        guard let iso = birthDateISO else {
            fetchedISO = nil
            suggestionPhase = .idle
            return
        }
        guard iso != fetchedISO else { return }
        fetchedISO = iso
        suggestionPhase = .loading
        suggestionTask = Task { [weak self] in
            await self?.fetchSuggestion(iso: iso)
        }
    }

    private func fetchSuggestion(iso: String) async {
        do {
            let suggestion = try await repository.classSuggestion(birthDate: iso)
            guard fetchedISO == iso else { return }
            suggestionAccepted = true
            suggestionPhase = .loaded(suggestion)
        } catch {
            guard fetchedISO == iso else { return }
            // Suggestion is best-effort UX; registration works without it.
            suggestionPhase = .failed
        }
    }

    /// Submits the cadastro. Returns the result for the caller (home reload
    /// + dismiss); nil when validation or the request failed.
    @discardableResult
    public func register() async -> RegisteredDependent? {
        let name = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !birthDateBR.isEmpty else {
            phase = .failed(message: EnrollmentMessages.fillDependentFields)
            return nil
        }
        guard let iso = birthDateISO else {
            phase = .failed(message: EnrollmentMessages.invalidBirthDate)
            return nil
        }
        phase = .submitting
        // Wait for an in-flight suggestion fetch so a just-typed date still
        // carries its class into the cadastro.
        if let task = suggestionTask {
            await task.value
        }
        let acceptedClassId = suggestionAccepted ? suggestion?.id : nil
        do {
            let result = try await repository.registerDependent(
                fullName: name,
                birthDate: iso,
                classId: acceptedClassId
            )
            phase = .registered(
                message: result.enrolled
                    ? EnrollmentMessages.registeredEnrolled
                    : EnrollmentMessages.registeredNotEnrolled
            )
            return result
        } catch let error as ApiError {
            phase = .failed(message: EnrollmentMessages.message(
                for: error,
                notFound: EnrollmentMessages.dependentNotFound
            ))
            return nil
        } catch {
            phase = .failed(message: EnrollmentMessages.generic)
            return nil
        }
    }
}
