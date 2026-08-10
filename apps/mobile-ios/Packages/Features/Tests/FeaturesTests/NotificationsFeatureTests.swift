import Foundation
import Testing
@testable import NotificationsFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 010)

final class FakeNotificationsRepository: NotificationsRepository, @unchecked Sendable {
    /// Consumed in call order; the last result repeats once drained.
    var listResults: [Result<NotificationsPage, ApiError>] = []
    private(set) var listCalls: [String?] = []

    var unreadCountResult: Result<Int, ApiError> = .success(0)
    private(set) var unreadCountCalls = 0

    var markReadResult: Result<NotificationItem, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var markReadCalls: [UUID] = []

    var markAllReadResult: Result<Int, ApiError> = .success(0)
    private(set) var markAllReadCalls = 0

    var settingsResult: Result<Bool, ApiError> = .success(true)
    private(set) var settingsCalls = 0

    var updateSettingsResult: Result<Bool, ApiError>?
    private(set) var updateSettingsCalls: [Bool] = []

    func list(cursor: String?) async throws -> NotificationsPage {
        listCalls.append(cursor)
        guard let next = listResults.first else {
            throw ApiError.unknown(status: 0, code: nil)
        }
        if listResults.count > 1 { listResults.removeFirst() }
        return try next.get()
    }

    func unreadCount() async throws -> Int {
        unreadCountCalls += 1
        return try unreadCountResult.get()
    }

    func markRead(notificationId: UUID) async throws -> NotificationItem {
        markReadCalls.append(notificationId)
        return try markReadResult.get()
    }

    func markAllRead() async throws -> Int {
        markAllReadCalls += 1
        return try markAllReadResult.get()
    }

    func settingsEnabled() async throws -> Bool {
        settingsCalls += 1
        return try settingsResult.get()
    }

    func updateSettings(enabled: Bool) async throws -> Bool {
        updateSettingsCalls.append(enabled)
        guard let updateSettingsResult else { return enabled }
        return try updateSettingsResult.get()
    }
}

// MARK: - Fixtures

enum NotificationsFixtures {
    static let eventId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000c1")!

    static func item(
        id: UUID = UUID(),
        category: NotificationCategory = .payment,
        chip: String? = "R$",
        title: String = "Mensalidade de agosto disponível",
        body: String? = "Vence em 10 de agosto · R$ 180,00",
        routeHint: String? = "wallet",
        readAt: Date? = nil,
        createdAt: Date = Date()
    ) -> NotificationItem {
        NotificationItem(
            id: id,
            category: category,
            chip: chip,
            title: title,
            body: body,
            routeHint: routeHint,
            readAt: readAt,
            createdAt: createdAt
        )
    }

    static func page(_ count: Int, nextCursor: String? = nil) -> NotificationsPage {
        NotificationsPage(
            items: (0..<count).map { _ in item() },
            nextCursor: nextCursor
        )
    }
}

// MARK: - Route plan (semantic route → shell destination, per persona)

@Suite("NotificationRoutePlan (spec 010 route map)")
struct NotificationRoutePlanTests {
    private let eventId = NotificationsFixtures.eventId

    @Test("aluno: every semantic hint lands on its shell surface")
    func alunoPlan() {
        #expect(NotificationRoutePlan.destination(for: .wallet, persona: .aluno) == .carteiraTab)
        #expect(NotificationRoutePlan.destination(for: .event(id: eventId), persona: .aluno) == .eventDetail(id: eventId))
        #expect(NotificationRoutePlan.destination(for: .graduation, persona: .aluno) == .graduation)
        #expect(NotificationRoutePlan.destination(for: .orders, persona: .aluno) == .myOrders)
        #expect(NotificationRoutePlan.destination(for: .store, persona: .aluno) == .storeVitrine)
    }

    @Test("professor: only the storefront surface navigates (no financial/graduation surface)")
    func professorPlan() {
        #expect(NotificationRoutePlan.destination(for: .wallet, persona: .professor) == nil)
        #expect(NotificationRoutePlan.destination(for: .event(id: eventId), persona: .professor) == nil)
        #expect(NotificationRoutePlan.destination(for: .graduation, persona: .professor) == nil)
        #expect(NotificationRoutePlan.destination(for: .orders, persona: .professor) == .myOrders)
        #expect(NotificationRoutePlan.destination(for: .store, persona: .professor) == .storeVitrine)
    }

