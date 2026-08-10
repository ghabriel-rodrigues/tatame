// swift-tools-version: 6.0
import PackageDescription

// One package, one library target per feature area (ticket 01, decision 4):
// AuthFeature (splash/login/chooser), EnrollmentFeature (professor turmas +
// responsável dependents, spec 003 ENR.24-26), AttendanceFeature (aluno
// check-in + professor chamada, spec 004 ATT.22-24), GraduationFeature
// (aluno Graduação + professor perfil do aluno/próprio, spec 005 GRD.21-23),
// BillingFeature (aluno Carteira + payment sheets + responsável Pagamentos,
// spec 006 BIL.22-24), EventsFeature (aluno event detail + responsável
// Eventos tab, spec 008 EVT.14-15), and AppShell (root router + persona
// shells). Dependency direction (enforced here): Features -> TatameAPI +
// TatameCore + DesignSystem; EnrollmentFeature -> AttendanceFeature (turma
// detail opens the chamada and the rewired Adicionar aluno picker) +
// GraduationFeature (roster tap opens the perfil do aluno); EventsFeature ->
// BillingFeature (paid inscriptions ride the existing Pix sheet + simulate).
let package = Package(
    name: "Features",
    // macOS floor exists only so `swift test` runs SPM-level on the mac host.
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AuthFeature", targets: ["AuthFeature"]),
        .library(name: "EnrollmentFeature", targets: ["EnrollmentFeature"]),
        .library(name: "AttendanceFeature", targets: ["AttendanceFeature"]),
        .library(name: "GraduationFeature", targets: ["GraduationFeature"]),
        .library(name: "BillingFeature", targets: ["BillingFeature"]),
        .library(name: "EventsFeature", targets: ["EventsFeature"]),
        .library(name: "AgendaFeature", targets: ["AgendaFeature"]),
        .library(name: "StoreFeature", targets: ["StoreFeature"]),
        .library(name: "NotificationsFeature", targets: ["NotificationsFeature"]),
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
            // Notifications slice (spec 010, NOT.12-13): the one bell +
            // Notificações screen + perfil switch shared by the three
            // shells; persona route mapping is injected by each shell.
            name: "NotificationsFeature",
            dependencies: [
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .target(
            name: "AttendanceFeature",
            dependencies: [
                // The home-header bell (spec 010) renders inside the aluno
                // Início and professor dashboard headers.
                "NotificationsFeature",
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
                // The responsável home header bell + internally pushed
                // Notificações screen (spec 010, NOT.13).
                "NotificationsFeature",
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .target(
            name: "BillingFeature",
            dependencies: [
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .target(
            // Events slice (spec 008, EVT.14-15): aluno event detail +
            // responsável Eventos tab. Depends on BillingFeature so paid
            // inscriptions reuse the existing Pix sheet + simulate rails.
            name: "EventsFeature",
            dependencies: [
                "BillingFeature",
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .target(
            // Agenda slice (spec 007, AGD.9-10): aluno Agenda tab + aluno/
            // professor month calendars. Depends on AttendanceFeature to
            // reopen the Phase-4 check-in sheet from agenda rows.
            name: "AgendaFeature",
            dependencies: [
                "AttendanceFeature",
                .product(name: "DesignSystem", package: "DesignSystem"),
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
        .target(
            // Store slice (spec 009, STO.14-15): the one storefront shared
            // by the aluno and professor shells (vitrine, product detail,
            // Meus pedidos). Depends on BillingFeature so "Comprar com Pix"
            // reuses the existing Pix sheet + simulate rails.
            name: "StoreFeature",
            dependencies: [
                "BillingFeature",
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
                "BillingFeature",
                "EventsFeature",
                "AgendaFeature",
                "StoreFeature",
                "NotificationsFeature",
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
                "BillingFeature",
                "EventsFeature",
                "AgendaFeature",
                "StoreFeature",
                "NotificationsFeature",
                "AppShell",
                .product(name: "TatameCore", package: "TatameCore"),
            ]
        ),
    ],
    swiftLanguageModes: [.v6]
)
