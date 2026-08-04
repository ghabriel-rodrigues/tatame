import Foundation
import Testing
@testable import AttendanceFeature
import TatameCore

// MARK: - Fake (repository-protocol seam, spec 004)

final class FakeAttendanceRepository: AttendanceRepository, @unchecked Sendable {
    private let lock = NSLock()

    var homeResult: Result<AlunoHome, ApiError> = .failure(.unknown(status: 0, code: nil))
    var checkInResult: Result<CheckinResult, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var checkInCalls: [(method: CheckinMethod, qrToken: String?, code: String?, classId: UUID?)] = []

    /// Consumed per open call (start, then reopen); the last entry repeats.
    var openLiveCodeResults: [Result<LiveCode, ApiError>] = []
    private(set) var openLiveCodeCalls = 0
    var closeLiveCodeResult: Result<LiveCode, ApiError> = .failure(.unknown(status: 0, code: nil))
    var snapshotResult: Result<LiveSnapshot, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var snapshotCalls = 0
    var ticketResult: Result<StreamTicket, ApiError> = .success(StreamTicket(ticket: "t", expiresInSeconds: 60))
    private(set) var ticketCalls = 0

    /// One script per stream connection; when exhausted, streams stay open
    /// under manual control (`yield`/`finishStream`).
    enum StreamScript {
        case stayOpen
        case events([LiveStreamEvent], error: ApiError?)
    }

    var streamScripts: [StreamScript] = []
    private(set) var streamConnections = 0
    private var continuations: [AsyncThrowingStream<LiveStreamEvent, any Error>.Continuation] = []

    var rollCallResult: Result<RollCall, ApiError> = .failure(.unknown(status: 0, code: nil))
    var markResult: Result<MarkAttendanceResult, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var markCalls: [(sessionId: UUID, studentId: UUID)] = []
    var revokeResult: Result<RevokeAttendanceResult, ApiError> = .failure(.unknown(status: 0, code: nil))
    private(set) var revokeCalls: [UUID] = []

    var dashboardResult: Result<ProfessorDashboard, ApiError> = .failure(.unknown(status: 0, code: nil))
    var studentsResult: Result<[RosterStudent], ApiError> = .success([])
    private(set) var studentsCalls: [UUID?] = []

    func alunoHome() async throws -> AlunoHome {
        try homeResult.get()
    }

    func checkIn(method: CheckinMethod, qrToken: String?, code: String?, classId: UUID?) async throws -> CheckinResult {
        checkInCalls.append((method, qrToken, code, classId))
        return try checkInResult.get()
    }

    func openLiveCode(classId _: UUID) async throws -> LiveCode {
        openLiveCodeCalls += 1
        guard !openLiveCodeResults.isEmpty else {
            throw ApiError.unknown(status: 0, code: nil)
        }
        let result = openLiveCodeResults.count > 1
            ? openLiveCodeResults.removeFirst()
            : openLiveCodeResults[0]
        return try result.get()
    }

    func closeLiveCode(id _: UUID) async throws -> LiveCode {
        try closeLiveCodeResult.get()
    }

    func liveSnapshot(liveCodeId _: UUID) async throws -> LiveSnapshot {
        snapshotCalls += 1
        return try snapshotResult.get()
    }

    func mintStreamTicket(liveCodeId _: UUID) async throws -> StreamTicket {
        ticketCalls += 1
        return try ticketResult.get()
    }

    func liveStream(liveCodeId _: UUID, ticket _: String) -> AsyncThrowingStream<LiveStreamEvent, any Error> {
        let script: StreamScript = lock.withLock {
            streamConnections += 1
            return streamScripts.isEmpty ? .stayOpen : streamScripts.removeFirst()
        }
        return AsyncThrowingStream { continuation in
            switch script {
            case .stayOpen:
                lock.withLock { continuations.append(continuation) }
            case .events(let events, let error):
                for event in events {
                    continuation.yield(event)
                }
                if let error {
                    continuation.finish(throwing: error)
                } else {
                    continuation.finish()
                }
            }
        }
    }

