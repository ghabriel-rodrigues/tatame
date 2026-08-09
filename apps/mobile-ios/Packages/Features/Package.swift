// swift-tools-version: 6.0
import PackageDescription

// One package, one library target per feature area (ticket 01, decision 4):
// AuthFeature (splash/login/chooser), EnrollmentFeature (professor turmas +
// responsável dependents, spec 003 ENR.24-26), AttendanceFeature (aluno
// check-in + professor chamada, spec 004 ATT.22-24), GraduationFeature
// (aluno Graduação + professor perfil do aluno/próprio, spec 005 GRD.21-23),
// and AppShell (root router + persona shells). Dependency direction
// (enforced here): Features -> TatameAPI + TatameCore + DesignSystem;
// EnrollmentFeature -> AttendanceFeature (turma detail opens the chamada and
// the rewired Adicionar aluno picker) + GraduationFeature (roster tap opens
// the perfil do aluno).
let package = Package(
    name: "Features",
    // macOS floor exists only so `swift test` runs SPM-level on the mac host.
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AuthFeature", targets: ["AuthFeature"]),
        .library(name: "EnrollmentFeature", targets: ["EnrollmentFeature"]),
        .library(name: "AttendanceFeature", targets: ["AttendanceFeature"]),
        .library(name: "GraduationFeature", targets: ["GraduationFeature"]),
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
            name: "AttendanceFeature",
            dependencies: [
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .target(
            name: "GraduationFeature",
            dependencies: [
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .target(
            name: "EnrollmentFeature",
            dependencies: [
                "AttendanceFeature",
                "GraduationFeature",
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .target(
            name: "AppShell",
            dependencies: [
                "AuthFeature",
                "AttendanceFeature",
                "EnrollmentFeature",
                "GraduationFeature",
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .testTarget(
            name: "FeaturesTests",
            dependencies: [
                "AuthFeature",
                "AttendanceFeature",
                "EnrollmentFeature",
                "GraduationFeature",
                "AppShell",
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
    ],
    swiftLanguageModes: [.v6]
)
