// swift-tools-version: 6.0
import PackageDescription

// One package, one library target per feature area (ticket 01, decision 4):
// AuthFeature (splash/login/chooser) and AppShell (root router + persona
// shell scaffolds). Dependency direction (enforced here):
// Features -> TatameAPI + TatameCore + DesignSystem.
let package = Package(
    name: "Features",
    // macOS floor exists only so `swift test` runs SPM-level on the mac host.
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AuthFeature", targets: ["AuthFeature"]),
        .library(name: "AppShell", targets: ["AppShell"]),
    ],
    dependencies: [
        .package(path: "../DesignSystem"),
        .package(path: "../TatameCore"),
        .package(path: "../TatameAPI"),
    ],
    targets: [
        .target(
            name: "AuthFeature",
            dependencies: [
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
                .product(name: "TatameAPI", package: "TatameAPI"),
            ]
        ),
        .target(
            name: "AppShell",
            dependencies: [
                "AuthFeature",
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .testTarget(
            name: "FeaturesTests",
            dependencies: [
                "AuthFeature",
                "AppShell",
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
    ],
    swiftLanguageModes: [.v6]
)
