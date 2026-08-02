# Testing strategy (iOS)

Type: grilling
Blocked by: 01, 06

## Question

What is the iOS testing pyramid: unit tests with Swift Testing (vs XCTest — consult `twostraws__Swift-Testing-Agent-Skill`), model/networking-layer tests (URLProtocol stubs, async test patterns), SwiftUI view testing approach (view-model/logic-level testing vs snapshot testing via pointfree's swift-snapshot-testing vs skipping view unit tests), and UI/E2E scope (XCUITest vs Maestro — shared with the other mobile apps' E2E choice?). Decide what "tested" means for the README feature-parity checklist on iOS (mandatory layers per mirrored feature slice), and how tests run headlessly in CI given the out-of-nx-graph Xcode setup.
