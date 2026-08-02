// TatameAPI — stub only (ticket 02 is resolved but NOT implemented yet).
//
// Ticket 02 (.scratch/mobile-ios/issues/02-networking-api-client.md) fixes
// the stack: apple/swift-openapi-generator as SPM build plugin over the
// committed spec copy, URLSession transport, repository implementations
// conforming to protocols in TatameCore, AuthMiddleware + actor-based
// TokenRefreshCoordinator, one typed ApiError. None of that lands until the
// auth feature slice picks it up.

/// Namespace placeholder so the package has a buildable target.
public enum TatameAPI {
    /// Scaffold marker; replaced by the generated-client wiring per ticket 02.
    public static let isStub = true
}
