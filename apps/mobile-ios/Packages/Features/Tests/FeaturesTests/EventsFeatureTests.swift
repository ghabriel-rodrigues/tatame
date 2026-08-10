import Foundation
import Testing
@testable import BillingFeature
@testable import EventsFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 008)

final class FakeEventsRepository: EventsRepository, @unchecked Sendable {
    var detailResult: Result<EventDetail, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var detailCalls: [UUID] = []

    var registerResult: Result<EventRegistrationOutcome, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var registerCalls: [UUID] = []

    var cancelResult: Result<Void, ApiError> = .success(())
    private(set) var cancelCalls: [UUID] = []

    var guardianEventsResult: Result<[GuardianEvent], ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var guardianEventsCalls = 0

    var guardianRegisterResult: Result<EventRegistrationOutcome, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var guardianRegisterCalls: [(eventId: UUID, studentId: UUID)] = []

    var guardianCancelResult: Result<Void, ApiError> = .success(())
    private(set) var guardianCancelCalls: [(eventId: UUID, studentId: UUID)] = []

    func alunoEventDetail(eventId: UUID) async throws -> EventDetail {
        detailCalls.append(eventId)
        return try detailResult.get()
    }

    func alunoRegister(eventId: UUID) async throws -> EventRegistrationOutcome {
        registerCalls.append(eventId)
        return try registerResult.get()
    }

    func alunoCancelRegistration(eventId: UUID) async throws {
        cancelCalls.append(eventId)
        try cancelResult.get()
    }

    func guardianEvents() async throws -> [GuardianEvent] {
        guardianEventsCalls += 1
        return try guardianEventsResult.get()
    }

    func guardianRegister(eventId: UUID, studentId: UUID) async throws -> EventRegistrationOutcome {
        guardianRegisterCalls.append((eventId, studentId))
        return try guardianRegisterResult.get()
    }

    func guardianCancelRegistration(eventId: UUID, studentId: UUID) async throws {
        guardianCancelCalls.append((eventId, studentId))
        try guardianCancelResult.get()
    }
}

// MARK: - Fixtures

enum EventsFixtures {
    static let eventId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000f1")!
    static let registrationId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000f2")!
    static let chargeId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000f3")!
    static let pedroId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000f4")!
    static let juliaId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000f5")!

    static func detail(
        priceCents: Int? = nil,
        registration: EventRegistrationState? = nil
    ) -> EventDetail {
        EventDetail(
            id: eventId,
            name: "Open mat de verão",
            bannerPreset: "event-purple-pink",
            location: "Tatame principal",
            date: "2026-08-15",
            time: "10:00",
            priceCents: priceCents,
            description: "Treino aberto para todas as faixas.",
            responsibleName: "Prof. Rafael Nunes",
            registration: registration
        )
    }

    static func registration(
        status: EventRegistrationStatus,
        chargeId: UUID? = nil
    ) -> EventRegistrationState {
        EventRegistrationState(id: registrationId, status: status, chargeId: chargeId)
    }

    static func guardianEvent(
        priceCents: Int? = 6000,
        pedro: EventRegistrationState? = nil,
        julia: EventRegistrationState? = nil
    ) -> GuardianEvent {
        GuardianEvent(
            id: eventId,
            name: "Festival Kids",
            bannerPreset: "event-purple-pink",
            location: "Ginásio Municipal",
            date: "2026-09-15",
            time: "09:30",
            priceCents: priceCents,
            description: nil,
            dependents: [
                GuardianEventDependent(studentId: pedroId, fullName: "Pedro Silveira", registration: pedro),
                GuardianEventDependent(studentId: juliaId, fullName: "Júlia Silveira", registration: julia),
            ]
        )
    }
}

// MARK: - Detail CTA state machine (spec 008 testing decisions)

