// Professor turma detail (handoff professor-08): stat tiles (alunos count,
// frequência as an explicit Fase-4 placeholder, ocupação), the live/manual
// chamada entry points (spec 004), and the roster with Adicionar aluno and
// remove-with-confirm. PT-BR copy; Lumira tokens only.

import AttendanceFeature
import DesignSystem
import GraduationFeature
import SwiftUI
import TatameCore

public struct TurmaDetailView: View {
    @Environment(\.enrollmentRepository) private var repository
    @Environment(\.attendanceRepository) private var attendanceRepository
    @State private var model: TurmaDetailModel?
    private let classId: UUID

    public init(classId: UUID) {
        self.classId = classId
    }

    public var body: some View {
        Group {
            if let model {
                TurmaDetailContent(model: model)
            } else {
                ThemedColors.bgApp
            }
        }
        .task {
            if model == nil {
                let created = TurmaDetailModel(
                    classId: classId,
                    repository: repository,
                    attendanceRepository: attendanceRepository
                )
                model = created
                await created.load()
            }
        }
    }
}

struct TurmaDetailContent: View {
    @Bindable var model: TurmaDetailModel
    @Environment(\.tatameTheme) private var theme
    @Environment(\.attendanceRepository) private var attendanceRepository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                switch model.phase {
                case .idle, .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LumiraTokens.Space.s12)
                case .failed(let message):
                    EnrollmentErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                    .padding(.top, LumiraTokens.Space.s6)
                case .loaded(let detail):
                    header(detail.summary)
                    statTiles(detail)
                    chamadaActions
                    if let actionError = model.actionError {
                        actionErrorBanner(actionError)
                    }
                    rosterSection(detail)
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .navigationTitle(model.detail?.summary.name ?? "")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .navigationDestination(for: StudentProfileRoute.self) { route in
            StudentProfileView(studentId: route.studentId)
        }
        .sheet(isPresented: $model.showAddSheet) {
            if let detail = model.detail {
                AddStudentSheet(model: model, turmaName: detail.summary.name)
                    .presentationDetents([.medium, .large])
            }
        }
        .sheet(isPresented: $model.showLiveChamada) {
            LiveChamadaSheet(classId: model.classId, repository: attendanceRepository)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $model.showRollCall) {
            RollCallSheet(classId: model.classId, repository: attendanceRepository)
                .presentationDetents([.large])
        }
        .confirmationDialog(
            "Remover aluno",
            isPresented: removalBinding,
            titleVisibility: .visible
        ) {
            Button("Remover da turma", role: .destructive) {
                Task { await model.confirmRemove() }
            }
            Button("Cancelar", role: .cancel) {
                model.cancelRemove()
            }
        } message: {
            if let candidate = model.removalCandidate {
                Text("Remover \(candidate.fullName) da turma? A matrícula pode ser reativada depois.")
            }
        }
    }

    // MARK: Header

    private func header(_ summary: ClassSummary) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
            HStack(spacing: LumiraTokens.Space.s2) {
                Text(summary.schedules.scheduleLinePTBR)
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fg4)
                if summary.lotada {
                    EnrollmentChip(text: "Lotada", style: .danger)
                }
            }
        }
        .padding(.top, LumiraTokens.Space.s2)
    }

    // MARK: Stat tiles (handoff professor-08; per-turma frequência belongs
    // to the reports slice — explicit placeholder)

    private func statTiles(_ detail: ClassDetail) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            StatTile(value: "\(detail.summary.occupancy)", label: "alunos")
            StatTile(value: "—", label: "frequência", footnote: "Relatórios")
            StatTile(value: occupancyPercent(detail.summary), label: "ocupação")
        }
    }

    private func occupancyPercent(_ summary: ClassSummary) -> String {
        guard summary.capacity > 0 else { return "0%" }
        return "\(Int((Double(summary.occupancy) / Double(summary.capacity) * 100).rounded()))%"
    }

    /// Chamada entry points (spec 004, ATT.23/24): live code/QR chamada and
    /// the manual roll call.
    private var chamadaActions: some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            Button {
                model.showLiveChamada = true
            } label: {
                Text("Fazer chamada de hoje")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(
                        LinearGradient(
                            colors: [
                                theme.color("purple-700") ?? ThemedColors.purple700,
                                theme.color("purple-500") ?? ThemedColors.purple500,
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier("chamada-ao-vivo-button")

            Button {
                model.showRollCall = true
            } label: {
                Text("Chamada manual")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.inkPurple)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(ThemedColors.purple100)
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier("chamada-manual-button")
        }
    }

    private func actionErrorBanner(_ message: String) -> some View {
        Text(message)
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(ThemedColors.danger500)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LumiraTokens.Space.s3)
            .background(ThemedColors.danger100)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            .accessibilityIdentifier("roster-action-error")
    }

    // MARK: Roster

    private func rosterSection(_ detail: ClassDetail) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            HStack {
                Text("Alunos")
                    .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                Spacer()
                Button {
                    model.openAddSheet()
                    Task { await model.loadCandidates() }
                } label: {
                    Text("Adicionar aluno")
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        .foregroundStyle(ThemedColors.fgOnColor)
                        .padding(.horizontal, LumiraTokens.Space.s3)
                        .padding(.vertical, LumiraTokens.Space.s2)
                        .background(ThemedColors.inkPurple)
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("add-student-button")
            }
            .padding(.top, LumiraTokens.Space.s2)

            if detail.roster.isEmpty {
                Text("Nenhum aluno matriculado ainda.")
                    .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                    .foregroundStyle(ThemedColors.fg3)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, LumiraTokens.Space.s8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(detail.roster.enumerated()), id: \.element.id) { index, student in
                        // Row tap → perfil do aluno (spec 005, GRD.23).
                        NavigationLink(value: StudentProfileRoute(studentId: student.studentId)) {
                            RosterRow(student: student) {
                                model.askRemove(student)
                            }
                        }
                        .buttonStyle(.plain)
                        if index < detail.roster.count - 1 {
                            Divider().overlay(ThemedColors.border1)
                        }
                    }
                }
                .background(ThemedColors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .strokeBorder(ThemedColors.border1, lineWidth: 1)
                )
            }
        }
    }

    private var removalBinding: Binding<Bool> {
        Binding(
            get: { model.removalCandidate != nil },
            set: { presented in
                if !presented {
                    model.cancelRemove()
                }
            }
        )
    }
}

