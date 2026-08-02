# Project setup: Xcode + SwiftUI

Type: grilling

## Question

How is the iOS project scaffolded at `apps/mobile-ios` as an Xcode project **outside the nx build graph**? Decide: minimum iOS version (weigh SwiftUI API availability — e.g. NavigationStack needs 16+, Observation needs 17+, VisionKit DataScanner needs 16+ — against device coverage for gym users), Swift/Xcode version baseline, project generation approach (checked-in `.xcodeproj` vs XcodeGen/Tuist for merge-friendly project files), SPM for dependencies, target/module layout (single app target vs app + local SPM packages for design-system/networking/features), and — explicitly documented — how the Xcode world coexists with the nx/pnpm monorepo: git layout, `.gitignore`, what nx knows about it (nothing), and how CI invokes the build.
