// Token storage seams (ticket 02 fixes the primitives; ticket 04 the wiring):
// refresh token in the Keychain (when-unlocked, this-device-only), access
// token in memory inside the refresh coordinator (TatameAPI).

import Foundation
import Security

/// Persistence seam for the rotating refresh token. Implemented by the
/// Keychain in production and by in-memory fakes in tests.
public protocol RefreshTokenStore: Sendable {
    func loadRefreshToken() throws -> String?
    func storeRefreshToken(_ token: String) throws
    func clearRefreshToken() throws
}

/// In-memory holder for the access token; the TatameAPI refresh coordinator
/// conforms. `SessionStore` writes through this seam after login/switch.
public protocol AccessTokenStore: Sendable {
    func setAccessToken(_ token: String?) async
}

/// Errors surfaced by the Keychain-backed store.
public struct KeychainError: Error, Sendable, Equatable {
    public let status: OSStatus

    public init(status: OSStatus) {
        self.status = status
    }
}

/// Thin Keychain client for the refresh token. Fixed policy (ticket 02, not
/// relitigatable): `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — never
/// synced, never restored to a new device.
public struct KeychainRefreshTokenStore: RefreshTokenStore {
    private let service: String
    private let account: String

    public init(service: String = "app.tatame.ios.auth", account: String = "refresh-token") {
        self.service = service
        self.account = account
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    public func loadRefreshToken() throws -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError(status: status)
        }
    }

    public func storeRefreshToken(_ token: String) throws {
        let data = Data(token.utf8)
        var attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        var addQuery = baseQuery
        addQuery.merge(attributes) { _, new in new }
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus != errSecSuccess else { return }
        guard addStatus == errSecDuplicateItem else { throw KeychainError(status: addStatus) }
        attributes[kSecAttrAccessible as String] = nil
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        guard updateStatus == errSecSuccess else { throw KeychainError(status: updateStatus) }
    }

    public func clearRefreshToken() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError(status: status)
        }
    }
}