@Suite("EventDetailCTA (free/paid × none/pending/confirmed, aluno-10)")
struct EventDetailCTATests {
    @Test("free without registration → Confirmar presença, nothing else")
    func freeNone() {
        let cta = EventDetailCTA.state(priceCents: nil, registration: nil)
        #expect(cta.primary == .confirm)
        #expect(!cta.showsConfirmedBanner)
        #expect(!cta.showsPendingBanner)
        #expect(!cta.showsCancel)
    }

    @Test("free confirmed → banner + Cancelar participação, no primary")
    func freeConfirmed() {
        let cta = EventDetailCTA.state(
            priceCents: nil,
            registration: EventsFixtures.registration(status: .confirmed)
        )
        #expect(cta.primary == .none)
        #expect(cta.showsConfirmedBanner)
        #expect(cta.showsCancel)
    }

    @Test("paid without registration → Pagar inscrição · R$ X")
    func paidNone() {
        let cta = EventDetailCTA.state(priceCents: 6000, registration: nil)
        #expect(cta.primary == .pay(priceCents: 6000))
        #expect(!cta.showsCancel)
    }

    @Test("paid pending → pay retry + pending banner + cancel (not yet paid)")
    func paidPending() {
        let cta = EventDetailCTA.state(
            priceCents: 6000,
            registration: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId)
        )
        #expect(cta.primary == .pay(priceCents: 6000))
        #expect(cta.showsPendingBanner)
        #expect(cta.showsCancel)
    }

    @Test("paid confirmed → banner only; a settled inscription has no app-side cancel")
    func paidConfirmed() {
        let cta = EventDetailCTA.state(
            priceCents: 6000,
            registration: EventsFixtures.registration(status: .confirmed)
        )
        #expect(cta.primary == .none)
        #expect(cta.showsConfirmedBanner)
        #expect(!cta.showsCancel)
    }

    @Test("a canceled registration reads as not registered (re-confirm reuses the row)")
    func canceledReadsAsNone() {
        let free = EventDetailCTA.state(
            priceCents: nil,
            registration: EventsFixtures.registration(status: .canceled)
        )
        #expect(free.primary == .confirm)
        let paid = EventDetailCTA.state(
            priceCents: 6000,
            registration: EventsFixtures.registration(status: .canceled)
        )
        #expect(paid.primary == .pay(priceCents: 6000))
    }
}

// MARK: - Dependent chip mapping (responsavel-06)

@Suite("DependentChipAction (the documented chip UX, spec 008 stories 19-21)")
struct DependentChipActionTests {
    @Test("free: none → confirm, confirmed → cancel (the prototype's toggle)")
    func freeToggle() {
        #expect(DependentChipAction.forTap(priceCents: nil, registration: nil) == .confirm)
        #expect(
            DependentChipAction.forTap(
                priceCents: nil,
                registration: EventsFixtures.registration(status: .confirmed)
            ) == .cancel
        )
        #expect(
            DependentChipAction.forTap(
                priceCents: nil,
                registration: EventsFixtures.registration(status: .canceled)
            ) == .confirm
        )
    }

    @Test("paid: none → pay (register first); pending → pay on the open charge")
    func paidFlow() {
        #expect(DependentChipAction.forTap(priceCents: 6000, registration: nil) == .pay(openChargeId: nil))
        #expect(
            DependentChipAction.forTap(
                priceCents: 6000,
                registration: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId)
            ) == .pay(openChargeId: EventsFixtures.chargeId)
        )
    }

    @Test("paid confirmed chips are inert; long-press cancel exists on pending only")
    func paidConfirmedInert() {
        #expect(
            DependentChipAction.forTap(
                priceCents: 6000,
                registration: EventsFixtures.registration(status: .confirmed)
            ) == .none
        )
        #expect(
            DependentChipAction.canCancelPending(
                registration: EventsFixtures.registration(status: .pendingPayment, chargeId: nil)
            )
        )
        #expect(!DependentChipAction.canCancelPending(registration: EventsFixtures.registration(status: .confirmed)))
        #expect(!DependentChipAction.canCancelPending(registration: nil))
    }
}

// MARK: - Aluno detail model (EVT.14)