    /// Pushes an event into the most recent open (stayOpen) stream.
    func yield(_ event: LiveStreamEvent) {
        lock.withLock { continuations.last?.yield(event) }
    }

    func finishStream(throwing error: ApiError? = nil) {
        lock.withLock {
            if let error {
                continuations.last?.finish(throwing: error)
            } else {
                continuations.last?.finish()
            }
        }
    }

    func openRollCall(classId _: UUID) async throws -> RollCall {
        try rollCallResult.get()
    }

    func markAttendance(sessionId: UUID, studentId: UUID) async throws -> MarkAttendanceResult {
        markCalls.append((sessionId, studentId))
        return try markResult.get()
    }

    func revokeAttendance(id: UUID) async throws -> RevokeAttendanceResult {
        revokeCalls.append(id)
        return try revokeResult.get()
    }

    func dashboard() async throws -> ProfessorDashboard {
        try dashboardResult.get()
    }

    func students(notEnrolledInClassId: UUID?) async throws -> [RosterStudent] {
        studentsCalls.append(notEnrolledInClassId)
        return try studentsResult.get()
    }
}

// MARK: - Fixtures

enum AttendanceFixtures {
    static let classId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000a1")!
    static let sessionId = UUID(uuidString: "0198a7b0-0000-7000-8000-0000000000a2")!
    static let slot = ScheduleSlot(weekday: 6, startTime: "10:00", durationMinutes: 120)

    static func stats(streak: Int? = 7, totalLessons: Int = 26) -> AlunoStats {
        AlunoStats(
            monthPresencePct: 86,
            monthAttendedSessions: 12,
            monthTotalSessions: 14,
            streak: streak,
            totalLessons: totalLessons
        )
    }

    static func todayClass(checkedIn: Bool = false) -> AlunoTodayClass {
        AlunoTodayClass(classId: classId, className: "Open mat", slot: slot, checkedIn: checkedIn)
    }

    static func home(checkedIn: Bool = false, streak: Int? = 7) -> AlunoHome {
        AlunoHome(
            studentId: UUID(),
            studentName: "Lucas Almeida",
            todayClass: todayClass(checkedIn: checkedIn),
            stats: stats(streak: streak)
        )
    }

    static func checkinResult(status: CheckinStatus = .checkedIn, streak: Int? = 7) -> CheckinResult {
        CheckinResult(
            status: status,
            attendance: AttendanceRef(id: UUID(), classSessionId: sessionId, method: .code, checkedInAt: Date()),
            session: CheckinSessionRef(id: sessionId, classId: classId, className: "Open mat", sessionDate: "2026-08-03"),
            stats: stats(streak: streak)
        )
    }

    static func session() -> LiveSession {
        LiveSession(
            id: sessionId,
            classId: classId,
            className: "Open mat",
            sessionDate: "2026-08-03",
            startsAt: Date().addingTimeInterval(600),
            status: .scheduled
        )
    }

    static func liveCode(id: UUID = UUID(), code: String = "4729", presentCount: Int = 0) -> LiveCode {
        LiveCode(
            id: id,
            code: code,
            qrToken: "opaque-token",
            expiresAt: Date().addingTimeInterval(600),
            revokedAt: nil,
            session: session(),
            presentCount: presentCount
        )
    }

    static func attendee(name: String = "Lucas Almeida", method: CheckinMethod = .qr) -> LiveAttendee {
        LiveAttendee(id: UUID(), studentId: UUID(), studentName: name, method: method, checkedInAt: Date())
    }

    static func snapshot(codeId: UUID, attendees: [LiveAttendee]) -> LiveSnapshot {
        LiveSnapshot(
            presentCount: attendees.count,
            codeId: codeId,
            codeExpiresAt: Date().addingTimeInterval(600),
            codeRevokedAt: nil,
            attendances: attendees
        )
    }

