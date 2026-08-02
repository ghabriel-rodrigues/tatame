# Auth & session storage

Type: grilling

## Question

How does the RN app store and refresh sessions — `expo-secure-store` for tokens (size limits, biometric gating?), access/refresh token lifecycle (silent refresh, clock skew, concurrent-request refresh locking), session restoration on cold start (splash → login vs splash → home per handoff), multi-tenant context in the session (academy binding), logout/suspension handling (academy suspension blocks access; delinquency → read-only mode), and how the auth state integrates with TanStack Query (query invalidation on login/logout, authenticated fetcher)?
