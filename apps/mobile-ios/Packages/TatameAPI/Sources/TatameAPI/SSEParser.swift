// Hand-rolled incremental SSE parser (spec 004 / issue 09: the stream route
// is a documented exception to the OpenAPI contract — Swift wires
// URLSession.bytes plus this ~80-line parser; no third-party deps).
//
// Implements the WHATWG EventSource framing subset the live-chamada stream
// emits: `event:` / `data:` / `id:` fields, comment lines (the 20 s
// heartbeat) ignored, frames dispatched on blank lines, LF / CR / CRLF all
// accepted as line breaks. Pure and Sendable — fed byte chunks by the
// stream task, unit-tested without any networking.

import Foundation

/// One dispatched SSE frame (post blank-line).
struct SSEFrame: Equatable, Sendable {
    /// The `event:` field — nil means the default unnamed event.
    var event: String?
    /// Joined `data:` lines (newline-separated, per the SSE spec).
    var data: String
    /// Last seen `id:` field, sticky across frames (unused in v1 — no replay).
    var id: String?
}

struct SSEParser: Sendable {
    private var lineBuffer: [UInt8] = []
    private var pendingCR = false

    private var eventName: String?
    private var dataLines: [String] = []
    private var lastEventId: String?

    init() {}

    /// Feeds a chunk of bytes; returns every frame completed by the chunk.
    mutating func consume(_ bytes: some Sequence<UInt8>) -> [SSEFrame] {
        var frames: [SSEFrame] = []
        for byte in bytes {
            switch byte {
            case 0x0A: // LF — part of a CRLF pair when a CR just dispatched.
                if pendingCR {
                    pendingCR = false
                } else {
                    processLine(into: &frames)
                }
            case 0x0D: // CR — dispatch now; a following LF is swallowed.
                pendingCR = true
                processLine(into: &frames)
            default:
                pendingCR = false
                lineBuffer.append(byte)
            }
        }
        return frames
    }

    private mutating func processLine(into frames: inout [SSEFrame]) {
        let line = String(decoding: lineBuffer, as: UTF8.self)
        lineBuffer.removeAll(keepingCapacity: true)

        if line.isEmpty {
            // Blank line = dispatch. An empty data buffer dispatches nothing
            // (heartbeat comments land here).
            if !dataLines.isEmpty {
                frames.append(
                    SSEFrame(event: eventName, data: dataLines.joined(separator: "\n"), id: lastEventId)
                )
            }
            eventName = nil
            dataLines = []
            return
        }

        if line.hasPrefix(":") {
            return // Comment (heartbeat) — ignored.
        }

        let field: Substring
        let value: Substring
        if let colon = line.firstIndex(of: ":") {
            field = line[line.startIndex..<colon]
            var rest = line[line.index(after: colon)...]
            if rest.hasPrefix(" ") {
                rest = rest.dropFirst()
            }
            value = rest
        } else {
            field = line[...]
            value = ""
        }

        switch field {
        case "event":
            eventName = String(value)
        case "data":
            dataLines.append(String(value))
        case "id":
            lastEventId = String(value)
        default:
            break // `retry` and unknown fields — ignored in v1.
        }
    }
}
