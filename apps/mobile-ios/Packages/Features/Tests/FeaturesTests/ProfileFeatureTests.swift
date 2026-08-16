import Foundation
import Testing
@testable import ProfileFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 013 REP.16)

final class FakeProfileRepository: ProfileRepository, @unchecked Sendable {
    var profileResult: Result<AlunoProfile, ApiError> = .failure(.unknown(status: 0, code: nil))
    var updateResult: Result<AlunoProfile, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var updateCalls: [AlunoProfileUpdate] = []

    func alunoProfile() async throws -> AlunoProfile {
        try profileResult.get()
    }

    func updateAlunoProfile(_ update: AlunoProfileUpdate) async throws -> AlunoProfile {
        updateCalls.append(update)
        return try updateResult.get()
    }
}

// MARK: - Fixtures

enum ProfileFixtures {
    static func profile(
        cpf: String? = "12345678900",
        cpfLocked: Bool = true,
        rg: String? = "12.345.678-9",
        rgLocked: Bool = true
    ) -> AlunoProfile {
        AlunoProfile(
            fullName: "Lucas Almeida",
            email: "lucas@tatame.app",
            birthDate: "1998-03-14",
            phone: "(11) 98765-4321",
            gender: .male,
            cpf: cpf,
            cpfLocked: cpfLocked,
            rg: rg,
            rgLocked: rgLocked,
            addressLine: "Rua das Palmeiras, 120, ap 42",
            addressCity: "São Paulo",
            addressState: "SP",
            addressZip: "01310100",
            emergencyContactName: "Carla Almeida",
            emergencyContactPhone: "(11) 91234-5678",
            avatarUrl: nil
        )
    }

    static func emptyProfile() -> AlunoProfile {
        AlunoProfile(
            fullName: "Lucas Almeida",
            email: "lucas@tatame.app",
            birthDate: nil,
            phone: nil,
            gender: nil,
            cpf: nil,
            cpfLocked: false,
            rg: nil,
            rgLocked: false,
            addressLine: nil,
            addressCity: nil,
            addressState: nil,
            addressZip: nil,
            emergencyContactName: nil,
            emergencyContactPhone: nil,
            avatarUrl: nil
        )
    }
}

@MainActor
@Suite("DadosPessoaisModel (spec 013, REP.16 — locked/save/errors)")
struct DadosPessoaisModelTests {
    private func loadedModel(_ profile: AlunoProfile) async -> (DadosPessoaisModel, FakeProfileRepository) {
        let repository = FakeProfileRepository()
        repository.profileResult = .success(profile)
        let model = DadosPessoaisModel(repository: repository)
        await model.load()
        return (model, repository)
    }

    // MARK: Load + lock state (stories 22-23)

    @Test("load populates the form, masks the locked documents, formats read-only facts")
    func loadPopulates() async {
        let (model, _) = await loadedModel(ProfileFixtures.profile())

        #expect(model.phase == .loaded)
        #expect(model.fullName == "Lucas Almeida")
        #expect(model.email == "lucas@tatame.app")
        #expect(model.birthDateBR == "14/03/1998")
        #expect(model.gender == .male)
        #expect(model.cpfLocked)
        #expect(model.lockedCpfMasked == "123.456.789-00")
        #expect(model.rgLocked)
        #expect(model.lockedRg == "12.345.678-9")
        #expect(model.cityUF == "São Paulo / SP")
        #expect(model.cep == "01310-100")
    }

    @Test("an empty profile renders editable CPF/RG (settable while NULL)")
    func emptyProfileUnlocked() async {
        let (model, _) = await loadedModel(ProfileFixtures.emptyProfile())

        #expect(!model.cpfLocked)
        #expect(!model.rgLocked)
        #expect(model.cpfInput.isEmpty)
        #expect(model.birthDateBR.isEmpty)
    }

    // MARK: Update building (stories 24-25)

    @Test("locked CPF/RG never leave the device; unlocked non-empty inputs are sent")
    func lockedFieldsOmitted() async {
        let (locked, _) = await loadedModel(ProfileFixtures.profile())
        locked.cpfInput = "999.999.999-99" // Hostile input — the form hides it anyway.
        #expect(locked.buildUpdate().cpf == nil)
        #expect(locked.buildUpdate().rg == nil)

        let (unlocked, _) = await loadedModel(ProfileFixtures.emptyProfile())
        unlocked.cpfInput = "123.456.789-00"
        unlocked.rgInput = "12.345.678-9"
        #expect(unlocked.buildUpdate().cpf == "123.456.789-00")
        #expect(unlocked.buildUpdate().rg == "12.345.678-9")

        // Empty unlocked inputs stay unsent (write-once fields never clear).
        unlocked.cpfInput = " "
        #expect(unlocked.buildUpdate().cpf == nil)
    }

