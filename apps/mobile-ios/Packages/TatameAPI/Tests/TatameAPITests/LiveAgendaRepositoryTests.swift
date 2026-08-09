import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveAgendaRepository (generated client → domain mapping)")
struct LiveAgendaRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!
    private static let classId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000031")!
    private static let kidsClassId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000032")!
    private static let beltId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000033")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveAgendaRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        return (LiveAgendaRepository(client: client), transport)
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

    private var beltJSON: String {
        """
        {"beltId": "\(Self.beltId.uuidString.lowercased())", "name": "Azul",
         "colorSlug": "belt.blue", "tipColorSlug": null, "maxDegrees": 4}
        """
    }

    private var calendarItemJSON: String {
        """
        {"classId": "\(Self.classId.uuidString.lowercased())", "className": "Fundamentos",
         "startTime": "19:00", "endTime": "20:00", "professorName": "Rafael Nunes",
         "occupancy": {"active": 18, "capacity": 24}}
        """
    }

    // MARK: Aluno agenda

    @Test("alunoAgenda sends the weekday query and maps items, belts and checkedIn")
    func agendaMapping() async throws {
        let json = """
        {"weekday": 6, "isToday": true,
         "classes": [
            {"classId": "\(Self.classId.uuidString.lowercased())", "className": "Open mat",
             "startTime": "10:00", "endTime": "12:00", "professorName": "Toda a equipe",
             "ageMin": null, "ageMax": null, "minBelt": null, "maxBelt": null,
             "occupancy": {"active": 21, "capacity": 40}, "checkedIn": true},
            {"classId": "\(Self.kidsClassId.uuidString.lowercased())", "className": "Kids",
             "startTime": "18:00", "endTime": "18:45", "professorName": "Ana Beltrão",
             "ageMin": 4, "ageMax": 12, "minBelt": \(beltJSON), "maxBelt": \(beltJSON),
             "occupancy": {"active": 14, "capacity": 16}, "checkedIn": false}
         ],
         "events": []}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let agenda = try await repository.alunoAgenda(weekday: 6)

        let path = try #require(transport.requests[0].0.path)
        #expect(path.hasPrefix("/v1/aluno/agenda"))
        #expect(path.contains("weekday=6"))
        #expect(agenda.weekday == 6)
        #expect(agenda.isToday)
        #expect(agenda.classes.count == 2)
        #expect(agenda.classes[0].className == "Open mat")
        #expect(agenda.classes[0].checkedIn)
        #expect(agenda.classes[0].minBelt == nil)
        #expect(agenda.classes[0].occupancy == AgendaOccupancy(active: 21, capacity: 40))
        #expect(agenda.classes[1].ageMin == 4)
        #expect(agenda.classes[1].minBelt?.name == "Azul")
        #expect(agenda.classes[1].minBelt?.colorSlug == "belt.blue")
        #expect(!agenda.classes[1].checkedIn)
        #expect(agenda.events.isEmpty)
    }

    @Test("alunoAgenda omits the weekday query for the server-side today default")
    func agendaDefaultWeekday() async throws {
        let (repository, transport) = makeRepository([
            ok("{\"weekday\": 3, \"isToday\": true, \"classes\": [], \"events\": []}")
        ])

        let agenda = try await repository.alunoAgenda(weekday: nil)

        let path = try #require(transport.requests[0].0.path)
        #expect(!path.contains("weekday"))
        #expect(agenda.weekday == 3)
        #expect(agenda.classes.isEmpty)
    }

    // MARK: Calendars

    private var bucketsJSON: String {
        """
        {"0": [], "1": [\(calendarItemJSON)], "2": [], "3": [\(calendarItemJSON)],
         "4": [], "5": [], "6": [\(calendarItemJSON), \(calendarItemJSON)]}
        """
    }

    @Test("alunoCalendar sends the month and maps the weekday buckets")
    func alunoCalendarMapping() async throws {
        let json = "{\"month\": \"2026-08\", \"classesByWeekday\": \(bucketsJSON), \"events\": []}"
        let (repository, transport) = makeRepository([ok(json)])

        let calendar = try await repository.alunoCalendar(month: "2026-08")

        let path = try #require(transport.requests[0].0.path)
        #expect(path.hasPrefix("/v1/aluno/calendar"))
        #expect(path.contains("month=2026-08"))
        #expect(calendar.month == "2026-08")
        #expect(calendar.weekdaysWithClasses == [1, 3, 6])
        #expect(calendar.classesByWeekday[6]?.count == 2)
        #expect(calendar.classesByWeekday[1]?[0].className == "Fundamentos")
        #expect(calendar.classesByWeekday[1]?[0].occupancy == AgendaOccupancy(active: 18, capacity: 24))
        #expect(calendar.events.isEmpty)
    }

    @Test("professorCalendar hits the professor route with the same shared shape")
    func professorCalendarMapping() async throws {
        let json = "{\"month\": \"2026-08\", \"classesByWeekday\": \(bucketsJSON), \"events\": []}"
        let (repository, transport) = makeRepository([ok(json), ok(json)])

        let calendar = try await repository.professorCalendar(month: "2026-08")
        let path = try #require(transport.requests[0].0.path)
        #expect(path.hasPrefix("/v1/professor/calendar"))
        #expect(path.contains("month=2026-08"))
        #expect(calendar.weekdaysWithClasses == [1, 3, 6])

        // Omitted month = current tenant-local month (server-side default).
        _ = try await repository.professorCalendar(month: nil)
        let unqualified = try #require(transport.requests[1].0.path)
        #expect(!unqualified.contains("month"))
    }

    @Test("problem+json errors survive the mapping (invalid month, RBAC 403)")
    func errorMapping() async throws {
        let (repository, _) = makeRepository([
            problem(status: 400, code: ApiErrorCode.validationFailed),
            problem(status: 403, code: ApiErrorCode.forbiddenRole),
        ])

        await #expect(throws: ApiError.validation(fields: [])) {
            _ = try await repository.alunoCalendar(month: "not-a-month")
        }
        await #expect(throws: ApiError.forbidden(code: ApiErrorCode.forbiddenRole)) {
            _ = try await repository.professorCalendar(month: nil)
        }
    }
}
