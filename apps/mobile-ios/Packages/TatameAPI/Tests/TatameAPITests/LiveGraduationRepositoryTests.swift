import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TatameAPI
import TatameCore

@Suite("LiveGraduationRepository (generated client → domain mapping)")
struct LiveGraduationRepositoryTests {
    private static let baseURL = URL(string: "http://localhost:3000")!
    private static let studentId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000021")!
    private static let blueBeltId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000022")!
    private static let purpleBeltId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000023")!
    private static let professorId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000024")!
    private static let graduationId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000025")!
    private static let noteId = UUID(uuidString: "0198a7b0-0000-7000-8000-000000000026")!

    private func makeRepository(_ responses: [(HTTPResponse, Data?)]) -> (LiveGraduationRepository, TransportMock) {
        let transport = TransportMock(responses: responses)
        let client = Client(
            serverURL: Self.baseURL,
            configuration: TatameClientDefaults.configuration,
            transport: transport
        )
        return (LiveGraduationRepository(client: client), transport)
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

    private var beltViewJSON: String {
        """
        {"beltId": "\(Self.blueBeltId.uuidString.lowercased())", "name": "Azul",
         "colorSlug": "belt.blue", "tipColorSlug": null, "maxDegrees": 4, "degrees": 2}
        """
    }

    private var progressJSON: String {
        """
        {"current": 26, "target": 40, "label": "Próximo 3º grau",
         "nextMilestone": {"kind": "degree", "degree": 3}}
        """
    }

    private var actorJSON: String {
        "{\"userId\": \"\(Self.professorId.uuidString.lowercased())\", \"fullName\": \"Rafael Nunes\"}"
    }

    @Test("alunoGraduation maps the hero, progress, and timeline with the certificate flag")
    func alunoGraduationMapping() async throws {
        let degreeEntry = """
        {"id": "\(Self.graduationId.uuidString.lowercased())", "kind": "degree",
         "belt": {"beltId": "\(Self.blueBeltId.uuidString.lowercased())", "name": "Azul",
                  "colorSlug": "belt.blue", "tipColorSlug": null, "maxDegrees": 4},
         "degree": 2, "awardedAt": "2026-05-10T14:00:00.000Z",
         "awardedBy": \(actorJSON),
         "notes": "Constância exemplar nos fundamentos.",
         "reversed": false, "reversesGraduationId": null, "certificateAvailable": false}
        """
        let beltEntry = """
        {"id": "\(UUID().uuidString.lowercased())", "kind": "belt",
         "belt": {"beltId": "\(Self.blueBeltId.uuidString.lowercased())", "name": "Azul",
                  "colorSlug": "belt.blue", "tipColorSlug": null, "maxDegrees": 4},
         "degree": 0, "awardedAt": "2024-11-20T14:00:00.000Z",
         "awardedBy": \(actorJSON),
         "notes": "Exame de faixa — aprovado com distinção.",
         "reversed": false, "reversesGraduationId": null, "certificateAvailable": true}
        """
        let (repository, transport) = makeRepository([
            ok("""
            {"belt": \(beltViewJSON), "progress": \(progressJSON),
             "timeline": [\(degreeEntry), \(beltEntry)]}
            """)
        ])

        let graduation = try await repository.alunoGraduation()

        #expect(transport.requests[0].0.path == "/v1/aluno/graduation")
        #expect(graduation.belt.beltId == Self.blueBeltId)
        #expect(graduation.belt.name == "Azul")
        #expect(graduation.belt.colorSlug == "belt.blue")
        #expect(graduation.belt.tipColorSlug == nil)
        #expect(graduation.belt.degrees == 2)
        #expect(graduation.belt.maxDegrees == 4)
        #expect(graduation.progress.current == 26)
        #expect(graduation.progress.target == 40)
        #expect(graduation.progress.label == "Próximo 3º grau")
        #expect(graduation.progress.nextMilestone == NextMilestone(kind: .degree, degree: 3))
        #expect(graduation.timeline.count == 2)
        #expect(graduation.timeline[0].kind == .degree)
        #expect(graduation.timeline[0].degree == 2)
        #expect(graduation.timeline[0].notes == "Constância exemplar nos fundamentos.")
        #expect(!graduation.timeline[0].certificateAvailable)
        #expect(graduation.timeline[1].kind == .belt)
        #expect(graduation.timeline[1].certificateAvailable)
        #expect(graduation.timeline[1].awardedBy.fullName == "Rafael Nunes")
    }

    @Test("studentProfile maps student, belt, progress, stat tiles, and notes")
    func studentProfileMapping() async throws {
        let json = """
        {"student": {"id": "\(Self.studentId.uuidString.lowercased())", "fullName": "Lucas Almeida",
                     "birthDate": "2000-03-15", "status": "active", "badge": "ativo"},
         "belt": \(beltViewJSON),
         "progress": {"current": 38, "target": 40, "label": "Próximo 3º grau",
                      "nextMilestone": {"kind": "degree", "degree": 3}},
         "stats": {"monthPresencePct": 86, "monthAttendedSessions": 14, "monthTotalSessions": 16,
                   "streak": 5, "totalLessons": 120},
         "notes": [
           {"id": "\(Self.noteId.uuidString.lowercased())",
            "body": "Boa evolução na guarda fechada.",
            "createdAt": "2026-07-12T10:00:00.000Z",
            "author": \(actorJSON)}
         ]}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let profile = try await repository.studentProfile(studentId: Self.studentId)

        #expect(
            transport.requests[0].0.path
                == "/v1/professor/students/\(Self.studentId.uuidString.lowercased())/profile"
        )
        #expect(profile.student.fullName == "Lucas Almeida")
        #expect(profile.student.badge == .ativo)
        #expect(profile.belt.degrees == 2)
        #expect(profile.progress.current == 38)
        #expect(profile.stats.monthPresencePct == 86)
        #expect(profile.stats.monthAttendedSessions == 14)
        #expect(profile.notes.count == 1)
        #expect(profile.notes[0].body == "Boa evolução na guarda fechada.")
        #expect(profile.notes[0].author.fullName == "Rafael Nunes")
    }

    @Test("studentProfile surfaces the cross-tenant 404 (foreign student)")
    func studentProfileForeign() async throws {
        let (repository, _) = makeRepository([problem(status: 404, code: ApiErrorCode.notFound)])

        await #expect(throws: ApiError.notFound(code: ApiErrorCode.notFound)) {
            _ = try await repository.studentProfile(studentId: UUID())
        }
    }

    @Test("award posts kind=degree with notes and maps the fresh belt")
    func awardDegree() async throws {
        let json = """
        {"graduation": {"id": "\(Self.graduationId.uuidString.lowercased())", "kind": "degree",
          "belt": {"beltId": "\(Self.blueBeltId.uuidString.lowercased())", "name": "Azul",
                   "colorSlug": "belt.blue", "tipColorSlug": null, "maxDegrees": 4},
          "degree": 3, "awardedAt": "2026-08-09T12:00:00.000Z",
          "awardedBy": \(actorJSON), "notes": "Exame de grau.",
          "reversed": false, "reversesGraduationId": null, "certificateAvailable": false},
         "belt": {"beltId": "\(Self.blueBeltId.uuidString.lowercased())", "name": "Azul",
                  "colorSlug": "belt.blue", "tipColorSlug": null, "maxDegrees": 4, "degrees": 3}}
        """
        let (repository, transport) = makeRepository([ok(json, status: .created)])

        let result = try await repository.award(
            studentId: Self.studentId,
            kind: .degree,
            beltId: nil,
            notes: "Exame de grau."
        )

        let (request, body) = transport.requests[0]
        #expect(request.method == .post)
        #expect(
            request.path
                == "/v1/professor/students/\(Self.studentId.uuidString.lowercased())/graduations"
        )
        let sent = String(decoding: try #require(body), as: UTF8.self)
        #expect(sent.contains("degree"))
        #expect(sent.contains("Exame de grau."))
        #expect(!sent.contains("beltId"))
        #expect(result.graduation.degree == 3)
        #expect(result.belt.degrees == 3)
    }

    @Test("award posts kind=belt with the target belt id and maps the reset degrees")
    func awardBelt() async throws {
        let json = """
        {"graduation": {"id": "\(Self.graduationId.uuidString.lowercased())", "kind": "belt",
          "belt": {"beltId": "\(Self.purpleBeltId.uuidString.lowercased())", "name": "Roxa",
                   "colorSlug": "belt.purple", "tipColorSlug": null, "maxDegrees": 4},
          "degree": 0, "awardedAt": "2026-08-09T12:00:00.000Z",
          "awardedBy": \(actorJSON), "notes": null,
          "reversed": false, "reversesGraduationId": null, "certificateAvailable": true},
         "belt": {"beltId": "\(Self.purpleBeltId.uuidString.lowercased())", "name": "Roxa",
                  "colorSlug": "belt.purple", "tipColorSlug": null, "maxDegrees": 4, "degrees": 0}}
        """
        let (repository, transport) = makeRepository([ok(json, status: .created)])

        let result = try await repository.award(
            studentId: Self.studentId,
            kind: .belt,
            beltId: Self.purpleBeltId,
            notes: nil
        )

        let sent = String(decoding: try #require(transport.requests[0].1), as: UTF8.self)
        #expect(sent.contains("belt"))
        #expect(sent.contains(Self.purpleBeltId.uuidString.lowercased()))
        #expect(result.belt.name == "Roxa")
        #expect(result.belt.degrees == 0)
        #expect(result.graduation.certificateAvailable)
    }

    @Test("award maps the stable graduation validation codes")
    func awardValidationCodes() async throws {
        let (repository, _) = makeRepository([
            problem(status: 422, code: ApiErrorCode.graduationDegreeAtMax),
            problem(status: 422, code: ApiErrorCode.graduationBeltInvalidTarget),
        ])

        await #expect(throws: ApiError.conflict(code: ApiErrorCode.graduationDegreeAtMax)) {
            _ = try await repository.award(studentId: Self.studentId, kind: .degree, beltId: nil, notes: nil)
        }
        await #expect(throws: ApiError.conflict(code: ApiErrorCode.graduationBeltInvalidTarget)) {
            _ = try await repository.award(
                studentId: Self.studentId,
                kind: .belt,
                beltId: Self.purpleBeltId,
                notes: nil
            )
        }
    }

    @Test("award surfaces the graduation.update toggle denial (story 15)")
    func awardToggleOff() async throws {
        let (repository, _) = makeRepository([problem(status: 403, code: ApiErrorCode.permissionDisabled)])

        await #expect(throws: ApiError.forbidden(code: ApiErrorCode.permissionDisabled)) {
            _ = try await repository.award(studentId: Self.studentId, kind: .degree, beltId: nil, notes: nil)
        }
    }

    @Test("notes lists newest first and createNote posts the body")
    func notesRoundTrip() async throws {
        let noteJSON = """
        {"id": "\(Self.noteId.uuidString.lowercased())", "body": "Pediu foco em raspagens.",
         "createdAt": "2026-06-18T09:00:00.000Z", "author": \(actorJSON)}
        """
        let (repository, transport) = makeRepository([
            ok("{\"notes\": [\(noteJSON)]}"),
            ok("{\"note\": \(noteJSON)}", status: .created),
        ])

        let notes = try await repository.notes(studentId: Self.studentId)
        #expect(notes.count == 1)
        #expect(notes[0].body == "Pediu foco em raspagens.")

        let created = try await repository.createNote(studentId: Self.studentId, body: "Pediu foco em raspagens.")
        let (request, body) = transport.requests[1]
        #expect(request.method == .post)
        #expect(
            request.path == "/v1/professor/students/\(Self.studentId.uuidString.lowercased())/notes"
        )
        #expect(String(decoding: try #require(body), as: UTF8.self).contains("Pediu foco em raspagens."))
        #expect(created.id == Self.noteId)
    }

    @Test("professorProfile maps the nullable belt chip and the merged régua with kids toggles")
    func professorProfileMapping() async throws {
        let json = """
        {"professor": \(actorJSON),
         "belt": {"beltId": "\(UUID().uuidString.lowercased())", "name": "Preta",
                  "colorSlug": "belt.black", "tipColorSlug": "belt.red", "maxDegrees": 6, "degrees": 2},
         "validGraduations": [
           {"beltId": "\(UUID().uuidString.lowercased())", "name": "Branca", "colorSlug": "belt.white",
            "tipColorSlug": null, "maxDegrees": 4, "ladderKind": "adult", "enabled": true},
           {"beltId": "\(UUID().uuidString.lowercased())", "name": "Laranja", "colorSlug": "belt.orange",
            "tipColorSlug": null, "maxDegrees": 4, "ladderKind": "kids", "enabled": false}
         ]}
        """
        let (repository, transport) = makeRepository([ok(json)])

        let profile = try await repository.professorProfile()

        #expect(transport.requests[0].0.path == "/v1/professor/profile")
        #expect(profile.professor.fullName == "Rafael Nunes")
        let belt = try #require(profile.belt)
        #expect(belt.colorSlug == "belt.black")
        #expect(belt.tipColorSlug == "belt.red")
        #expect(belt.degrees == 2)
        #expect(profile.validGraduations.count == 2)
        #expect(profile.validGraduations[0].enabled)
        #expect(profile.validGraduations[1].ladderKind == .kids)
        #expect(!profile.validGraduations[1].enabled)
    }

    @Test("professorProfile maps a missing belt chip to nil (rank unset)")
    func professorProfileNoBelt() async throws {
        let (repository, _) = makeRepository([
            ok("{\"professor\": \(actorJSON), \"belt\": null, \"validGraduations\": []}")
        ])

        let profile = try await repository.professorProfile()

        #expect(profile.belt == nil)
        #expect(profile.validGraduations.isEmpty)
    }
}