    @Test("Cidade / UF parses into the two typed columns; emptied fields clear explicitly")
    func updateShape() async {
        let (model, _) = await loadedModel(ProfileFixtures.profile())
        model.cityUF = "Campinas / sp"
        model.addressLine = ""
        model.phone = "  "

        let update = model.buildUpdate()
        #expect(update.addressCity == .set("Campinas"))
        #expect(update.addressState == .set("SP"))
        #expect(update.addressLine == .clear)
        #expect(update.phone == .clear)
        #expect(update.fullName == "Lucas Almeida")
        #expect(update.gender == .set(.male))
    }

    // MARK: Save round trip (story 25)

    @Test("save refreshes the form from the response and flags success")
    func saveRoundTrip() async {
        let (model, repository) = await loadedModel(ProfileFixtures.emptyProfile())
        model.cpfInput = "12345678900"
        repository.updateResult = .success(ProfileFixtures.profile())

        await model.save()

        #expect(repository.updateCalls.count == 1)
        #expect(model.saved)
        #expect(model.bannerError == nil)
        // The response locked the CPF — the form flips to the dashed box.
        #expect(model.cpfLocked)
        #expect(model.lockedCpfMasked == "123.456.789-00")
    }

    @Test("markEdited clears the success banner")
    func editClearsSaved() async {
        let (model, repository) = await loadedModel(ProfileFixtures.profile())
        repository.updateResult = .success(ProfileFixtures.profile())
        await model.save()
        #expect(model.saved)

        model.markEdited()
        #expect(!model.saved)
    }

    // MARK: Error mapping (per-field PT-BR)

    @Test("422 validation lands the server's PT-BR messages on the right fields")
    func validationErrors() async {
        let (model, repository) = await loadedModel(ProfileFixtures.profile())
        repository.updateResult = .failure(.validation(fields: [
            FieldError(field: "addressZip", messages: ["CEP inválido — use 8 dígitos"]),
            FieldError(field: "addressState", messages: ["UF inválida"]),
            FieldError(field: "phone", messages: ["Telefone inválido"]),
        ]))

        await model.save()

        #expect(!model.saved)
        #expect(model.fieldErrors["addressZip"] == "CEP inválido — use 8 dígitos")
        #expect(model.fieldErrors["phone"] == "Telefone inválido")
        // The combined Cidade / UF input resolves either address column.
        #expect(model.fieldError("addressCity", "addressState") == "UF inválida")
        #expect(model.fieldError("addressZip") == "CEP inválido — use 8 dígitos")
    }

    @Test("profile.field_locked attributes the lock message to the attempted document")
    func fieldLockedError() async {
        let (model, repository) = await loadedModel(ProfileFixtures.emptyProfile())
        model.cpfInput = "12345678900"
        repository.updateResult = .failure(.conflict(code: ApiErrorCode.profileFieldLocked))

        await model.save()

        #expect(model.fieldErrors["cpf"] == ProfileMessages.fieldLocked)
        #expect(model.fieldErrors["rg"] == nil)
        #expect(model.bannerError == nil)
    }

    @Test("profile.field_read_only and tenant.read_only land on the banner")
    func bannerErrors() async {
        let (model, repository) = await loadedModel(ProfileFixtures.profile())

        repository.updateResult = .failure(.conflict(code: ApiErrorCode.profileFieldReadOnly))
        await model.save()
        #expect(model.bannerError == ProfileMessages.fieldReadOnly)

        repository.updateResult = .failure(.forbidden(code: ApiErrorCode.tenantReadOnly))
        await model.save()
        #expect(model.bannerError == ProfileMessages.readOnly)
    }

    @Test("save failures clear on the next successful save")
    func errorsClearOnRetry() async {
        let (model, repository) = await loadedModel(ProfileFixtures.profile())
        repository.updateResult = .failure(.validation(fields: [
            FieldError(field: "phone", messages: ["Telefone inválido"])
        ]))
        await model.save()
        #expect(model.fieldErrors["phone"] != nil)

        repository.updateResult = .success(ProfileFixtures.profile())
        await model.save()
        #expect(model.fieldErrors.isEmpty)
        #expect(model.saved)
    }

    @Test("load failure carries the PT-BR message")
    func loadFailure() async {
        let repository = FakeProfileRepository()
        repository.profileResult = .failure(.network(.notConnectedToInternet))
        let model = DadosPessoaisModel(repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: ProfileMessages.offline))
    }
}
