// Professor chamada ao vivo model (spec 004, ATT.23 — stories 18-26):
// open (idempotent) → snapshot-then-stream over SSE → 5 s polling fallback
// after two consecutive drops (issue 09 contract), encerrar + reopen.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class LiveChamadaModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case opening
        case open(LiveCode)
        case closed(LiveCode)
        case failed(message: String)
    }

    /// Realtime transport state — the view renders a subtle "atualizando a
    /// cada 5 s" note in `.polling`.
    public enum Connection: Equatable, Sendable {
        case idle
        case connecting
        case streaming
        case polling
    }

    public private(set) var phase: Phase = .idle
    public private(set) var connection: Connection = .idle
    /// Arriving list — active attendances, oldest first.
    public private(set) var attendees: [LiveAttendee] = []
    public private(set) var presentCount = 0
    /// PT-BR banner for a failed encerrar/reopen action.
    public var actionError: String?

    public let classId: UUID

    @ObservationIgnored private let repository: any AttendanceRepository
    @ObservationIgnored private let pollInterval: Duration
    @ObservationIgnored private var liveTask: Task<Void, Never>?

    public init(
        classId: UUID,
        repository: any AttendanceRepository,
        pollInterval: Duration = .seconds(5)
    ) {
        self.classId = classId
        self.repository = repository
        self.pollInterval = pollInterval
    }

    public var liveCode: LiveCode? {
        switch phase {
        case .open(let code), .closed(let code): code
        case .idle, .opening, .failed: nil
        }
    }

    public var isOpen: Bool {
        if case .open = phase { return true }
        return false
    }

    // MARK: Lifecycle

    /// Opens the chamada (idempotent server-side: an active code is returned
    /// as-is) and attaches the realtime pipeline.
    public func start() async {
        switch phase {
        case .idle, .failed: break
        case .opening, .open, .closed: return
        }
        await open()
    }

    /// "Encerrar chamada" — invalidates code + QR immediately (story 23).
    public func encerrar() async {
        guard case .open(let code) = phase else { return }
        actionError = nil
        do {
            let closed = try await repository.closeLiveCode(id: code.id)
            stopLive()
            presentCount = closed.presentCount
            phase = .closed(closed)
        } catch let error as ApiError {
            actionError = AttendanceMessages.message(for: error)
        } catch {
            actionError = AttendanceMessages.generic
        }
    }

    /// Reopen after a mistaken close — a fresh code for the same session
    /// (story 24).
    public func reopen() async {
        guard case .closed = phase else { return }
        await open()
    }

    /// Cancels the realtime pipeline (screen dismissal).
    public func stop() {
        stopLive()
    }

    private func open() async {
        actionError = nil
        phase = .opening
        do {
            let code = try await repository.openLiveCode(classId: classId)
            presentCount = code.presentCount
            phase = .open(code)
            beginLive(codeId: code.id)
        } catch let error as ApiError {
            phase = .failed(message: AttendanceMessages.message(for: error))
        } catch {
            phase = .failed(message: AttendanceMessages.generic)
        }
    }

    // MARK: Realtime (snapshot → stream, polling fallback)

    private func beginLive(codeId: UUID) {
        stopLive()
        connection = .connecting
        liveTask = Task { [weak self] in
            await self?.runLive(codeId: codeId)
        }
    }

    private func stopLive() {
        liveTask?.cancel()
        liveTask = nil
        connection = .idle
    }

    private func runLive(codeId: UUID) async {
        var consecutiveDrops = 0
        // Stream attempts: snapshot first, then attach (issue 09 protocol —
        // no replay, no Last-Event-ID). A drop mints a fresh ticket and
        // reconnects; the second consecutive drop falls back to polling.
        while !Task.isCancelled, consecutiveDrops < 2 {
            do {
                let snapshot = try await repository.liveSnapshot(liveCodeId: codeId)
                apply(snapshot)
                let ticket = try await repository.mintStreamTicket(liveCodeId: codeId)
                connection = .streaming
                for try await event in repository.liveStream(liveCodeId: codeId, ticket: ticket.ticket) {
                    consecutiveDrops = 0
                    apply(event)
                }
                consecutiveDrops += 1 // Server closed (e.g. ticket window) — reconnect.
            } catch {
                if Task.isCancelled { return }
                consecutiveDrops += 1
            }
            guard !Task.isCancelled else { return }
            connection = .connecting
        }
        // Fallback: poll the snapshot endpoint every 5 s while the screen is
        // up (issue 09 — the stream never blocks a roll call).
        guard !Task.isCancelled else { return }
        connection = .polling
        while !Task.isCancelled {
            try? await Task.sleep(for: pollInterval)
            guard !Task.isCancelled else { return }
            if let snapshot = try? await repository.liveSnapshot(liveCodeId: codeId) {
                apply(snapshot)
            }
        }
    }

    private func apply(_ snapshot: LiveSnapshot) {
        presentCount = snapshot.presentCount
        attendees = snapshot.attendances
    }

    private func apply(_ event: LiveStreamEvent) {
        switch event {
        case .checkin(let attendee, let count):
            if !attendees.contains(where: { $0.id == attendee.id }) {
                attendees.append(attendee)
            }
            presentCount = count
        case .revoke(let attendanceId, let count):
            attendees.removeAll { $0.id == attendanceId }
            presentCount = count
        }
    }
}