    @Test("responsável: guardian hints land on tabs (wallet → Pagamentos, graduation → dependents)")
    func responsavelPlan() {
        #expect(NotificationRoutePlan.destination(for: .wallet, persona: .responsavel) == .pagamentosTab)
        #expect(NotificationRoutePlan.destination(for: .event(id: eventId), persona: .responsavel) == .eventosTab)
        #expect(NotificationRoutePlan.destination(for: .graduation, persona: .responsavel) == .alunosTab)
        #expect(NotificationRoutePlan.destination(for: .orders, persona: .responsavel) == nil)
        #expect(NotificationRoutePlan.destination(for: .store, persona: .responsavel) == nil)
    }
}

// MARK: - Feed model (list, pagination, read-all on open)

@MainActor
@Suite("NotificationsFeedModel")
struct NotificationsFeedModelTests {
    @Test("open loads the first page and fires read-all (the dot dies)")
    func openReadsAll() async {
        let repository = FakeNotificationsRepository()
        repository.listResults = [.success(NotificationsFixtures.page(3))]
        repository.markAllReadResult = .success(3)
        var badgeCleared = false
        let model = NotificationsFeedModel(repository: repository) { badgeCleared = true }

        await model.open()

        #expect(model.phase == .loaded)
        #expect(model.items.count == 3)
        #expect(repository.listCalls == [nil])
        #expect(repository.markAllReadCalls == 1)
        #expect(model.clearedOnOpen)
        #expect(badgeCleared)
    }

    @Test("cursor pagination appends pages and stops at the tail")
    func pagination() async {
        let repository = FakeNotificationsRepository()
        repository.listResults = [
            .success(NotificationsFixtures.page(2, nextCursor: "c1")),
            .success(NotificationsFixtures.page(2, nextCursor: nil)),
        ]
        let model = NotificationsFeedModel(repository: repository)

        await model.open()
        #expect(model.hasMore)

        await model.loadMore()
        #expect(repository.listCalls == [nil, "c1"])
        #expect(model.items.count == 4)
        #expect(!model.hasMore)

        // No cursor left — the tail never refires.
        await model.loadMore()
        #expect(repository.listCalls.count == 2)
    }

    @Test("pages that raced a refresh dedup by id")
    func paginationDedup() async {
        let repository = FakeNotificationsRepository()
        let shared = NotificationsFixtures.item()
        repository.listResults = [
            .success(NotificationsPage(items: [shared], nextCursor: "c1")),
            .success(NotificationsPage(items: [shared, NotificationsFixtures.item()], nextCursor: nil)),
        ]
        let model = NotificationsFeedModel(repository: repository)

        await model.open()
        await model.loadMore()

        #expect(model.items.count == 2)
    }

    @Test("a failed loadMore keeps the cursor for the next scroll")
    func loadMoreFailureRetains() async {
        let repository = FakeNotificationsRepository()
        repository.listResults = [
            .success(NotificationsFixtures.page(1, nextCursor: "c1")),
            .failure(.network(.notConnectedToInternet)),
            .success(NotificationsFixtures.page(1, nextCursor: nil)),
        ]
        let model = NotificationsFeedModel(repository: repository)

        await model.open()
        await model.loadMore()
        // Silent failure: the page renders on, cursor survives.
        #expect(model.hasMore)
        #expect(model.items.count == 1)

        await model.loadMore()
        #expect(model.items.count == 2)
        #expect(!model.hasMore)
    }

    @Test("a failed first page surfaces PT-BR copy; read-all failure never blocks the list")
    func failures() async {
        let repository = FakeNotificationsRepository()
        repository.listResults = [.failure(.network(.notConnectedToInternet))]
        let model = NotificationsFeedModel(repository: repository)

        await model.open()
        #expect(model.phase == .failed(message: "Sem conexão com a internet. Tente novamente."))

        let readAllFails = FakeNotificationsRepository()
        readAllFails.listResults = [.success(NotificationsFixtures.page(2))]
        readAllFails.markAllReadResult = .failure(.unknown(status: 500, code: nil))
        var badgeCleared = false
        let model2 = NotificationsFeedModel(repository: readAllFails) { badgeCleared = true }

        await model2.open()
        // The list renders regardless; the dot just survives to the next open.
        #expect(model2.phase == .loaded)
        #expect(model2.items.count == 2)
        #expect(!model2.clearedOnOpen)
        #expect(!badgeCleared)
    }

