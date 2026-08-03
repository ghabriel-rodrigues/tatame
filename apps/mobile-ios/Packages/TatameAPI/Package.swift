// swift-tools-version: 6.0
import PackageDescription

// Networking stack per ticket 02: apple/swift-openapi-generator as an SPM
// build plugin over the committed spec copy (Sources/TatameAPI/openapi.json,
// synced via scripts/sync-openapi.sh), URLSession transport, zero
// third-party (non-Apple) dependencies. Generated code lands in the build
// directory — never in git. CI note: xcodebuild needs
// `-skipPackagePluginValidation` (SPM CLI builds need nothing).
let package = Package(
    name: "TatameAPI",
    // macOS floor exists only so `swift test` runs SPM-level on the mac host.
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "TatameAPI", targets: ["TatameAPI"])
    ],
    dependencies: [
        // Ticket 01 dependency direction: TatameAPI -> TatameCore.
        .package(path: "../TatameCore"),
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.0.0"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.0.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "TatameAPI",
            dependencies: [
                .product(name: "TatameCore", package: "TatameCore"),
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ],
            plugins: [
                .plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")
            ]
        ),
        .testTarget(name: "TatameAPITests", dependencies: ["TatameAPI"]),
    ],
    swiftLanguageModes: [.v6]
)
