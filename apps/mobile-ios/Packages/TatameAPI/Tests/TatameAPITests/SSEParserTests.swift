import Foundation
import Testing
@testable import TatameAPI
import TatameCore

@Suite("SSEParser (hand-rolled line/frame parsing, issue 09 contract)")
struct SSEParserTests {
    private func consume(_ text: String, parser: inout SSEParser) -> [SSEFrame] {
        parser.consume(Array(text.utf8))
    }

    @Test("a named event frame is dispatched on the blank line")
    func namedFrame() {
        var parser = SSEParser()
        let frames = consume("event: checkin\ndata: {\"a\":1}\n\n", parser: &parser)
        #expect(frames == [SSEFrame(event: "checkin", data: "{\"a\":1}", id: nil)])
    }

    @Test("frames split across arbitrary chunk boundaries reassemble")
    func chunkedFrames() {
        var parser = SSEParser()
        var frames: [SSEFrame] = []
        // Feed byte-by-byte — the transport iterates single bytes.
        for byte in Array("event: revoke\ndata: {\"b\":2}\n\nevent: checkin\ndata: x\n\n".utf8) {
            frames += parser.consume(CollectionOfOne(byte))
        }
        #expect(frames == [
            SSEFrame(event: "revoke", data: "{\"b\":2}", id: nil),
            SSEFrame(event: "checkin", data: "x", id: nil),
        ])
    }

    @Test("heartbeat comments are ignored and dispatch nothing")
    func heartbeatIgnored() {
        var parser = SSEParser()
        let frames = consume(": hb\n\n: hb\n\nevent: checkin\ndata: y\n\n", parser: &parser)
        #expect(frames == [SSEFrame(event: "checkin", data: "y", id: nil)])
    }

    @Test("multiple data lines join with newlines (SSE spec)")
    func multiDataLines() {
        var parser = SSEParser()
        let frames = consume("data: line1\ndata: line2\n\n", parser: &parser)
        #expect(frames == [SSEFrame(event: nil, data: "line1\nline2", id: nil)])
    }

    @Test("id is captured and sticky; event name resets per frame")
    func idSticky() {
        var parser = SSEParser()
        let frames = consume("id: 7\nevent: checkin\ndata: a\n\ndata: b\n\n", parser: &parser)
        #expect(frames == [
            SSEFrame(event: "checkin", data: "a", id: "7"),
            SSEFrame(event: nil, data: "b", id: "7"),
        ])
    }

    @Test("CRLF and CR line endings parse like LF")
    func crlfLineEndings() {
        var parser = SSEParser()
        let frames = consume("event: checkin\r\ndata: z\r\n\r\n", parser: &parser)
        #expect(frames == [SSEFrame(event: "checkin", data: "z", id: nil)])

        var crParser = SSEParser()
        let crFrames = crParser.consume(Array("data: w\r\r".utf8))
        #expect(crFrames == [SSEFrame(event: nil, data: "w", id: nil)])
    }

    @Test("a blank line without data dispatches nothing")
    func emptyDispatch() {
        var parser = SSEParser()
        #expect(consume("\n\nevent: checkin\n\n", parser: &parser).isEmpty)
    }

    @Test("checkin frames decode into domain events; unknown events drop")
    func frameToDomainEvent() throws {
        let attendanceId = UUID()
        let studentId = UUID()
        let json = """
        {"attendanceId":"\(attendanceId.uuidString.lowercased())",\
        "studentId":"\(studentId.uuidString.lowercased())",\
        "studentName":"Lucas Almeida","method":"qr",\
        "checkedInAt":"2026-08-03T13:05:00.000Z","presentCount":3}
        """
        let event = LiveAttendanceRepository.event(
            from: SSEFrame(event: "checkin", data: json, id: nil)
        )
        guard case .checkin(let attendee, let presentCount) = event else {
            Issue.record("expected checkin event, got \(String(describing: event))")
            return
        }
        #expect(attendee.id == attendanceId)
        #expect(attendee.studentId == studentId)
        #expect(attendee.studentName == "Lucas Almeida")
        #expect(attendee.method == .qr)
        #expect(presentCount == 3)

        let unknown = LiveAttendanceRepository.event(
            from: SSEFrame(event: "mystery", data: "{}", id: nil)
        )
        #expect(unknown == nil)
    }

    @Test("revoke frames decode with the decremented count")
    func revokeEvent() {
        let attendanceId = UUID()
        let json = "{\"attendanceId\":\"\(attendanceId.uuidString.lowercased())\",\"presentCount\":2}"
        let event = LiveAttendanceRepository.event(
            from: SSEFrame(event: "revoke", data: json, id: nil)
        )
        #expect(event == .revoke(attendanceId: attendanceId, presentCount: 2))
    }
}
