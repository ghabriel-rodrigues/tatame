import Testing
@testable import TatameCore

@Suite("SessionStore scaffold")
struct SessionStoreTests {
    @Test("starts in unknown state")
    @MainActor
    func initialState() {
        #expect(SessionStore().state == .unknown)
    }
}
