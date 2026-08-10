// Perfil "Notificações" switch model (spec 010, story 9): reads the active
// membership's notifications_enabled flag, flips it optimistically and
// reverts on failure. Mute silences the badge; rows keep being written
// server-side (the feed doubles as the receipt trail).

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class NotificationsSettingsModel {
    /// Nil until the first load answers — the switch renders disabled.
    public private(set) var enabled: Bool?
    public private(set) var saving = false
    public private(set) var errorMessage: String?

    @ObservationIgnored private let repository: any NotificationsRepository

    public init(repository: any NotificationsRepository) {
        self.repository = repository
    }

    public func load() async {
        guard enabled == nil else { return }
        do {
            enabled = try await repository.settingsEnabled()
            errorMessage = nil
        } catch {
            // Row stays disabled; the perfil surface never blocks on it.
            errorMessage = NotificationsMessages.loadFailed
        }
    }

    /// Switch flip → PUT; the server echo is truth, failure reverts.
    public func setEnabled(_ newValue: Bool) async {
        guard let current = enabled, current != newValue, !saving else { return }
        saving = true
        enabled = newValue
        errorMessage = nil
        defer { saving = false }
        do {
            enabled = try await repository.updateSettings(enabled: newValue)
        } catch {
            enabled = current
            errorMessage = NotificationsMessages.settingsFailed
        }
    }
}