    static func rollCallRow(
        name: String = "Lucas Almeida",
        attendance: RollCallAttendance? = nil
    ) -> RollCallRow {
        RollCallRow(studentId: UUID(), fullName: name, attendance: attendance)
    }

    static func student(name: String) -> RosterStudent {
        RosterStudent(studentId: UUID(), fullName: name, birthDate: "2001-02-03", badge: .ativo)
    }
}

/// Spins (yield + tiny sleeps) until the condition holds — bounded so a
/// regression fails the test instead of hanging it.
@MainActor
func waitUntil(_ condition: @MainActor () -> Bool) async {
    for _ in 0..<2000 {
        if condition() { return }
        await Task.yield()
        try? await Task.sleep(for: .milliseconds(1))
    }
}

// MARK: - CheckinModel

@Suite("CheckinModel")
@MainActor
struct CheckinModelTests {
    @Test("code entry gates the submit on exactly 4 digits")
    func codeValidation() async {
        let repository = FakeAttendanceRepository()
        let model = CheckinModel(todayClass: AttendanceFixtures.todayClass(), repository: repository)

        model.codeDigits = "47"
        #expect(!model.canSubmitCode)
        await model.submitCode()
        #expect(repository.checkInCalls.isEmpty)

        model.codeDigits = "47a9"
        #expect(!model.canSubmitCode)

        model.codeDigits = "4729"
        #expect(model.canSubmitCode)
    }

    @Test("code submit posts method=code and lands on the success pop with the streak line")
    func codeSuccess() async {
        let repository = FakeAttendanceRepository()
        repository.checkInResult = .success(AttendanceFixtures.checkinResult(streak: 7))
        var applied: CheckinResult?
        let model = CheckinModel(
            todayClass: AttendanceFixtures.todayClass(),
            repository: repository,
            onResult: { applied = $0 }
        )
        model.method = .code
        model.codeDigits = "4729"

        await model.submitCode()

        #expect(repository.checkInCalls.count == 1)
        #expect(repository.checkInCalls[0].method == .code)
        #expect(repository.checkInCalls[0].code == "4729")
        #expect(repository.checkInCalls[0].classId == nil)
        guard case .success(let outcome) = model.phase else {
            Issue.record("expected success, got \(model.phase)")
            return
        }
        #expect(!outcome.alreadyCheckedIn)
        #expect(outcome.streakLinePTBR == "Essa é a sua 7ª aula seguida. Bom treino!")
        #expect(applied?.status == .checkedIn)
    }

    @Test("streak line hides when the academy disabled gamification (story 16)")
    func streakHidden() async {
        let repository = FakeAttendanceRepository()
        repository.checkInResult = .success(AttendanceFixtures.checkinResult(streak: nil))
        let model = CheckinModel(todayClass: AttendanceFixtures.todayClass(), repository: repository)
        model.codeDigits = "4729"

        await model.submitCode()

        guard case .success(let outcome) = model.phase else {
            Issue.record("expected success, got \(model.phase)")
            return
        }
        #expect(outcome.streakLinePTBR == nil)
    }

    @Test("a duplicate lands on the distinct already-registered state (story 9)")
    func duplicateState() async {
        let repository = FakeAttendanceRepository()
        repository.checkInResult = .success(
            AttendanceFixtures.checkinResult(status: .alreadyCheckedIn)
        )
        let model = CheckinModel(todayClass: AttendanceFixtures.todayClass(), repository: repository)

        await model.submitManual()

        guard case .success(let outcome) = model.phase else {
            Issue.record("expected success, got \(model.phase)")
            return
        }
        #expect(outcome.alreadyCheckedIn)
    }

    @Test("manual submit carries the hero's class id (location step is a stub)")
    func manualSubmit() async {
        let repository = FakeAttendanceRepository()
        repository.checkInResult = .success(AttendanceFixtures.checkinResult())
        let model = CheckinModel(todayClass: AttendanceFixtures.todayClass(), repository: repository)

        await model.submitManual()

        #expect(repository.checkInCalls[0].method == .manual)
        #expect(repository.checkInCalls[0].classId == AttendanceFixtures.classId)
        #expect(repository.checkInCalls[0].qrToken == nil)
    }

