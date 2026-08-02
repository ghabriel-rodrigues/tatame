# CI for the iOS build

Type: research
Blocked by: 01, 07

## Question

How is the iOS app built and tested in CI, given ticket 01's decisions (XcodeGen manifest, gitignored `.xcodeproj`, local SPM packages, xcodebuild on macOS — fully outside the nx/docker pipeline)? Decide: runner (GitHub Actions `macos-*` vs self-hosted Mac), the job pipeline (`xcodegen generate` → `xcodebuild build`/`test` for the app scheme + package test targets), whether plain `xcodebuild` suffices or fastlane earns its keep at this stage (no signing/TestFlight needed until release), Xcode version pinning on the runner (match the `project.yml` toolchain pin), caching (SPM checkouts, DerivedData), triggering (path filter on `apps/mobile-ios/**` so web/backend commits don't burn macOS minutes), and how the workflow file coexists with the nx-driven workflows in `.github/workflows/`. Signing, TestFlight, and the asc-* release skills are out of scope until a release ticket exists.
