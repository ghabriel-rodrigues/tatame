# Auth & session: Keychain + token refresh

Type: grilling
Blocked by: 02

## Question

How does the iOS app store and refresh sessions? Decide: Keychain usage for tokens (access group, `kSecAttrAccessible` policy, raw Security API vs a thin wrapper), access/refresh lifecycle wired into the chosen networking stack (single-flight refresh under structured concurrency, retry-once-on-401), session restoration on cold start (splash → login vs home per handoff), multi-tenant academy binding in the session, logout/suspension/read-only handling (academy suspension blocks access; delinquency → read-only mode), and how auth state propagates to SwiftUI (observable session store injected via the environment).