    @Test("refresh reloads from the top and refires read-all for late arrivals")
    func refresh() async {
        let repository = FakeNotificationsRepository()
        repository.listResults = [
            .success(NotificationsFixtures.page(1, nextCursor: "c1")),
            .success(NotificationsFixtures.page(2, nextCursor: nil)),
        ]
        let model = NotificationsFeedModel(repository: repository)

        await model.open()
        await model.refresh()

        #expect(repository.listCalls == [nil, nil])
        #expect(model.items.count == 2)
        #expect(repository.markAllReadCalls == 2)
    }
}

// MARK: - Badge model (the bell's pink dot)

@MainActor
@Suite("NotificationsBadgeModel")
struct NotificationsBadgeModelTests {
    @Test("refresh fetches the count; clear zeroes it optimistically")
    func refreshAndClear() async {
        let repository = FakeNotificationsRepository()
        repository.unreadCountResult = .success(5)
        let model = NotificationsBadgeModel(repository: repository)
        #expect(!model.hasUnread)

        await model.refresh()
        #expect(model.unreadCount == 5)
        #expect(model.hasUnread)

        model.clear()
        #expect(!model.hasUnread)
    }

    @Test("a failed refetch keeps the last known value (badge is best-effort)")
    func failureKeepsLastValue() async {
        let repository = FakeNotificationsRepository()
        repository.unreadCountResult = .success(2)
        let model = NotificationsBadgeModel(repository: repository)
        await model.refresh()

        repository.unreadCountResult = .failure(.network(.notConnectedToInternet))
        await model.refresh()

        #expect(model.unreadCount == 2)
    }

    @Test("muted memberships answer 0 — the dot goes quiet with no client branching")
    func mutedAnswersZero() async {
        let repository = FakeNotificationsRepository()
        repository.unreadCountResult = .success(0)
        let model = NotificationsBadgeModel(repository: repository)

        await model.refresh()

        #expect(!model.hasUnread)
    }
}

// MARK: - Settings model (the perfil "Notificações" switch)

@MainActor
@Suite("NotificationsSettingsModel")
struct NotificationsSettingsModelTests {
    @Test("load reads the membership flag once; the switch renders it")
    func load() async {
        let repository = FakeNotificationsRepository()
        repository.settingsResult = .success(false)
        let model = NotificationsSettingsModel(repository: repository)
        #expect(model.enabled == nil)

        await model.load()
        #expect(model.enabled == false)

        // Idempotent — revisiting the perfil never refires.
        await model.load()
        #expect(repository.settingsCalls == 1)
    }

    @Test("a failed load leaves the row disabled with PT-BR copy")
    func loadFailure() async {
        let repository = FakeNotificationsRepository()
        repository.settingsResult = .failure(.unknown(status: 500, code: nil))
        let model = NotificationsSettingsModel(repository: repository)

        await model.load()

        #expect(model.enabled == nil)
        #expect(model.errorMessage == "Não foi possível carregar. Tente novamente.")
    }

    @Test("flipping the switch puts the flag and keeps the server echo")
    func flip() async {
        let repository = FakeNotificationsRepository()
        repository.settingsResult = .success(true)
        let model = NotificationsSettingsModel(repository: repository)
        await model.load()

        await model.setEnabled(false)

        #expect(repository.updateSettingsCalls == [false])
        #expect(model.enabled == false)
        #expect(model.errorMessage == nil)

        // Same-value flips are no-ops.
        await model.setEnabled(false)
        #expect(repository.updateSettingsCalls == [false])
    }

    @Test("a failed save reverts the optimistic flip and surfaces copy")
    func flipFailure() async {
        let repository = FakeNotificationsRepository()
        repository.settingsResult = .success(true)
        repository.updateSettingsResult = .failure(.network(.notConnectedToInternet))
        let model = NotificationsSettingsModel(repository: repository)
        await model.load()

        await model.setEnabled(false)

        #expect(model.enabled == true)
        #expect(model.errorMessage == "Não foi possível salvar. Tente novamente.")
    }
}
