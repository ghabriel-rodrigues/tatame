// Aluno check-in sheet state machine (spec 004, ATT.22 — stories 1-12):
// three methods in a segmented control, one submit path, success pop with
// the streak line, and the distinct already-registered state.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class CheckinModel {
    /// Segmented-control methods (handoff aluno-04 order).
    public enum Method: String, CaseIterable, Sendable {
        case qr
        case code
        case manual

        public var labelPTBR: String {
            switch self {
            case .qr: "QR Code"
            case .code: "Código"
            case .manual: "Manual"
            }
        }
    }

    /// Success-pop content (spec stories 8-9).
    public struct Outcome: Equatable, Sendable {
        /// True on the duplicate state — rendered as "Presença já
        /// registrada", never an error (story 9).
        public let alreadyCheckedIn: Bool
        public let stats: AlunoStats

        /// "Essa é a sua 7ª aula seguida. Bom treino!" — nil when the academy
        /// disabled streak gamification (story 16).
        public var streakLinePTBR: String? {
            AttendanceFormatters.streakLinePTBR(streak: stats.streak)
        }
    }

    public enum Phase: Equatable, Sendable {
        case entry
        case submitting
        case success(Outcome)
        case failed(message: String)
    }

    public let todayClass: AlunoTodayClass
    public var method: Method = .qr
    /// Digits typed on the Código tab (filtered to 4 numerics by the view).
    public var codeDigits = ""
    public private(set) var phase: Phase = .entry

    @ObservationIgnored private let repository: any AttendanceRepository
    /// Fired once per successful round trip so the home model applies the
    /// hero flip + fresh stats (story 15).
    @ObservationIgnored private let onResult: (CheckinResult) -> Void

    public init(
        todayClass: AlunoTodayClass,
        repository: any AttendanceRepository,
        onResult: @escaping (CheckinResult) -> Void = { _ in }
    ) {
        self.todayClass = todayClass
        self.repository = repository
        self.onResult = onResult
    }

    public var canSubmitCode: Bool {
        codeDigits.count == 4 && codeDigits.allSatisfy(\.isNumber)
    }

    /// QR scan result — ignored unless the sheet is on the entry state (a
    /// scanner can fire the same token repeatedly).
    public func handleScannedToken(_ token: String) async {
        guard case .entry = phase else { return }
        await submit(method: .qr, qrToken: token)
    }

    public func submitCode() async {
        guard canSubmitCode else { return }
        await submit(method: .code, code: codeDigits)
    }

    /// Manual method — the location-verification step is a client stub
    /// (spec out-of-scope); the server registers directly for today's class.
    public func submitManual() async {
        await submit(method: .manual, classId: todayClass.classId)
    }

    /// Back to the entry state after a failure.
    public func reset() {
        phase = .entry
    }

    private func submit(
        method: CheckinMethod,
        qrToken: String? = nil,
        code: String? = nil,
        classId: UUID? = nil
    ) async {
        guard phase != .submitting else { return }
        phase = .submitting
        do {
            let result = try await repository.checkIn(
                method: method,
                qrToken: qrToken,
                code: code,
                classId: classId
            )
            phase = .success(
                Outcome(alreadyCheckedIn: result.status == .alreadyCheckedIn, stats: result.stats)
            )
            onResult(result)
        } catch let error as ApiError {
            phase = .failed(message: AttendanceMessages.message(for: error))
        } catch {
            phase = .failed(message: AttendanceMessages.generic)
        }
    }
}
