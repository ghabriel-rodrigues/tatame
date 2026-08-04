// LiveAttendanceRepository — the generated Client wrapped behind the
// TatameCore protocol (spec 004, ATT.22-24; same pattern as
// LiveEnrollmentRepository), plus the one documented OpenAPI exception:
// the SSE live stream, hand-rolled over URLSession.bytes with SSEParser
// (issue 09 — no third-party deps). Every error is normalized into ApiError;
// the stable attendance codes (checkin.code_invalid, checkin.not_enrolled,
// checkin.no_session_today, checkin.outside_window,
// attendance.revoke_window_closed) flow through the problem+json mapper
// untouched.

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import TatameCore

struct LiveAttendanceRepository: AttendanceRepository {
    let client: Client
    /// API origin (paths below already carry /v1) — the stream URL is built
    /// by hand because the generated client never calls the SSE route.
    let serverURL: URL

    // MARK: Aluno

    func alunoHome() async throws -> AlunoHome {
        try await ApiErrorMapper.run {
            let response = try await client.AlunoAttendanceController_home_v1(.init())
            switch response {
            case .ok(let ok):
                return try AlunoHome(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func checkIn(
        method: CheckinMethod,
        qrToken: String?,
        code: String?,
        classId: UUID?
    ) async throws -> CheckinResult {
        try await ApiErrorMapper.run {
            let methodPayload: Components.Schemas.CheckinRequestDto.methodPayload =
                switch method {
                case .qr: .qr
                case .code: .code
                case .manual: .manual
                }
            let response = try await client.AlunoAttendanceController_checkIn_v1(
                .init(
                    body: .json(
                        .init(
                            method: methodPayload,
                            qrToken: qrToken,
                            code: code,
                            classId: classId?.uuidString.lowercased()
                        )
                    )
                )
            )
            switch response {
            case .ok(let ok):
                return try CheckinResult(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    // MARK: Professor — chamada ao vivo

    func openLiveCode(classId: UUID) async throws -> LiveCode {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorLiveController_open_v1(
                .init(path: .init(id: classId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try LiveCode(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func closeLiveCode(id: UUID) async throws -> LiveCode {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorLiveController_close_v1(
                .init(path: .init(id: id.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try LiveCode(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func liveSnapshot(liveCodeId: UUID) async throws -> LiveSnapshot {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorLiveController_snapshot_v1(
                .init(path: .init(id: liveCodeId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try LiveSnapshot(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func mintStreamTicket(liveCodeId: UUID) async throws -> StreamTicket {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorLiveController_mintTicket_v1(
                .init(path: .init(id: liveCodeId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return StreamTicket(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func liveStream(liveCodeId: UUID, ticket: String) -> AsyncThrowingStream<LiveStreamEvent, any Error> {
        let url = streamURL(liveCodeId: liveCodeId, ticket: ticket)
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(url: url)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    // Long-lived response: the 20 s server heartbeat keeps the
                    // default per-packet timeout from firing; the overall
                    // resource timeout must not cap the stream.
                    request.timeoutInterval = 60
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else {
                        throw ApiError.network(.badServerResponse)
                    }
                    guard http.statusCode == 200 else {
                        throw ApiErrorMapper.map(status: http.statusCode, data: nil)
                    }
                    var parser = SSEParser()
                    for try await byte in bytes {
                        for frame in parser.consume(CollectionOfOne(byte)) {
                            if let event = Self.event(from: frame) {
                                continuation.yield(event)
                            }
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: ApiErrorMapper.map(anyError: error))
                }
            }
            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    func streamURL(liveCodeId: UUID, ticket: String) -> URL {
        var components = URLComponents(url: serverURL, resolvingAgainstBaseURL: false)!
        components.path += "/v1/professor/live-codes/\(liveCodeId.uuidString.lowercased())/stream"
        components.queryItems = [URLQueryItem(name: "ticket", value: ticket)]
        return components.url!
    }

    // MARK: SSE frame → domain event

    private struct CheckinEventPayload: Decodable {
        let attendanceId: UUID
        let studentId: UUID
        let studentName: String
        let method: String
        let checkedInAt: Date
        let presentCount: Int
    }

    private struct RevokeEventPayload: Decodable {
        let attendanceId: UUID
        let presentCount: Int
    }

    private static let eventDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            guard let date = LenientISO8601DateTranscoder.parse(raw) else {
                throw DecodingError.dataCorrupted(
                    DecodingError.Context(
                        codingPath: decoder.codingPath,
                        debugDescription: "invalid ISO-8601 date: \(raw)"
                    )
                )
            }
            return date
        }
        return decoder
    }()

    /// Maps a named frame to a domain event; unknown/undecodable frames are
    /// dropped (forward compatibility — new event types must not kill the
    /// stream).
    static func event(from frame: SSEFrame) -> LiveStreamEvent? {
        let data = Data(frame.data.utf8)
        switch frame.event {
        case "checkin":
            guard let payload = try? eventDecoder.decode(CheckinEventPayload.self, from: data) else {
                return nil
            }
            return .checkin(
                LiveAttendee(
                    id: payload.attendanceId,
                    studentId: payload.studentId,
                    studentName: payload.studentName,
                    method: CheckinMethod(rawValue: payload.method) ?? .manual,
                    checkedInAt: payload.checkedInAt
                ),
                presentCount: payload.presentCount
            )
        case "revoke":
            guard let payload = try? eventDecoder.decode(RevokeEventPayload.self, from: data) else {
                return nil
            }
            return .revoke(attendanceId: payload.attendanceId, presentCount: payload.presentCount)
        default:
            return nil
        }
    }

    // MARK: Professor — chamada manual

    func openRollCall(classId: UUID) async throws -> RollCall {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorRollCallController_open_v1(
                .init(path: .init(id: classId.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try RollCall(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func markAttendance(sessionId: UUID, studentId: UUID) async throws -> MarkAttendanceResult {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorRollCallController_mark_v1(
                .init(
                    path: .init(id: sessionId.uuidString.lowercased()),
                    body: .json(.init(studentId: studentId.uuidString.lowercased()))
                )
            )
            switch response {
            case .ok(let ok):
                return try MarkAttendanceResult(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func revokeAttendance(id: UUID) async throws -> RevokeAttendanceResult {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorRollCallController_revoke_v1(
                .init(
                    path: .init(id: id.uuidString.lowercased()),
                    body: .json(.init())
                )
            )
            switch response {
            case .ok(let ok):
                return try RevokeAttendanceResult(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    // MARK: Professor — dashboard & students

    func dashboard() async throws -> ProfessorDashboard {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorDashboardController_dashboard_v1(.init())
            switch response {
            case .ok(let ok):
                return try ProfessorDashboard(dto: try ok.body.json)
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }

    func students(notEnrolledInClassId: UUID?) async throws -> [RosterStudent] {
        try await ApiErrorMapper.run {
            let response = try await client.ProfessorDashboardController_students_v1(
                .init(query: .init(notEnrolledInClassId: notEnrolledInClassId?.uuidString.lowercased()))
            )
            switch response {
            case .ok(let ok):
                return try (try ok.body.json).students.map(RosterStudent.init(dto:))
            case .undocumented(let statusCode, let payload):
                throw await ApiErrorMapper.map(status: statusCode, payload: payload)
            }
        }
    }
}
