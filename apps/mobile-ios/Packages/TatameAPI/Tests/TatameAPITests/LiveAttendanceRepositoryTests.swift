import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveAttendanceRepository (generated client → domain mapping)")
struct LiveAttendanceRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!
    private static let classId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000011")!
    private static let sessionId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000012")!
    private static let studentId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000013")!
    private static let attendanceId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000014")!
    private static let liveCodeId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000015")!
    private static let eventId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000016")!
    private static let registrationId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000017")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveAttendanceRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        return (LiveAttendanceRepository(client: client, serverURL: Self.baseURL), transport)
    }

    private func ok(_ json: String) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .ok)
        response.headerFields[.contentType] = "application/json"
        return (response, Data(json.utf8))
    }

    private func problem(status: Int, code: String) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .init(code: status))
        response.headerFields[.contentType] = "application/problem+json"
        return (response, Data("{\"status\":\(status),\"code\":\"\(code)\"}".utf8))
    }

    private var statsJSON: String {
        """
        {"monthPresencePct": 86, "monthAttendedSessions": 12, "monthTotalSessions": 14,
         "streak": 7, "totalLessons": 26}
        """
    }

    private var sessionJSON: String {
        """
        {"id": "\(Self.sessionId.uuidString.lowercased())",
         "classId": "\(Self.classId.uuidString.lowercased())",
         "className": "Open mat", "sessionDate": "2026-08-03",
         "startsAt": "2026-08-03T13:00:00.000Z", "status": "scheduled"}
        """
    }

    private var liveCodeJSON: String {
        """
        {"id": "\(Self.liveCodeId.uuidString.lowercased())",
         "code": "4729", "qrToken": "opaque-token-abc",
         "expiresAt": "2026-08-03T15:15:00.000Z", "revokedAt": null,
         "session": \(sessionJSON), "presentCount": 6}
        """
    }

    // MARK: Aluno

    @Test("alunoHome maps hero, stats, and the NestJS fractional dates")
    func alunoHomeMapping() async throws {
        let json = """
        {"student": {"id": "\(Self.studentId.uuidString.lowercased())", "fullName": "Lucas Almeida"},
         "todayClass": {"classId": "\(Self.classId.uuidString.lowercased())", "className": "Open mat",
                        "slot": {"weekday": 6, "startTime": "10:00", "durationMinutes": 120},
                        "checkedIn": false},
         "stats": \(statsJSON),
         "upcomingEvents": [
            {"id": "\(Self.eventId.uuidString.lowercased())", "name": "Open mat de verão",
             "bannerPreset": "event-purple-pink", "location": "Tatame principal",
             "startsAt": "2026-08-15T13:00:00.000Z", "date": "2026-08-15", "time": "10:00",
             "priceCents": null,
             "registration": {"id": "\(Self.registrationId.uuidString.lowercased())",
                              "status": "confirmed", "chargeId": null}}
         ]}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let home = try await repository.alunoHome()

        #expect(transport.requests[0].0.path == "/v1/aluno/home")
        #expect(home.studentId == Self.studentId)
        #expect(home.studentName == "Lucas Almeida")
        #expect(home.todayClass?.className == "Open mat")
        #expect(home.todayClass?.checkedIn == false)
        #expect(home.todayClass?.slot == ScheduleSlot(weekday: 6, startTime: "10:00", durationMinutes: 120))
        #expect(home.stats.monthPresencePct == 86)
        #expect(home.stats.streak == 7)
        #expect(home.stats.totalLessons == 26)
        // spec 008 — "Próximos eventos" with own registration state.
        #expect(home.upcomingEvents.count == 1)
        #expect(home.upcomingEvents[0].id == Self.eventId)
        #expect(home.upcomingEvents[0].priceCents == nil)
        #expect(home.upcomingEvents[0].isConfirmed)
    }

    @Test("alunoHome maps a day without class and the gamification-off streak")
    func alunoHomeNoClassNoStreak() async throws {
        let json = """
        {"student": {"id": "\(Self.studentId.uuidString.lowercased())", "fullName": "Lucas Almeida"},
         "todayClass": null,
         "stats": {"monthPresencePct": 50, "monthAttendedSessions": 1, "monthTotalSessions": 2,
                   "streak": null, "totalLessons": 3},
         "upcomingEvents": []}
        """
        let (repository, _) = makeRepository([ok(json)])

        let home = try await repository.alunoHome()

        #expect(home.todayClass == nil)
        #expect(home.stats.streak == nil)
        #expect(home.upcomingEvents.isEmpty)
    }

    @Test("checkIn posts the method payload and maps the fresh stats")
    func checkInCode() async throws {
        let json = """
        {"status": "checked_in",
         "attendance": {"id": "\(Self.attendanceId.uuidString.lowercased())",
                        "classSessionId": "\(Self.sessionId.uuidString.lowercased())",
                        "method": "code", "checkedInAt": "2026-08-03T13:05:00.123Z"},
         "session": {"id": "\(Self.sessionId.uuidString.lowercased())",
                     "classId": "\(Self.classId.uuidString.lowercased())",
                     "className": "Open mat", "sessionDate": "2026-08-03"},
         "stats": \(statsJSON)}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let result = try await repository.checkIn(method: .code, qrToken: nil, code: "4729", classId: nil)

        let (request, body) = transport.requests[0]
        #expect(request.method == .post)
        #expect(request.path == "/v1/aluno/checkins")
        let sent = String(decoding: try #require(body), as: UTF8.self)
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
        #expect(sent.contains("\"method\":\"code\""))
        #expect(sent.contains("\"code\":\"4729\""))
        #expect(result.status == .checkedIn)
        #expect(result.attendance.method == .code)
        #expect(result.session.className == "Open mat")
        #expect(result.stats.streak == 7)
    }

    @Test("a duplicate check-in maps to the already-checked-in state, not an error")
    func checkInDuplicate() async throws {
        let json = """
        {"status": "already_checked_in",
         "attendance": {"id": "\(Self.attendanceId.uuidString.lowercased())",
                        "classSessionId": "\(Self.sessionId.uuidString.lowercased())",
                        "method": "manual", "checkedInAt": "2026-08-03T13:05:00.000Z"},
         "session": {"id": "\(Self.sessionId.uuidString.lowercased())",
                     "classId": "\(Self.classId.uuidString.lowercased())",
                     "className": "Open mat", "sessionDate": "2026-08-03"},
         "stats": \(statsJSON)}
        """
        let (repository, _) = makeRepository([ok(json)])

        let result = try await repository.checkIn(
            method: .manual,
            qrToken: nil,
            code: nil,
            classId: Self.classId
        )

        #expect(result.status == .alreadyCheckedIn)
    }

    @Test("the stable check-in error codes survive the mapping")
    func checkInErrorCodes() async throws {
        let (repository, _) = makeRepository([
            problem(status: 404, code: ApiErrorCode.checkinCodeInvalid),
            problem(status: 403, code: ApiErrorCode.checkinNotEnrolled),
            problem(status: 422, code: ApiErrorCode.checkinNoSessionToday),
            problem(status: 422, code: ApiErrorCode.checkinOutsideWindow),
        ])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.checkinCodeInvalid)) {
            _ = try await repository.checkIn(method: .code, qrToken: nil, code: "0000", classId: nil)
        }
        await #expect(throws: ApiError.forbidden(code: ApiErrorCode.checkinNotEnrolled)) {
            _ = try await repository.checkIn(method: .code, qrToken: nil, code: "0000", classId: nil)
        }
        await #expect(throws: ApiError.conflict(code: ApiErrorCode.checkinNoSessionToday)) {
            _ = try await repository.checkIn(method: .manual, qrToken: nil, code: nil, classId: Self.classId)
        }
        await #expect(throws: ApiError.conflict(code: ApiErrorCode.checkinOutsideWindow)) {
            _ = try await repository.checkIn(method: .manual, qrToken: nil, code: nil, classId: Self.classId)
        }
    }

    // MARK: Chamada ao vivo

    @Test("openLiveCode maps code, QR token, expiry, and the session")
    func openLiveCode() async throws {
        let (repository, transport) = makeRepository([ok(liveCodeJSON)])

        let code = try await repository.openLiveCode(classId: Self.classId)

        let request = transport.requests[0].0
        #expect(request.method == .post)
        #expect(request.path == "/v1/professor/classes/\(Self.classId.uuidString.lowercased())/live-codes")
        #expect(code.id == Self.liveCodeId)
        #expect(code.code == "4729")
        #expect(code.qrToken == "opaque-token-abc")
        #expect(code.revokedAt == nil)
        #expect(code.session.className == "Open mat")
        #expect(code.session.startsAt != nil)
        #expect(code.presentCount == 6)
        #expect(code.isActive(at: Date(timeIntervalSince1970: 1_785_400_000)))
    }

    @Test("closeLiveCode maps the revoked code (foreign id stays a 404)")
    func closeLiveCode() async throws {
        let closed = liveCodeJSON.replacingOccurrences(
            of: "\"revokedAt\": null",
            with: "\"revokedAt\": \"2026-08-03T14:00:00.000Z\""
        )
        let (repository, transport) = makeRepository([
            ok(closed),
            problem(status: 404, code: ApiErrorCode.notFound),
        ])

        let code = try await repository.closeLiveCode(id: Self.liveCodeId)
        #expect(transport.requests[0].0.path == "/v1/professor/live-codes/\(Self.liveCodeId.uuidString.lowercased())/close")
        #expect(code.revokedAt != nil)
        #expect(!code.isActive())

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.closeLiveCode(id: UUID())
        }
    }

    @Test("liveSnapshot maps active rows and the code window")
    func liveSnapshot() async throws {
        let json = """
        {"presentCount": 2,
         "code": {"id": "\(Self.liveCodeId.uuidString.lowercased())",
                  "expiresAt": "2026-08-03T15:15:00.000Z", "revokedAt": null},
         "attendances": [
            {"id": "\(Self.attendanceId.uuidString.lowercased())",
             "studentId": "\(Self.studentId.uuidString.lowercased())",
             "studentName": "Lucas Almeida", "method": "qr",
             "checkedInAt": "2026-08-03T13:05:00.000Z"},
            {"id": "\(UUID().uuidString.lowercased())",
             "studentId": "\(UUID().uuidString.lowercased())",
             "studentName": "Tiago Mota", "method": "manual",
             "checkedInAt": "2026-08-03T13:06:00.000Z"}
         ]}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let snapshot = try await repository.liveSnapshot(liveCodeId: Self.liveCodeId)

        #expect(
            transport.requests[0].0.path
                == "/v1/professor/live-codes/\(Self.liveCodeId.uuidString.lowercased())/attendances"
        )
        #expect(snapshot.presentCount == 2)
        #expect(snapshot.codeId == Self.liveCodeId)
        #expect(snapshot.attendances.count == 2)
        #expect(snapshot.attendances[0].studentName == "Lucas Almeida")
        #expect(snapshot.attendances[0].method == .qr)
        #expect(snapshot.attendances[1].method == .manual)
    }

    @Test("mintStreamTicket maps the short-lived ticket and the stream URL carries it in query")
    func mintTicketAndStreamURL() async throws {
        let (repository, transport) = makeRepository([
            ok("{\"ticket\": \"signed.ticket\", \"expiresInSeconds\": 60}")
        ])

        let ticket = try await repository.mintStreamTicket(liveCodeId: Self.liveCodeId)

        #expect(
            transport.requests[0].0.path
                == "/v1/professor/live-codes/\(Self.liveCodeId.uuidString.lowercased())/stream-ticket"
        )
        #expect(ticket == StreamTicket(ticket: "signed.ticket", expiresInSeconds: 60))

        let url = repository.streamURL(liveCodeId: Self.liveCodeId, ticket: ticket.ticket)
        #expect(
            url.absoluteString
                == "http://localhost:3000/v1/professor/live-codes/\(Self.liveCodeId.uuidString.lowercased())/stream?ticket=signed.ticket"
        )
    }

    // MARK: Chamada manual

    @Test("openRollCall maps the roster with self check-ins pre-toggled and manual markers")
    func openRollCall() async throws {
        let selfCheckinId = UUID()
        let professorId = UUID()
        let json = """
        {"session": \(sessionJSON), "presentCount": 2,
         "roster": [
            {"studentId": "\(Self.studentId.uuidString.lowercased())", "fullName": "Lucas Almeida",
             "attendance": {"id": "\(selfCheckinId.uuidString.lowercased())", "method": "qr",
                            "checkedInAt": "2026-08-03T13:05:00.000Z", "recordedByUserId": null}},
            {"studentId": "\(UUID().uuidString.lowercased())", "fullName": "João Ferraz",
             "attendance": {"id": "\(Self.attendanceId.uuidString.lowercased())", "method": "manual",
                            "checkedInAt": "2026-08-03T13:06:00.000Z",
                            "recordedByUserId": "\(professorId.uuidString.lowercased())"}},
            {"studentId": "\(UUID().uuidString.lowercased())", "fullName": "Tiago Mota",
             "attendance": null}
         ]}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let rollCall = try await repository.openRollCall(classId: Self.classId)

        #expect(
            transport.requests[0].0.path
                == "/v1/professor/classes/\(Self.classId.uuidString.lowercased())/roll-call"
        )
        #expect(rollCall.session.id == Self.sessionId)
        #expect(rollCall.presentCount == 2)
        #expect(rollCall.roster.count == 3)
        // Self check-in: pre-toggled, no recorded-by.
        #expect(rollCall.roster[0].present)
        #expect(rollCall.roster[0].attendance?.method == .qr)
        #expect(rollCall.roster[0].attendance?.recordedByUserId == nil)
        // Professor-recorded manual row.
        #expect(rollCall.roster[1].attendance?.method == .manual)
        #expect(rollCall.roster[1].attendance?.recordedByUserId == professorId)
        // Absent.
        #expect(!rollCall.roster[2].present)
    }

    @Test("markAttendance posts the student and maps the result")
    func markAttendance() async throws {
        let json = """
        {"status": "checked_in",
         "attendance": {"id": "\(Self.attendanceId.uuidString.lowercased())",
                        "classSessionId": "\(Self.sessionId.uuidString.lowercased())",
                        "studentId": "\(Self.studentId.uuidString.lowercased())",
                        "checkedInAt": "2026-08-03T13:07:00.000Z"},
         "presentCount": 3}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let result = try await repository.markAttendance(sessionId: Self.sessionId, studentId: Self.studentId)

        let (request, body) = transport.requests[0]
        #expect(request.path == "/v1/professor/sessions/\(Self.sessionId.uuidString.lowercased())/attendances")
        let sent = String(decoding: try #require(body), as: UTF8.self)
        #expect(sent.contains(Self.studentId.uuidString.lowercased()))
        #expect(result == MarkAttendanceResult(status: .checkedIn, attendanceId: Self.attendanceId, presentCount: 3))
    }

    @Test("revokeAttendance maps the result and the closed-window 403")
    func revokeAttendance() async throws {
        let json = """
        {"status": "revoked",
         "attendanceId": "\(Self.attendanceId.uuidString.lowercased())",
         "presentCount": 2}
        """
        let (repository, transport) = makeRepository([
            ok(json),
            problem(status: 403, code: ApiErrorCode.revokeWindowClosed),
        ])

        let result = try await repository.revokeAttendance(id: Self.attendanceId)
        #expect(
            transport.requests[0].0.path
                == "/v1/professor/attendances/\(Self.attendanceId.uuidString.lowercased())/revoke"
        )
        #expect(result == RevokeAttendanceResult(status: .revoked, attendanceId: Self.attendanceId, presentCount: 2))

        await #expect(throws: ApiError.forbidden(code: ApiErrorCode.revokeWindowClosed)) {
            _ = try await repository.revokeAttendance(id: Self.attendanceId)
        }
    }

    // MARK: Dashboard & students

    @Test("dashboard maps tiles, nullable hero, and today's classes")
    func dashboardMapping() async throws {
        let json = """
        {"alunosHoje": 23, "presencaMediaPct": 81,
         "nextClass": {"classId": "\(Self.classId.uuidString.lowercased())", "className": "Open mat",
                       "slot": {"weekday": 6, "startTime": "10:00", "durationMinutes": 120},
                       "checkedInCount": 16},
         "todayClasses": [
            {"classId": "\(Self.classId.uuidString.lowercased())", "className": "Open mat",
             "slot": {"weekday": 6, "startTime": "10:00", "durationMinutes": 120},
             "checkedInCount": 16, "enrolledCount": 34}
         ],
         "upcomingEventsCount": 2,
         "upcomingEvents": [
            {"id": "\(Self.eventId.uuidString.lowercased())", "name": "Festival Kids",
             "bannerPreset": "event-purple-pink", "location": "Ginásio Municipal",
             "startsAt": "2026-09-15T12:30:00.000Z", "date": "2026-09-15", "time": "09:30",
             "priceCents": 6000, "confirmedCount": 12}
         ]}
        """
        let (repository, transport) = makeRepository([
            ok(json),
            ok(
                "{\"alunosHoje\": 0, \"presencaMediaPct\": 0, \"nextClass\": null, \"todayClasses\": [], \"upcomingEventsCount\": 0, \"upcomingEvents\": []}"
            ),
        ])

        let dashboard = try await repository.dashboard()
        #expect(transport.requests[0].0.path == "/v1/professor/dashboard")
        #expect(dashboard.alunosHoje == 23)
        #expect(dashboard.presencaMediaPct == 81)
        #expect(dashboard.nextClass?.className == "Open mat")
        #expect(dashboard.nextClass?.checkedInCount == 16)
        #expect(dashboard.todayClasses.count == 1)
        #expect(dashboard.todayClasses[0].enrolledCount == 34)
        // spec 008 story 22 — the "eventos futuros" tile + list turn real.
        #expect(dashboard.upcomingEventsCount == 2)
        #expect(dashboard.upcomingEvents.count == 1)
        #expect(dashboard.upcomingEvents[0].name == "Festival Kids")
        #expect(dashboard.upcomingEvents[0].priceCents == 6000)
        #expect(dashboard.upcomingEvents[0].confirmedCount == 12)

        let empty = try await repository.dashboard()
        #expect(empty.nextClass == nil)
        #expect(empty.upcomingEvents.isEmpty)
    }

    @Test("students sends the not-enrolled filter and maps picker rows")
    func studentsFilter() async throws {
        let json = """
        {"students": [
            {"id": "\(Self.studentId.uuidString.lowercased())", "fullName": "Marina Costa",
             "birthDate": "2001-02-03", "badge": "ativo"},
            {"id": "\(UUID().uuidString.lowercased())", "fullName": "Pedro Silveira",
             "birthDate": "2017-06-10", "badge": "pendente"}
         ]}
        """
        let (repository, transport) = makeRepository([ok(json), ok("{\"students\": []}")])

        let students = try await repository.students(notEnrolledInClassId: Self.classId)

        let path = try #require(transport.requests[0].0.path)
        #expect(path.hasPrefix("/v1/professor/students"))
        #expect(path.contains("notEnrolledInClassId=\(Self.classId.uuidString.lowercased())"))
        #expect(students.count == 2)
        #expect(students[0].studentId == Self.studentId)
        #expect(students[0].badge == .ativo)
        #expect(students[1].badge == .pendente)

        _ = try await repository.students(notEnrolledInClassId: nil)
        let unfiltered = try #require(transport.requests[1].0.path)
        #expect(!unfiltered.contains("notEnrolledInClassId"))
    }
}