/// Roster row (handoff professor-08): avatar initials, name, Pendente badge,
/// remove button. Per-student presence stats are Phase 4 — the subtitle
/// shows the age instead of fake numbers.
struct RosterRow: View {
    let student: RosterStudent
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            AvatarCircle(initials: NameInitials.from(student.fullName))

            VStack(alignment: .leading, spacing: 2) {
                Text(student.fullName)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                HStack(spacing: LumiraTokens.Space.s2) {
                    // Derived belt (spec 005 — the Phase-3 chip deferral).
                    if let belt = student.belt {
                        BeltBar(
                            colorSlug: belt.colorSlug,
                            tipColorSlug: belt.tipColorSlug,
                            degrees: belt.degrees,
                            maxDegrees: belt.maxDegrees,
                            size: .sm
                        )
                        .frame(width: 44)
                    }
                    if let ageLabel = BirthDates.ageLabelPTBR(fromISO: student.birthDate) {
                        Text(ageLabel)
                            .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                            .foregroundStyle(ThemedColors.fg4)
                    }
                }
            }

            Spacer()

            if student.badge == .pendente {
                EnrollmentChip(text: "Pendente", style: .neutral)
            }

            Button(action: onRemove) {
                Image(systemName: "minus.circle")
                    .font(.system(size: LumiraTokens.FontSize.textMd))
                    .foregroundStyle(ThemedColors.fg4)
            }
            .accessibilityIdentifier("remove-student-\(student.studentId.uuidString.lowercased())")
        }
        .padding(.horizontal, LumiraTokens.Space.s4)
        .padding(.vertical, LumiraTokens.Space.s3)
    }
}

/// Stat tile (handoff professor-08).
struct StatTile: View {
    let value: String
    let label: String
    var footnote: String?

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(ThemedColors.fg1)
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(ThemedColors.fg4)
            if let footnote {
                Text(footnote)
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s3)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
    }
}

/// Avatar circle with initials (handoff rows).
struct AvatarCircle: View {
    let initials: String
    var size: CGFloat = 36

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.33, weight: .bold, design: .rounded))
            .foregroundStyle(ThemedColors.inkPurple)
            .frame(width: size, height: size)
            .background(ThemedColors.purple100)
            .clipShape(Circle())
    }
}
