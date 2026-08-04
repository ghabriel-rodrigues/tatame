// The attendance slice introduces the contract's first `date-time` fields.
// NestJS serializes Dates via toISOString() — always with fractional seconds
// ("2026-08-03T19:00:00.000Z") — while the OpenAPIRuntime default transcoder
// only accepts whole seconds. This lenient transcoder accepts both forms and
// is wired into every generated Client (factory + tests) via
// `TatameClientDefaults.configuration`.

import Foundation
import OpenAPIRuntime

struct LenientISO8601DateTranscoder: DateTranscoder, @unchecked Sendable {
    // ISO8601DateFormatter is documented thread-safe (hence the
    // nonisolated(unsafe) opt-outs below and the @unchecked Sendable above).
    private nonisolated(unsafe) static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private nonisolated(unsafe) static let whole: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func parse(_ string: String) -> Date? {
        fractional.date(from: string) ?? whole.date(from: string)
    }

    func encode(_ date: Date) throws -> String {
        Self.fractional.string(from: date)
    }

    func decode(_ dateString: String) throws -> Date {
        guard let date = Self.parse(dateString) else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: [],
                    debugDescription: "Expected an ISO-8601 date-time, got: \(dateString)"
                )
            )
        }
        return date
    }
}

/// Shared generated-client configuration (one place, used by the factory and
/// the repository tests alike).
public enum TatameClientDefaults {
    static var configuration: Configuration {
        Configuration(dateTranscoder: LenientISO8601DateTranscoder())
    }
}