@Suite("AlunoEventDetailModel (detail + free/paid/cancel flows)")
@MainActor
struct AlunoEventDetailModelTests {
    private func loadedModel(
        _ detail: EventDetail
    ) async -> (AlunoEventDetailModel, FakeEventsRepository) {
        let repository = FakeEventsRepository()
        repository.detailResult = .success(detail)
        let model = AlunoEventDetailModel(eventId: EventsFixtures.eventId, repository: repository)
        await model.load()
        return (model, repository)
    }

    @Test("load fetches the detail and derives the CTA")
    func loads() async {
        let (model, repository) = await loadedModel(EventsFixtures.detail())
        #expect(repository.detailCalls == [EventsFixtures.eventId])
        #expect(model.detail?.name == "Open mat de verão")
        #expect(model.cta?.primary == .confirm)
    }

    @Test("Confirmar presença registers and refetches — gratuito is one tap")
    func confirmFree() async {
        let (model, repository) = await loadedModel(EventsFixtures.detail())
        repository.registerResult = .success(
            EventRegistrationOutcome(registration: EventsFixtures.registration(status: .confirmed))
        )
        repository.detailResult = .success(
            EventsFixtures.detail(registration: EventsFixtures.registration(status: .confirmed))
        )

        await model.confirmPresence()

        #expect(repository.registerCalls == [EventsFixtures.eventId])
        #expect(model.cta?.showsConfirmedBanner == true)
        #expect(model.actionError == nil)
    }

    @Test("Pagar inscrição registers, surfaces the chargeId, and opens the Pix target")
    func payRegisters() async {
        let (model, repository) = await loadedModel(EventsFixtures.detail(priceCents: 6000))
        repository.registerResult = .success(
            EventRegistrationOutcome(
                registration: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId),
                chargeId: EventsFixtures.chargeId
            )
        )
        repository.detailResult = .success(
            EventsFixtures.detail(
                priceCents: 6000,
                registration: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId)
            )
        )

        await model.payInscricao()

        #expect(repository.registerCalls == [EventsFixtures.eventId])
        #expect(model.pixTarget == AlunoEventDetailModel.PixTarget(chargeId: EventsFixtures.chargeId, amountCents: 6000))
    }

    @Test("a pending registration retries straight onto its open charge — no duplicate POST")
    func pendingRetry() async {
        let (model, repository) = await loadedModel(
            EventsFixtures.detail(
                priceCents: 6000,
                registration: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId)
            )
        )

        await model.payInscricao()

        #expect(repository.registerCalls.isEmpty)
        #expect(model.pixTarget?.chargeId == EventsFixtures.chargeId)
    }

    @Test("Cancelar participação cancels and refetches")
    func cancels() async {
        let (model, repository) = await loadedModel(
            EventsFixtures.detail(registration: EventsFixtures.registration(status: .confirmed))
        )
        repository.detailResult = .success(EventsFixtures.detail())

        await model.cancelParticipation()

        #expect(repository.cancelCalls == [EventsFixtures.eventId])
        #expect(model.cta?.primary == .confirm)
    }

    @Test("the stable event codes map to PT-BR copy")
    func errorCopy() async {
        let (model, repository) = await loadedModel(EventsFixtures.detail())
        repository.registerResult = .failure(.conflict(code: ApiErrorCode.eventNotPublished))
        await model.confirmPresence()
        #expect(model.actionError == EventsMessages.notPublished)

        repository.cancelResult = .failure(.conflict(code: ApiErrorCode.eventRegistrationSettled))
        await model.cancelParticipation()
        #expect(model.actionError == EventsMessages.registrationSettled)
    }

    @Test("a 404 detail (draft/canceled/foreign) fails with the PT-BR copy")
    func notFound() async {
        let repository = FakeEventsRepository()
        repository.detailResult = .failure(.notFound(code: ApiErrorCode.notFound))
        let model = AlunoEventDetailModel(eventId: EventsFixtures.eventId, repository: repository)
        await model.load()
        #expect(model.phase == .failed(message: EventsMessages.eventNotFound))
    }

    @Test("integration: paid register → Pix sheet flow → simulate → confirmed round trip")
    func paidRoundTrip() async throws {
        // Registration side.
        let (model, events) = await loadedModel(EventsFixtures.detail(priceCents: 6000))
        events.registerResult = .success(
            EventRegistrationOutcome(
                registration: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId),
                chargeId: EventsFixtures.chargeId
            )
        )
        await model.payInscricao()
        let target = try #require(model.pixTarget)

        // The Pix sheet rides the existing billing rails on the event charge.
        let billing = FakeBillingRepository()
        let pendingPayment = BillingFixtures.payment(status: .pending, provider: .simulated)
        billing.payResult = .success(
            PaymentCreated(payment: pendingPayment, charge: BillingFixtures.charge(), mandateCreated: false)
        )
        billing.simulateResult = .success(
            SimulatedSettlement(
                payment: BillingFixtures.payment(status: .succeeded, paidAt: Date()),
                charge: BillingFixtures.charge(status: .paid)
            )
        )
        // After settlement the server reports the registration confirmed.
        events.detailResult = .success(
            EventsFixtures.detail(
                priceCents: 6000,
                registration: EventsFixtures.registration(status: .confirmed)
            )
        )

        let flow = PaymentFlowModel(
            charge: .eventInscricao(
                chargeId: target.chargeId,
                amountCents: target.amountCents,
                dueDate: "2026-08-15",
                studentId: EventsFixtures.eventId
            ),
            method: .pix,
            payer: .aluno,
            repository: billing,
            onSettled: { Task { await model.paymentSettled() } }
        )
        await flow.start()
        #expect(flow.canSimulate)
        #expect(billing.payCalls.first?.chargeId == EventsFixtures.chargeId)

        await flow.simulate()
        guard case .success = flow.phase else {
            Issue.record("expected settled flow, got \(flow.phase)")
            return
        }
        // Let the onSettled reload land.
        await model.paymentSettled()
        #expect(model.cta?.showsConfirmedBanner == true)
    }
}

