import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

/// ClientTransport mock: records requests and serves canned responses in
/// order (repository-level twin of the middleware NextSpy).
final class TransportMock: ClientTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var responses: [(HTTPResponse, Data?)]
    private var _requests: [(HTTPRequest, Data?)] = []

    init(responses: [(HTTPResponse, Data?)]) {
        self.responses = responses
    }

    var requests: [(HTTPRequest, Data?)] {
        lock.withLock { _requests }
    }

    func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL _: URL,
        operationID _: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var bodyData: Data?
        if let body {
            bodyData = try await Data(collecting: body, upTo: 1024 * 1024)
        }
        let response: (HTTPResponse, Data?) = lock.withLock {
            _requests.append((request, bodyData))
            return responses.removeFirst()
        }
        return (response.0, response.1.map { HTTPBody($0) })
    }
}

@Suite("LiveEnrollmentRepository (generated client → domain mapping)")
struct LiveEnrollmentRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!
    private static let classId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000001")!
    private static let studentId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000002")!
    private static let professorId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000003")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveEnrollmentRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(serverURL: Self.baseURL, transport: transport)
        return (LiveEnrollmentRepository(client: client), transport)
    }

    private func ok(_ json: String, status: HTTPResponse.Status = .ok) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, Data(json.utf8))
    }

    private func problem(status: Int, code: String) -> (HTTPResponse, Data?) {
        var response = HTTPResponse(status: .init(code: status))
        response.headerFields[.contentType] = "application/problem+json"
        return (response, Data("{\"status\":\(status),\"code\":\"\(code)\"}".utf8))
    }

    private var classJSON: String {
        """
        {
          "id": "\(Self.classId.uuidString.lowercased())",
          "name": "Kids",
          "status": "active",
          "capacity": 16,
          "occupancy": 14,
          "lotada": false,
          "ageMin": 4,
          "ageMax": 12,
          "professor": {"userId": "\(Self.professorId.uuidString.lowercased())", "fullName": "Carlos Souza"},
          "schedules": [
            {"weekday": 2, "startTime": "18:00", "durationMinutes": 45},
            {"weekday": 4, "startTime": "18:00", "durationMinutes": 45}
          ]
        }
        """
    }

    @Test("professorClasses maps schedules, age range, occupancy, and lotada")
    func listMapping() async throws {
        let full = classJSON
            .replacingOccurrences(of: "\"occupancy\": 14", with: "\"occupancy\": 16")
            .replacingOccurrences(of: "\"lotada\": false", with: "\"lotada\": true")
        let (repository, transport) = makeRepository([
            ok("{\"classes\": [\(classJSON), \(full)]}")
        ])

        let classes = try await repository.professorClasses()

        #expect(transport.requests.count == 1)
        #expect(transport.requests[0].0.path == "/v1/professor/classes")
        #expect(classes.count == 2)
        let kids = classes[0]
        #expect(kids.id == Self.classId)
        #expect(kids.name == "Kids")
        #expect(kids.status == .active)
        #expect(kids.capacity == 16)
        #expect(kids.occupancy == 14)
        #expect(!kids.lotada)
        #expect(kids.ageMin == 4)
        #expect(kids.ageMax == 12)
        #expect(kids.professor == ClassProfessor(userId: Self.professorId, fullName: "Carlos Souza"))
        #expect(kids.schedules == [
            ScheduleSlot(weekday: 2, startTime: "18:00", durationMinutes: 45),
            ScheduleSlot(weekday: 4, startTime: "18:00", durationMinutes: 45),
        ])
        #expect(classes[1].lotada)
    }

    @Test("professorClassDetail maps the roster with badges")
    func detailMapping() async throws {
        let json = """
        {"class": {
          "id": "\(Self.classId.uuidString.lowercased())",
          "name": "Fundamentos",
          "status": "active",
          "capacity": 24,
          "occupancy": 24,
          "lotada": true,
          "ageMin": null,
          "ageMax": null,
          "professor": {"userId": "\(Self.professorId.uuidString.lowercased())", "fullName": "Carlos Souza"},
          "schedules": [{"weekday": 1, "startTime": "19:00", "durationMinutes": 60}],
          "roster": [
            {"studentId": "\(Self.studentId.uuidString.lowercased())", "fullName": "Lucas Almeida", "birthDate": "2001-02-03", "badge": "ativo"},
            {"studentId": "\(UUID().uuidString.lowercased())", "fullName": "Tiago Mota", "birthDate": "2003-04-05", "badge": "pendente"}
          ]
        }}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let detail = try await repository.professorClassDetail(classId: Self.classId)

        #expect(transport.requests[0].0.path == "/v1/professor/classes/\(Self.classId.uuidString.lowercased())")
        #expect(detail.summary.name == "Fundamentos")
        #expect(detail.summary.lotada)
        #expect(detail.summary.ageMin == nil)
        #expect(detail.roster.count == 2)
        #expect(detail.roster[0].badge == .ativo)
        #expect(detail.roster[1].badge == .pendente)
    }

    @Test("professorClassDetail surfaces the ownership 404 (foreign class)")
    func detailForeignClass() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.professorClassDetail(classId: Self.classId)
        }
    }

    @Test("addStudent posts the student id and maps the 201 result")
    func addStudent() async throws {
        let json = """
        {"enrollment": {
          "classId": "\(Self.classId.uuidString.lowercased())",
          "studentId": "\(Self.studentId.uuidString.lowercased())",
          "status": "active"
        }}
        """
        let (repository, transport) = makeRepository([ok(json, status: .created)])

        let result = try await repository.addStudent(classId: Self.classId, studentId: Self.studentId)

        let (request, body) = transport.requests[0]
        #expect(request.method == .post)
        #expect(request.path == "/v1/professor/classes/\(Self.classId.uuidString.lowercased())/students")
        let sent = try #require(body)
        #expect(String(decoding: sent, as: UTF8.self).contains(Self.studentId.uuidString.lowercased()))
        #expect(result == EnrollmentResult(classId: Self.classId, studentId: Self.studentId, status: .active))
    }

    @Test("addStudent maps the stable capacity and duplicate conflict codes")
    func addStudentConflicts() async throws {
        let (repository, _) = makeRepository([
            problem(status: 409, code: ApiErrorCode.classFull),
            problem(status: 409, code: ApiErrorCode.alreadyEnrolled),
            problem(status: 409, code: ApiErrorCode.classArchived),
        ])

        await #expect(throws: ApiError.conflict(code: ApiErrorCode.classFull)) {
            _ = try await repository.addStudent(classId: Self.classId, studentId: Self.studentId)
        }
        await #expect(throws: ApiError.conflict(code: ApiErrorCode.alreadyEnrolled)) {
            _ = try await repository.addStudent(classId: Self.classId, studentId: Self.studentId)
        }
        await #expect(throws: ApiError.conflict(code: ApiErrorCode.classArchived)) {
            _ = try await repository.addStudent(classId: Self.classId, studentId: Self.studentId)
        }
    }

    @Test("removeStudent deletes and maps the removed result")
    func removeStudent() async throws {
        let json = """
        {"enrollment": {
          "classId": "\(Self.classId.uuidString.lowercased())",
          "studentId": "\(Self.studentId.uuidString.lowercased())",
          "status": "removed"
        }}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let result = try await repository.removeStudent(classId: Self.classId, studentId: Self.studentId)

        let request = transport.requests[0].0
        #expect(request.method == .delete)
        #expect(
            request.path
                == "/v1/professor/classes/\(Self.classId.uuidString.lowercased())/students/\(Self.studentId.uuidString.lowercased())"
        )
        #expect(result.status == .removed)
    }

    @Test("dependents maps class, schedules, and nullable nextSlot")
    func dependentsMapping() async throws {
        let dependentId = UUID()
        let json = """
        {"dependents": [
          {
            "id": "\(dependentId.uuidString.lowercased())",
            "fullName": "Pedro Silveira",
            "birthDate": "2017-06-10",
            "status": "active",
            "class": {
              "id": "\(Self.classId.uuidString.lowercased())",
              "name": "Kids",
              "schedules": [{"weekday": 2, "startTime": "18:00", "durationMinutes": 45}],
              "nextSlot": {"weekday": 2, "startTime": "18:00", "durationMinutes": 45}
            }
          },
          {
            "id": "\(UUID().uuidString.lowercased())",
            "fullName": "Júlia Silveira",
            "birthDate": "2013-01-15",
            "status": "active",
            "class": null
          }
        ]}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let dependents = try await repository.dependents()

        #expect(transport.requests[0].0.path == "/v1/responsavel/dependents")
        #expect(dependents.count == 2)
        let pedro = dependents[0]
        #expect(pedro.id == dependentId)
        #expect(pedro.enrolledClass?.name == "Kids")
        #expect(pedro.enrolledClass?.nextSlot == ScheduleSlot(weekday: 2, startTime: "18:00", durationMinutes: 45))
        #expect(dependents[1].enrolledClass == nil)
    }

    @Test("dependent(id:) surfaces the ownership 404 (foreign dependent)")
    func dependentForeign() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.dependent(id: UUID())
        }
    }

    @Test("classSuggestion sends birthDate and maps a match")
    func suggestionMatch() async throws {
        let json = """
        {"suggestion": {
          "id": "\(Self.classId.uuidString.lowercased())",
          "name": "Kids",
          "ageMin": 4,
          "ageMax": 12,
          "capacity": 16,
          "occupancy": 14,
          "schedules": [
            {"weekday": 2, "startTime": "18:00", "durationMinutes": 45},
            {"weekday": 4, "startTime": "18:00", "durationMinutes": 45}
          ]
        }}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let suggestion = try await repository.classSuggestion(birthDate: "2017-06-10")

        let request = transport.requests[0].0
        #expect(request.path?.contains("/v1/responsavel/class-suggestion") == true)
        #expect(request.path?.contains("birthDate=2017-06-10") == true)
        let match = try #require(suggestion)
        #expect(match.id == Self.classId)
        #expect(match.name == "Kids")
        #expect(match.schedules.count == 2)
    }

    @Test("classSuggestion maps the no-match null to nil")
    func suggestionNoMatch() async throws {
        let (repository, _) = makeRepository([ok("{\"suggestion\": null}")])

        let suggestion = try await repository.classSuggestion(birthDate: "1990-01-01")

        #expect(suggestion == nil)
    }

    @Test("registerDependent posts the accepted class and maps enrolled")
    func registerDependent() async throws {
        let dependentId = UUID()
        let json = """
        {
          "dependent": {
            "id": "\(dependentId.uuidString.lowercased())",
            "fullName": "Pedro Silveira",
            "birthDate": "2017-06-10",
            "status": "active",
            "class": {
              "id": "\(Self.classId.uuidString.lowercased())",
              "name": "Kids",
              "schedules": [{"weekday": 2, "startTime": "18:00", "durationMinutes": 45}],
              "nextSlot": {"weekday": 2, "startTime": "18:00", "durationMinutes": 45}
            }
          },
          "enrolled": true
        }
        """
        let (repository, transport) = makeRepository([ok(json, status: .created)])

        let result = try await repository.registerDependent(
            fullName: "Pedro Silveira",
            birthDate: "2017-06-10",
            classId: Self.classId
        )

        let (request, body) = transport.requests[0]
        #expect(request.method == .post)
        #expect(request.path == "/v1/responsavel/dependents")
        let sent = String(decoding: try #require(body), as: UTF8.self)
        #expect(sent.contains("Pedro Silveira"))
        #expect(sent.contains(Self.classId.uuidString.lowercased()))
        #expect(result.enrolled)
        #expect(result.dependent.id == dependentId)
    }

    @Test("registerDependent surfaces the permission-disabled toggle denial")
    func registerToggleOff() async throws {
        let (repository, _) = makeRepository([problem(status: 403, code: ApiErrorCode.permissionDisabled)])

        await #expect(throws: ApiError.forbidden(code: ApiErrorCode.permissionDisabled)) {
            _ = try await repository.registerDependent(fullName: "X", birthDate: "2017-06-10", classId: nil)
        }
    }
}
