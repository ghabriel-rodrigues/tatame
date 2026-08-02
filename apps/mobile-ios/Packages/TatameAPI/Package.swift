// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TatameAPI",
    // macOS floor exists only so `swift test` runs SPM-level on the mac host.
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "TatameAPI", targets: ["TatameAPI"])
    ],
    dependencies: [
        // Ticket 01 dependency direction: TatameAPI -> TatameCore.
        .package(path: "../TatameCore")
    ],
    targets: [
        .target(
            name: "TatameAPI",
            dependencies: [.product(name: "TatameCore", package: "TatameCore")]
        )
    ],
    swiftLanguageModes: [.v6]
)