// MARK: - Responsável eventos model (EVT.15)

@Suite("ResponsavelEventosModel (per-dependent chips, spec 008 stories 18-21)")
@MainActor
struct ResponsavelEventosModelTests {
    private func loadedModel(
        _ events: [GuardianEvent]
    ) async -> (ResponsavelEventosModel, FakeEventsRepository) {
        let repository = FakeEventsRepository()
        repository.guardianEventsResult = .success(events)
        let model = ResponsavelEventosModel(repository: repository)
        await model.load()
        return (model, repository)
    }

    @Test("load fetches the guardian events with per-dependent states")
    func loads() async {
        let event = EventsFixtures.guardianEvent(
            pedro: EventsFixtures.registration(status: .confirmed)
        )
        let (model, repository) = await loadedModel([event])
        #expect(repository.guardianEventsCalls == 1)
        #expect(model.events?.count == 1)
        // Pedro confirmed never implies Júlia confirmed (story 21).
        #expect(model.events?[0].dependent(studentId: EventsFixtures.pedroId)?.isConfirmed == true)
        #expect(model.events?[0].dependent(studentId: EventsFixtures.juliaId)?.isConfirmed == false)
    }

    @Test("free chip tap confirms that child; tapping again cancels (the toggle)")
    func freeToggle() async {
        let event = EventsFixtures.guardianEvent(priceCents: nil)
        let (model, repository) = await loadedModel([event])
        repository.guardianRegisterResult = .success(
            EventRegistrationOutcome(registration: EventsFixtures.registration(status: .confirmed))
        )

        await model.chipTapped(event: event, dependent: event.dependents[0])
        #expect(repository.guardianRegisterCalls.count == 1)
        #expect(repository.guardianRegisterCalls[0].studentId == EventsFixtures.pedroId)

        // Confirmed chip → cancel.
        let confirmed = EventsFixtures.guardianEvent(
            priceCents: nil,
            pedro: EventsFixtures.registration(status: .confirmed)
        )
        await model.chipTapped(event: confirmed, dependent: confirmed.dependents[0])
        #expect(repository.guardianCancelCalls.count == 1)
        #expect(repository.guardianCancelCalls[0].studentId == EventsFixtures.pedroId)
    }