    @Test("a scanned token posts method=qr; repeat scans are ignored off-entry")
    func scanOnce() async {
        let repository = FakeAttendanceRepository()
        repository.checkInResult = .success(AttendanceFixtures.checkinResult())
        let model = CheckinModel(todayClass: AttendanceFixtures.todayClass(), repository: repository)

        await model.handleScannedToken("opaque-token")
        await model.handleScannedToken("opaque-token")

        #expect(repository.checkInCalls.count == 1)
        #expect(repository.checkInCalls[0].method == .qr)
        #expect(repository.checkInCalls[0].qrToken == "opaque-token")
    }

    @Test("a wrong or expired code maps to the PT-BR copy and reset re-arms the form (story 7)")
    func invalidCode() async {
        let repository = FakeAttendanceRepository()
        repository.checkInResult = .failure(.notFound(code: ApiErrorCode.checkinCodeInvalid))
        let model = CheckinModel(todayClass: AttendanceFixtures.todayClass(), repository: repository)
        model.codeDigits = "0000"

        await model.submitCode()

        #expect(model.phase == .failed(message: AttendanceMessages.codeInvalid))
        model.reset()
        #expect(model.phase == .entry)
    }

    @Test("outside-window and not-enrolled map to their PT-BR copy (stories 6, 11)")
    func windowAndEnrollmentErrors() async {
        let repository = FakeAttendanceRepository()
        let model = CheckinModel(todayClass: AttendanceFixtures.todayClass(), repository: repository)

        repository.checkInResult = .failure(.conflict(code: ApiErrorCode.checkinOutsideWindow))
        await model.submitManual()
        #expect(model.phase == .failed(message: AttendanceMessages.outsideWindow))

        model.reset()
        repository.checkInResult = .failure(.forbidden(code: ApiErrorCode.checkinNotEnrolled))
        await model.submitManual()
        #expect(model.phase == .failed(message: AttendanceMessages.notEnrolled))
    }
}

// MARK: - AlunoHomeModel

@Suite("AlunoHomeModel")
@MainActor
struct AlunoHomeModelTests {
    @Test("load surfaces the hero and the stat tiles")
    func loadHome() async {
        let repository = FakeAttendanceRepository()
        repository.homeResult = .success(AttendanceFixtures.home())
        let model = AlunoHomeModel(repository: repository)

        await model.load()

        #expect(model.home?.todayClass?.className == "Open mat")
        #expect(model.home?.stats.streak == 7)
    }

    @Test("load failure maps to PT-BR copy")
    func loadFailure() async {
        let repository = FakeAttendanceRepository()
        repository.homeResult = .failure(.network(.notConnectedToInternet))
        let model = AlunoHomeModel(repository: repository)

        await model.load()

        #expect(model.phase == .failed(message: AttendanceMessages.offline))
    }

    @Test("applyCheckin flips the hero and updates the tiles in place (stories 10, 15)")
    func applyCheckin() async {
        let repository = FakeAttendanceRepository()
        repository.homeResult = .success(AttendanceFixtures.home(checkedIn: false, streak: 6))
        let model = AlunoHomeModel(repository: repository)
        await model.load()

        model.applyCheckin(AttendanceFixtures.checkinResult(streak: 7))

        #expect(model.home?.todayClass?.checkedIn == true)
        #expect(model.home?.stats.streak == 7)
        #expect(model.home?.stats.totalLessons == 26)
    }
}

// MARK: - LiveChamadaModel

