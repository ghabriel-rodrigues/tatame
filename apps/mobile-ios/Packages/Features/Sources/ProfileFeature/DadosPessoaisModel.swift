// Dados pessoais form model (spec 013, REP.16 — stories 21-27): loads the
// profile, holds the editable form state (CPF/RG editable only while
// unlocked), builds the partial PUT, and maps the 422 responses into
// per-field PT-BR messages. Field keys mirror the API field names so server
// validation lands on the right input.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class DadosPessoaisModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle
    public private(set) var saving = false
    /// Success banner flag — cleared by the next edit or save.
    public private(set) var saved = false
    /// Save-level failure without a field to land on.
    public private(set) var bannerError: String?
    /// API-field-keyed PT-BR messages (fullName, phone, cpf, rg,
    /// addressCity, addressState, addressZip, emergencyContactPhone, ...).
    public private(set) var fieldErrors: [String: String] = [:]

    // MARK: Read-only facts (identity — never editable here)

    public private(set) var email = ""
    /// "14/03/1998" — empty when no student row carries a birth date.
    public private(set) var birthDateBR = ""

    // MARK: Lock state (aluno-18 dashed boxes)

    public private(set) var cpfLocked = false
    public private(set) var rgLocked = false
    /// Masked locked value ("123.456.789-00") for the dashed box.
    public private(set) var lockedCpfMasked = ""
    public private(set) var lockedRg = ""

    // MARK: Editable form state

    public var fullName = ""
    public var gender: Gender?
    public var phone = ""
    /// Editable only while unlocked.
    public var cpfInput = ""
    public var rgInput = ""
    public var addressLine = ""
    /// The aluno-18 single "Cidade / UF" input, parsed on save.
    public var cityUF = ""
    public var cep = ""
    public var emergencyName = ""
    public var emergencyPhone = ""

    @ObservationIgnored private let repository: any ProfileRepository

    public init(repository: any ProfileRepository) {
        self.repository = repository
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            populate(from: try await repository.alunoProfile())
            phase = .loaded
        } catch let error as ApiError {
            if case .network = error {
                phase = .failed(message: ProfileMessages.offline)
            } else {
                phase = .failed(message: ProfileMessages.loadFailed)
            }
        } catch {
            phase = .failed(message: ProfileMessages.loadFailed)
        }
    }

    /// Salvar (story 25): partial PUT — locked fields never leave the
    /// device, empty optionals clear server-side state explicitly.
    public func save() async {
        guard !saving else { return }
        saving = true
        saved = false
        bannerError = nil
        fieldErrors = [:]
        defer { saving = false }

        let update = buildUpdate()
        do {
            populate(from: try await repository.updateAlunoProfile(update))
            saved = true
        } catch let error as ApiError {
            apply(error: error, update: update)
        } catch {
            bannerError = ProfileMessages.generic
        }
    }

    /// Clears the success banner on the next edit.
    public func markEdited() {
        saved = false
    }

    /// The partial update the form state describes (exposed for tests).
    public func buildUpdate() -> AlunoProfileUpdate {
        var update = AlunoProfileUpdate()
        update.fullName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        update.gender = gender.map { .set($0) } ?? .unchanged
        update.phone = stringUpdate(phone)
        if !cpfLocked {
            let cpf = cpfInput.trimmingCharacters(in: .whitespacesAndNewlines)
            update.cpf = cpf.isEmpty ? nil : cpf
        }
        if !rgLocked {
            let rg = rgInput.trimmingCharacters(in: .whitespacesAndNewlines)
            update.rg = rg.isEmpty ? nil : rg
        }
        update.addressLine = stringUpdate(addressLine)
        let (city, uf) = ProfileFormatters.parseCityUF(cityUF)
        update.addressCity = city.map { .set($0) } ?? .clear
        update.addressState = uf.map { .set($0) } ?? .clear
        update.addressZip = stringUpdate(cep)
        update.emergencyContactName = stringUpdate(emergencyName)
        update.emergencyContactPhone = stringUpdate(emergencyPhone)
        return update
    }

    /// First error attached to an input, resolving the combined inputs
    /// (Cidade / UF carries both address columns).
    public func fieldError(_ keys: String...) -> String? {
        for key in keys {
            if let message = fieldErrors[key] { return message }
        }
        return nil
    }

    // MARK: Internals

    private func stringUpdate(_ raw: String) -> ProfileFieldUpdate<String> {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? .clear : .set(trimmed)
    }

    private func populate(from profile: AlunoProfile) {
        email = profile.email
        birthDateBR = profile.birthDate.map(ProfileFormatters.birthDateBR) ?? ""
        fullName = profile.fullName
        gender = profile.gender
        phone = profile.phone ?? ""
        cpfLocked = profile.cpfLocked
        rgLocked = profile.rgLocked
        lockedCpfMasked = profile.cpf.map(ProfileFormatters.cpfMask) ?? ""
        lockedRg = profile.rg ?? ""
        cpfInput = profile.cpfLocked ? "" : (profile.cpf ?? "")
        rgInput = profile.rgLocked ? "" : (profile.rg ?? "")
        addressLine = profile.addressLine ?? ""
        cityUF = ProfileFormatters.cityUF(city: profile.addressCity, uf: profile.addressState)
        cep = profile.addressZip.map(ProfileFormatters.cepMask) ?? ""
        emergencyName = profile.emergencyContactName ?? ""
        emergencyPhone = profile.emergencyContactPhone ?? ""
    }

    private func apply(error: ApiError, update: AlunoProfileUpdate) {
        switch error {
        case .validation(let fields):
            // Server messages are already PT-BR — surface them per field.
            for field in fields {
                fieldErrors[field.field] = field.messages.first ?? ProfileMessages.generic
            }
            if fields.isEmpty {
                bannerError = ProfileMessages.generic
            }
        case .conflict(let code) where code == ApiErrorCode.profileFieldLocked:
            // The 422 mapper keeps the stable code but drops the field list;
            // the form knows which write-once field it attempted (it never
            // sends a locked one, so at most one candidate raced).
            if update.cpf != nil {
                fieldErrors["cpf"] = ProfileMessages.fieldLocked
            }
            if update.rg != nil, update.cpf == nil {
                fieldErrors["rg"] = ProfileMessages.fieldLocked
            }
            if fieldErrors.isEmpty {
                bannerError = ProfileMessages.generic
            }
        default:
            bannerError = ProfileMessages.message(for: error)
        }
    }
}
