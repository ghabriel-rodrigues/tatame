// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "DesignSystem",
    // macOS floor exists only so `swift test` runs SPM-level on the mac host
    // (fast, no simulator); the app itself is iOS 17+.
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "DesignSystem", targets: ["DesignSystem"])
    ],
    targets: [
        .target(
            name: "DesignSystem",
            resources: [
                // .copy keeps the Fonts/ folder (TTFs + OFL license) intact so
                // FontLoader can enumerate Bundle.module's "Fonts" subdirectory.
                .copy("Resources/Fonts")
            ]
        ),
        .testTarget(
            name: "DesignSystemTests",
            dependencies: ["DesignSystem"],
            resources: [
                // .copy (not .process) so the golden fixtures stay byte-identical.
                .copy("Resources/palette-fixtures.json")
            ]
        ),
    ],
    swiftLanguageModes: [.v6]
)