@Suite("LiveChamadaModel")
@MainActor
struct LiveChamadaModelTests {
    @Test("start opens the chamada, applies the snapshot, then streams events")
    func snapshotThenStream() async {
        let repository = FakeAttendanceRepository()
        let code = AttendanceFixtures.liveCode(presentCount: 1)
        let existing = AttendanceFixtures.attendee(name: "Lucas Almeida")
        repository.openLiveCodeResults = [.success(code)]
        repository.snapshotResult = .success(
            AttendanceFixtures.snapshot(codeId: code.id, attendees: [existing])
        )
        let model = LiveChamadaModel(
            classId: AttendanceFixtures.classId,
            repository: repository,
            pollInterval: .milliseconds(5)
        )

        await model.start()
        #expect(model.liveCode?.code == "4729")

        await waitUntil { model.connection == .streaming && model.presentCount == 1 }
        #expect(model.attendees.map(\.studentName) == ["Lucas Almeida"])
        #expect(repository.ticketCalls == 1)

        // A checkin event appends and bumps the counter…
        let arriving = AttendanceFixtures.attendee(name: "João Ferraz", method: .code)
        repository.yield(.checkin(arriving, presentCount: 2))
        await waitUntil { model.presentCount == 2 }
        #expect(model.attendees.map(\.studentName) == ["Lucas Almeida", "João Ferraz"])

        // …and a revoke removes and decrements (story: voids decrement).
        repository.yield(.revoke(attendanceId: arriving.id, presentCount: 1))
        await waitUntil { model.presentCount == 1 }
        #expect(model.attendees.map(\.studentName) == ["Lucas Almeida"])

        model.stop()
    }

    @Test("a clean stream end (ticket window) reconnects with a fresh ticket")
    func reconnectAfterCleanEnd() async {
        let repository = FakeAttendanceRepository()
        let code = AttendanceFixtures.liveCode()
        repository.openLiveCodeResults = [.success(code)]
        repository.snapshotResult = .success(AttendanceFixtures.snapshot(codeId: code.id, attendees: []))
        // First connection delivers one event and ends cleanly; the second
        // stays open.
        let event = AttendanceFixtures.attendee(name: "Lucas Almeida")
        repository.streamScripts = [
            .events([.checkin(event, presentCount: 1)], error: nil),
            .stayOpen,
        ]
        let model = LiveChamadaModel(
            classId: AttendanceFixtures.classId,
            repository: repository,
            pollInterval: .milliseconds(5)
        )

        await model.start()

        await waitUntil { repository.streamConnections == 2 && model.connection == .streaming }
        #expect(repository.ticketCalls == 2)
        // Snapshot-then-stream on every (re)connect: the fresh snapshot is
        // the truth, replacing the evented state (issue 09 — no replay).
        #expect(repository.snapshotCalls == 2)
        #expect(model.presentCount == 0)
        #expect(model.connection == .streaming)

        model.stop()
    }

    @Test("two consecutive drops fall back to 5 s polling (story 22)")
    func pollingFallback() async {
        let repository = FakeAttendanceRepository()
        let code = AttendanceFixtures.liveCode()
        repository.openLiveCodeResults = [.success(code)]
        repository.snapshotResult = .success(AttendanceFixtures.snapshot(codeId: code.id, attendees: []))
        repository.streamScripts = [
            .events([], error: .network(.networkConnectionLost)),
            .events([], error: .network(.networkConnectionLost)),
        ]
        let model = LiveChamadaModel(
            classId: AttendanceFixtures.classId,
            repository: repository,
            pollInterval: .milliseconds(5)
        )

        await model.start()

        await waitUntil { model.connection == .polling }
        #expect(repository.streamConnections == 2)

        // The poll target keeps the counter honest while the stream is down.
        let attendee = AttendanceFixtures.attendee(name: "Tiago Mota")
        repository.snapshotResult = .success(
            AttendanceFixtures.snapshot(codeId: code.id, attendees: [attendee])
        )
        await waitUntil { model.presentCount == 1 }
        #expect(model.attendees.map(\.studentName) == ["Tiago Mota"])

        model.stop()
    }

