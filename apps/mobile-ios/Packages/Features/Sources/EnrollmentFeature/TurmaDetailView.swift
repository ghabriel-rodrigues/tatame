// Professor turma detail (handoff professor-08): stat tiles (alunos count,
// frequência as an explicit Fase-4 placeholder, ocupação), the disabled
// "Fazer chamada de hoje" placeholder, and the roster with Adicionar aluno
// and remove-with-confirm. PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct TurmaDetailView: View {
    @Environment(\.enrollmentRepository) private var repository
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
                LumiraTokens.Colors.bgApp
            }
        }
        .task {
            if model == nil {
                let created = TurmaDetailModel(classId: classId, repository: repository)
                model = created
                await created.load()
            }
        }
    }
}

struct TurmaDetailContent: View {
    @Bindable var model: TurmaDetailModel
    @Environment(\.tatameTheme) private var theme

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
                    chamadaPlaceholder
                    if let actionError = model.actionError {
                        actionErrorBanner(actionError)
                    }
                    rosterSection(detail)
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .navigationTitle(model.detail?.summary.name ?? "")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .sheet(isPresented: $model.showAddSheet) {
            if let detail = model.detail {
                AddStudentSheet(model: model, turmaName: detail.summary.name)
                    .presentationDetents([.medium, .large])
            }
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
                    .foregroundStyle(LumiraTokens.Colors.fg4)
                if summary.lotada {
                    EnrollmentChip(text: "Lotada", style: .danger)
                }
            }
        }
        .padding(.top, LumiraTokens.Space.s2)
    }

    // MARK: Stat tiles (handoff professor-08; frequência = Fase-4 placeholder)

    private func statTiles(_ detail: ClassDetail) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            StatTile(value: "\(detail.summary.occupancy)", label: "alunos")
            StatTile(value: "—", label: "frequência", footnote: "Fase 4")
            StatTile(value: occupancyPercent(detail.summary), label: "ocupação")
        }
    }

    private func occupancyPercent(_ summary: ClassSummary) -> String {
        guard summary.capacity > 0 else { return "0%" }
        return "\(Int((Double(summary.occupancy) / Double(summary.capacity) * 100).rounded()))%"
    }

    /// "Fazer chamada de hoje" is attendance (Phase 4) — explicit placeholder,
    /// never faked (spec 003 client scope).
    private var chamadaPlaceholder: some View {
        Text("Fazer chamada de hoje")
            .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fgOnColor)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(
                LinearGradient(
                    colors: [
                        theme.color("purple-700") ?? LumiraTokens.Colors.purple700,
                        theme.color("purple-500") ?? LumiraTokens.Colors.purple500,
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(Capsule())
            .opacity(0.4)
            .overlay(alignment: .trailing) {
                Text("Fase 4")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
                    .padding(.trailing, LumiraTokens.Space.s4)
            }
            .accessibilityIdentifier("chamada-placeholder")
    }

    private func actionErrorBanner(_ message: String) -> some View {
        Text(message)
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.danger500)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LumiraTokens.Space.s3)
            .background(LumiraTokens.Colors.danger100)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            .accessibilityIdentifier("roster-action-error")
    }

    // MARK: Roster

    private func rosterSection(_ detail: ClassDetail) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            HStack {
                Text("Alunos")
                    .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Spacer()
                Button {
                    model.openAddSheet()
                    Task { await model.loadCandidates() }
                } label: {
                    Text("Adicionar aluno")
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                        .padding(.horizontal, LumiraTokens.Space.s3)
                        .padding(.vertical, LumiraTokens.Space.s2)
                        .background(LumiraTokens.Colors.inkPurple)
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("add-student-button")
            }
            .padding(.top, LumiraTokens.Space.s2)

            if detail.roster.isEmpty {
                Text("Nenhum aluno matriculado ainda.")
                    .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, LumiraTokens.Space.s8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(detail.roster.enumerated()), id: \.element.id) { index, student in
                        RosterRow(student: student) {
                            model.askRemove(student)
                        }
                        if index < detail.roster.count - 1 {
                            Divider().overlay(LumiraTokens.Colors.border1)
                        }
                    }
                }
                .background(LumiraTokens.Colors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
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
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                if let ageLabel = BirthDates.ageLabelPTBR(fromISO: student.birthDate) {
                    Text(ageLabel)
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                }
            }

            Spacer()

            if student.badge == .pendente {
                EnrollmentChip(text: "Pendente", style: .neutral)
            }

            Button(action: onRemove) {
                Image(systemName: "minus.circle")
                    .font(.system(size: LumiraTokens.FontSize.textMd))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
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
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            if let footnote {
                Text(footnote)
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s3)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
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
            .foregroundStyle(LumiraTokens.Colors.inkPurple)
            .frame(width: size, height: size)
            .background(LumiraTokens.Colors.purple100)
            .clipShape(Circle())
    }
}