    @Test("paid chip registers the dependent and opens the Pix target billed to the guardian")
    func paidChip() async {
        let event = EventsFixtures.guardianEvent()
        let (model, repository) = await loadedModel([event])
        repository.guardianRegisterResult = .success(
            EventRegistrationOutcome(
                registration: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId),
                chargeId: EventsFixtures.chargeId
            )
        )

        await model.chipTapped(event: event, dependent: event.dependents[1])

        #expect(repository.guardianRegisterCalls.count == 1)
        #expect(repository.guardianRegisterCalls[0].studentId == EventsFixtures.juliaId)
        #expect(model.pixTarget?.chargeId == EventsFixtures.chargeId)
        #expect(model.pixTarget?.dependentName == "Júlia Silveira")
        #expect(model.pixTarget?.amountCents == 6000)
    }

    @Test("pending chip re-opens the sheet on the open charge — no duplicate POST")
    func pendingChip() async {
        let event = EventsFixtures.guardianEvent(
            pedro: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId)
        )
        let (model, repository) = await loadedModel([event])

        await model.chipTapped(event: event, dependent: event.dependents[0])

        #expect(repository.guardianRegisterCalls.isEmpty)
        #expect(model.pixTarget?.chargeId == EventsFixtures.chargeId)
    }

    @Test("paid confirmed chips are inert — settled inscriptions take the admin refund path")
    func paidConfirmedInert() async {
        let event = EventsFixtures.guardianEvent(
            pedro: EventsFixtures.registration(status: .confirmed)
        )
        let (model, repository) = await loadedModel([event])

        await model.chipTapped(event: event, dependent: event.dependents[0])

        #expect(repository.guardianRegisterCalls.isEmpty)
        #expect(repository.guardianCancelCalls.isEmpty)
        #expect(model.pixTarget == nil)
    }

    @Test("long-press cancel on a pending chip cancels the registration (and its charge server-side)")
    func pendingCancel() async {
        let event = EventsFixtures.guardianEvent(
            pedro: EventsFixtures.registration(status: .pendingPayment, chargeId: EventsFixtures.chargeId)
        )
        let (model, repository) = await loadedModel([event])

        await model.cancel(event: event, dependent: event.dependents[0])

        #expect(repository.guardianCancelCalls.count == 1)
        #expect(repository.guardianCancelCalls[0].studentId == EventsFixtures.pedroId)
    }

    @Test("a foreign dependent 404 maps to the PT-BR copy")
    func foreignDependent() async {
        let event = EventsFixtures.guardianEvent(priceCents: nil)
        let (model, repository) = await loadedModel([event])
        repository.guardianRegisterResult = .failure(.notFound(code: ApiErrorCode.notFound))

        await model.chipTapped(event: event, dependent: event.dependents[0])

        #expect(model.actionError == EventsMessages.eventNotFound)
    }
}

// MARK: - Synthetic event charge projection

@Suite("Charge.eventInscricao (display-only projection for the Pix flow)")
struct EventChargeProjectionTests {
    @Test("carries the charge id, amount and due date; renders as open")
    func projection() {
        let charge = Charge.eventInscricao(
            chargeId: EventsFixtures.chargeId,
            amountCents: 6000,
            dueDate: "2026-09-15",
            studentId: EventsFixtures.pedroId
        )
        #expect(charge.id == EventsFixtures.chargeId)
        #expect(charge.amountCents == 6000)
        #expect(charge.dueDate == "2026-09-15")
        #expect(charge.isOpen)
        #expect(charge.currency == "BRL")
    }
}