    @Test("encerrar invalidates the code; reopen mints a fresh one (stories 23-24)")
    func encerrarAndReopen() async {
        let repository = FakeAttendanceRepository()
        let first = AttendanceFixtures.liveCode(code: "4729")
        let second = AttendanceFixtures.liveCode(code: "8153")
        repository.openLiveCodeResults = [.success(first), .success(second)]
        repository.snapshotResult = .success(AttendanceFixtures.snapshot(codeId: first.id, attendees: []))
        repository.closeLiveCodeResult = .success(
            LiveCode(
                id: first.id,
                code: first.code,
                qrToken: first.qrToken,
                expiresAt: first.expiresAt,
                revokedAt: Date(),
                session: first.session,
                presentCount: 5
            )
        )
        let model = LiveChamadaModel(
            classId: AttendanceFixtures.classId,
            repository: repository,
            pollInterval: .milliseconds(5)
        )
        await model.start()
        await waitUntil { model.connection == .streaming }

        await model.encerrar()

        guard case .closed(let closed) = model.phase else {
            Issue.record("expected closed, got \(model.phase)")
            return
        }
        #expect(closed.revokedAt != nil)
        #expect(model.presentCount == 5)
        #expect(model.connection == .idle)

        await model.reopen()

        #expect(model.liveCode?.code == "8153")
        #expect(model.isOpen)
        #expect(repository.openLiveCodeCalls == 2)

        model.stop()
    }

    @Test("a foreign class surfaces the ownership 404 (story 26)")
    func foreignClass() async {
        let repository = FakeAttendanceRepository()
        repository.openLiveCodeResults = [.failure(.notFound(code: ApiErrorCode.notFound))]
        let model = LiveChamadaModel(classId: UUID(), repository: repository)

        await model.start()

        #expect(model.phase == .failed(message: AttendanceMessages.classNotFound))
    }
}

// MARK: - RollCallModel

@Suite("RollCallModel")
@MainActor
struct RollCallModelTests {
    private func loadedModel(
        rows: [RollCallRow],
        presentCount: Int,
        repository: FakeAttendanceRepository
    ) async -> RollCallModel {
        repository.rollCallResult = .success(
            RollCall(session: AttendanceFixtures.session(), presentCount: presentCount, roster: rows)
        )
        let model = RollCallModel(
            classId: AttendanceFixtures.classId,
            repository: repository,
            professorUserId: UUID()
        )
        await model.load()
        return model
    }

    @Test("load pre-toggles self check-ins and renders the presentes header (stories 30-31)")
    func loadPreToggled() async {
        let repository = FakeAttendanceRepository()
        let selfCheckin = AttendanceFixtures.rollCallRow(
            name: "Lucas Almeida",
            attendance: RollCallAttendance(id: UUID(), method: .qr, checkedInAt: Date(), recordedByUserId: nil)
        )
        let absent = AttendanceFixtures.rollCallRow(name: "Tiago Mota")
        let model = await loadedModel(rows: [selfCheckin, absent], presentCount: 1, repository: repository)

        #expect(model.phase == .loaded)
        #expect(model.rows[0].present)
        #expect(model.rows[0].attendance?.method == .qr)
        #expect(!model.rows[1].present)
        #expect(model.headerCountPTBR == "1 presente de 2")
    }

    @Test("toggle on records a manual presence and updates the count (story 28)")
    func toggleOn() async {
        let repository = FakeAttendanceRepository()
        let absent = AttendanceFixtures.rollCallRow(name: "Tiago Mota")
        let model = await loadedModel(rows: [absent], presentCount: 0, repository: repository)
        let attendanceId = UUID()
        repository.markResult = .success(
            MarkAttendanceResult(status: .checkedIn, attendanceId: attendanceId, presentCount: 1)
        )

        await model.toggle(model.rows[0])

        #expect(repository.markCalls.count == 1)
        #expect(repository.markCalls[0].sessionId == AttendanceFixtures.sessionId)
        #expect(repository.markCalls[0].studentId == absent.studentId)
        #expect(model.rows[0].present)
        #expect(model.rows[0].attendance?.id == attendanceId)
        #expect(model.rows[0].attendance?.method == .manual)
        #expect(model.presentCount == 1)
        #expect(model.headerCountPTBR == "1 presente de 1")
    }

