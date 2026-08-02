// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TatameCore",
    // macOS floor exists only so `swift test` runs SPM-level on the mac host.
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "TatameCore", targets: ["TatameCore"])
    ],
    targets: [
        .target(name: "TatameCore"),
        .testTarget(name: "TatameCoreTests", dependencies: ["TatameCore"]),
    ],
    swiftLanguageModes: [.v6]
)
