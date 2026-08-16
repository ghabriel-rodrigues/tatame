import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveRankingsRepository (generated client → domain mapping)")
struct LiveRankingsRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveRankingsRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        return (LiveRankingsRepository(client: client), transport)
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

    @Test("ranking(by: .lessons) maps window, rows, me, and total")
    func lessonsMapping() async throws {
        let (repository, transport) = makeRepository([
            ok("""
            {"by": "lessons",
             "window": {"label": "2026-08", "start": "2026-08-01", "endExclusive": "2026-09-01"},
             "top": [
               {"position": 1, "name": "Marina Costa", "count": 17, "isMe": false},
               {"position": 2, "name": "Lucas Almeida", "count": 14, "isMe": true}
             ],
             "me": {"position": 2, "count": 14},
             "totalRanked": 23}
            """)
        ])

        let ranking = try await repository.ranking(by: .lessons)

        #expect(transport.requests[0].0.path?.hasPrefix("/v1/rankings") == true)
        #expect(transport.requests[0].0.path?.contains("by=lessons") == true)
        #expect(ranking.by == .lessons)
        #expect(ranking.window.label == "2026-08")
        #expect(ranking.top.count == 2)
        #expect(ranking.top[0] == RankingRow(position: 1, name: "Marina Costa", count: 17, isMe: false))
        #expect(ranking.top[1].isMe)
        #expect(ranking.me == RankingMe(position: 2, count: 14))
        #expect(ranking.totalRanked == 23)
    }

    @Test("ranking(by: .events) sends the events segment and maps a null me (professor)")
    func eventsMappingProfessor() async throws {
        let (repository, transport) = makeRepository([
            ok("""
            {"by": "events",
             "window": {"label": "2026-S2", "start": "2026-07-01", "endExclusive": "2027-01-01"},
             "top": [{"position": 1, "name": "João Ferraz", "count": 5, "isMe": false}],
             "me": null,
             "totalRanked": 23}
            """)
        ])

        let ranking = try await repository.ranking(by: .events)

        #expect(transport.requests[0].0.path?.contains("by=events") == true)
        #expect(ranking.by == .events)
        #expect(ranking.window.label == "2026-S2")
        #expect(ranking.me == nil)
    }

    @Test("problem responses map to the typed ApiError")
    func errorMapping() async throws {
        let (repository, _) = makeRepository([
            problem(status: 403, code: "authz.forbidden_role")
        ])

        await #expect(throws: ApiError.forbidden(code: "authz.forbidden_role")) {
            try await repository.ranking(by: .lessons)
        }
    }
}