    @Test("toggle off revokes the presence through the void seam (story 29)")
    func toggleOff() async {
        let repository = FakeAttendanceRepository()
        let attendanceId = UUID()
        let present = AttendanceFixtures.rollCallRow(
            name: "Lucas Almeida",
            attendance: RollCallAttendance(
                id: attendanceId,
                method: .manual,
                checkedInAt: Date(),
                recordedByUserId: UUID()
            )
        )
        let model = await loadedModel(rows: [present], presentCount: 1, repository: repository)
        repository.revokeResult = .success(
            RevokeAttendanceResult(status: .revoked, attendanceId: attendanceId, presentCount: 0)
        )

        await model.toggle(model.rows[0])

        #expect(repository.revokeCalls == [attendanceId])
        #expect(!model.rows[0].present)
        #expect(model.presentCount == 0)
    }

    @Test("a past-day revoke surfaces the window-closed PT-BR copy and keeps the row (story 33)")
    func revokeWindowClosed() async {
        let repository = FakeAttendanceRepository()
        let present = AttendanceFixtures.rollCallRow(
            name: "Lucas Almeida",
            attendance: RollCallAttendance(id: UUID(), method: .qr, checkedInAt: Date(), recordedByUserId: nil)
        )
        let model = await loadedModel(rows: [present], presentCount: 1, repository: repository)
        repository.revokeResult = .failure(.forbidden(code: ApiErrorCode.revokeWindowClosed))

        await model.toggle(model.rows[0])

        #expect(model.actionError == AttendanceMessages.revokeWindowClosed)
        #expect(model.rows[0].present)
        #expect(model.presentCount == 1)
    }

    @Test("a benign duplicate mark keeps both chamada modes on one truth")
    func duplicateMark() async {
        let repository = FakeAttendanceRepository()
        let absent = AttendanceFixtures.rollCallRow(name: "Tiago Mota")
        let model = await loadedModel(rows: [absent], presentCount: 0, repository: repository)
        let attendanceId = UUID()
        repository.markResult = .success(
            MarkAttendanceResult(status: .alreadyCheckedIn, attendanceId: attendanceId, presentCount: 1)
        )

        await model.toggle(model.rows[0])

        #expect(model.rows[0].present)
        #expect(model.presentCount == 1)
        #expect(model.actionError == nil)
    }
}

// MARK: - ProfessorDashboardModel

@Suite("ProfessorDashboardModel")
@MainActor
struct ProfessorDashboardModelTests {
    @Test("load surfaces the live tiles and the next-class hero (stories 34-36)")
    func loadDashboard() async {
        let repository = FakeAttendanceRepository()
        repository.dashboardResult = .success(
            ProfessorDashboard(
                alunosHoje: 23,
                presencaMediaPct: 81,
                nextClass: ProfessorNextClass(
                    classId: AttendanceFixtures.classId,
                    className: "Open mat",
                    slot: AttendanceFixtures.slot,
                    checkedInCount: 16
                ),
                todayClasses: []
            )
        )
        let model = ProfessorDashboardModel(repository: repository)

        await model.load()

        #expect(model.dashboard?.alunosHoje == 23)
        #expect(model.dashboard?.presencaMediaPct == 81)
        #expect(model.dashboard?.nextClass?.checkedInCount == 16)

        model.iniciarChamada()
        #expect(model.chamadaClassId == AttendanceFixtures.classId)
    }

    @Test("no next class keeps the chamada shortcut inert")
    func noNextClass() async {
        let repository = FakeAttendanceRepository()
        repository.dashboardResult = .success(
            ProfessorDashboard(alunosHoje: 0, presencaMediaPct: 0, nextClass: nil, todayClasses: [])
        )
        let model = ProfessorDashboardModel(repository: repository)
        await model.load()

        model.iniciarChamada()

        #expect(model.chamadaClassId == nil)
    }
}
