# Auth & session storage

Type: grilling
Blocked by: 02

## Question

How does the Android app store and refresh sessions? Decide: token storage (Jetpack DataStore + encryption — given `EncryptedSharedPreferences` deprecation, Keystore-backed encryption of a DataStore vs Keystore-wrapped keys), access/refresh lifecycle wired into the chosen HTTP client (authenticator/interceptor or Ktor Auth plugin, single-flight refresh), session restoration on cold start (splash → login vs home), multi-tenant academy binding in the session, logout/suspension/read-only handling (academy suspension blocks access; delinquency → read-only mode), and how auth state propagates to the UI layer (session holder exposed as a flow).
