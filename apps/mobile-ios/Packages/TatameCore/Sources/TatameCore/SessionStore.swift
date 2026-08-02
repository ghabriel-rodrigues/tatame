// SessionStore — placeholder scaffold (ticket 06 conventions).
//
// Ticket 06: "session state is a @MainActor @Observable SessionStore in
// TatameCore, injected via environment at the root — the auth gate and the
// suspension/read-only routing switch on it." The real lifecycle (restore,
// Keychain refresh token, academy binding, logout/suspension UX) is ticket
// 04's scope and is NOT implemented here.

import Observation

/// Authentication/session state the root auth gate switches on.
public enum SessionState: Sendable, Equatable {
    /// App launch, session restoration not yet attempted.
    case unknown
    /// No valid session — show the auth flow.
    case signedOut
    /// Placeholder for an authenticated session (payload shape is ticket 04).
    case signedIn
}

/// Placeholder session store per ticket 06 conventions. Ticket 04 owns the
/// real implementation (restoration, refresh, tenant suspension routing).
@MainActor
@Observable
public final class SessionStore {
    public private(set) var state: SessionState = .unknown

    public init() {}
}
