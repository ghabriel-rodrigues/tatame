// Professor "Perfil do aluno" (handoff professor-11): header with avatar and
// belt line, the drawn BeltBar with progress toward the next milestone,
// Adicionar grau / Promover faixa (confirmation alerts with an optional
// observação; hidden when the admin turned the graduation.update toggle
// off), the Phase-4 stat tiles ("Paga mensalidade" stays a billing-slice
// placeholder), and the persistent Observações section. PT-BR copy; Lumira
// tokens only.

import DesignSystem
import SwiftUI
import TatameCore

/// Navigation value for pushing the perfil do aluno from any roster row.
public struct StudentProfileRoute: Hashable, Sendable {
    public let studentId: UUID

    public init(studentId: UUID) {
        self.studentId = studentId
    }
}

public struct StudentProfileView: View {
    @Environment(\.graduationRepository) private var repository
    @Environment(SessionStore.self) private var session
    @State private var model: StudentProfileModel?
    private let studentId: UUID

    public init(studentId: UUID) {
        self.studentId = studentId
    }

    public var body: some View {
        Group {
            if let model {
                StudentProfileContent(model: model)
            } else {
                LumiraTokens.Colors.bgApp
            }
        }
        .task {
            if model == nil {
                // Client-side mirror of the admin toggle (default allowed);
                // the server guard chain is the enforcement (story 15).
                let canAward: Bool =
                    if case .signedIn(let context) = session.state {
                        context.permission(PermissionKey.graduationUpdate, default: true)
                    } else {
                        false
                    }
                let created = StudentProfileModel(
                    studentId: studentId,
                    canAward: canAward,
                    repository: repository
                )
                model = created
                await created.load()
            }
        }
    }
}

struct StudentProfileContent: View {
    @Bindable var model: StudentProfileModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                switch model.phase {
                case .idle, .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LumiraTokens.Space.s12)
                case .failed(let message):
                    GraduationErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                    .padding(.top, LumiraTokens.Space.s6)
                case .loaded(let profile):
                    header(profile)
                    graduationCard(profile)
                    if let actionError = model.actionError {
                        GraduationActionErrorBanner(message: actionError)
                    }
                    statTiles(profile.stats)
                    notesSection(profile)
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .navigationTitle("Perfil do aluno")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .alert(
            model.pendingAward == .belt ? "Promover faixa" : "Adicionar grau",
            isPresented: pendingBinding
        ) {
            TextField("Observação (opcional)", text: $model.awardNotesDraft)
            Button("Confirmar") {
                Task { await model.confirmAward() }
            }
            Button("Cancelar", role: .cancel) {
                model.cancelAward()
            }
        } message: {
            if let message = model.confirmationMessagePTBR {
                Text(message)
            }
        }
    }

    private var pendingBinding: Binding<Bool> {
        Binding(
            get: { model.pendingAward != nil },
            set: { presented in
                if !presented {
                    model.cancelAward()
                }
            }
        )
    }

    // MARK: Header

    private func header(_ profile: StudentProfile) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            GraduationAvatar(initials: GraduationInitials.from(profile.student.fullName))
            VStack(alignment: .leading, spacing: 2) {
                Text(profile.student.fullName)
                    .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Text(GraduationFormatters.chipLabelPTBR(belt: profile.belt))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
            Spacer()
            if profile.student.badge == .pendente {
                Text("Pendente")
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .padding(.horizontal, LumiraTokens.Space.s2)
                    .padding(.vertical, LumiraTokens.Space.s1)
                    .background(LumiraTokens.Colors.bgSunken)
                    .clipShape(Capsule())
            }
        }
        .padding(.top, LumiraTokens.Space.s2)
    }

    // MARK: Graduation card (stories 9-15)

    private func graduationCard(_ profile: StudentProfile) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            BeltBar(
                colorSlug: profile.belt.colorSlug,
                tipColorSlug: profile.belt.tipColorSlug,
                degrees: profile.belt.degrees,
                maxDegrees: profile.belt.maxDegrees,
                size: .md
            )
            HStack(alignment: .firstTextBaseline) {
                Text(GraduationFormatters.chipLabelPTBR(belt: profile.belt))
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                Spacer()
                Text(GraduationFormatters.progressCaptionPTBR(profile.progress))
                    .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
                    .accessibilityIdentifier("student-progress-caption")
            }
            GraduationProgressBar(fraction: profile.progress.fraction)

            if model.canAward {
                HStack(spacing: LumiraTokens.Space.s3) {
                    Button {
                        model.askAward(.degree)
                    } label: {
                        Text("Adicionar grau")
                            .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                            .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .background(LumiraTokens.Colors.inkPurple)
                            .clipShape(Capsule())
                    }
                    .disabled(!model.canAddDegree || model.awarding)
                    .opacity(model.canAddDegree ? 1 : 0.45)
                    .accessibilityIdentifier("adicionar-grau-button")

                    Button {
                        model.askAward(.belt)
                    } label: {
                        Text("Promover faixa")
                            .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                            .foregroundStyle(LumiraTokens.Colors.inkPurple)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .background(LumiraTokens.Colors.bgSurface)
                            .overlay(
                                Capsule().strokeBorder(LumiraTokens.Colors.border2, lineWidth: 1)
                            )
                            .clipShape(Capsule())
                    }
                    .disabled(!model.canPromoteBelt || model.awarding)
                    .opacity(model.canPromoteBelt ? 1 : 0.45)
                    .accessibilityIdentifier("promover-faixa-button")
                }
                .padding(.top, LumiraTokens.Space.s1)
            }
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }

    // MARK: Stat tiles (story 16; mensalidade is billing-slice territory)

    private func statTiles(_ stats: AlunoStats) -> some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            ProfileStatTile(value: "\(Int(stats.monthPresencePct.rounded()))%", label: "frequência")
            ProfileStatTile(value: "\(stats.monthAttendedSessions)", label: "aulas no mês")
            ProfileStatTile(value: "—", label: "mensalidade", footnote: "Financeiro")
        }
    }

    // MARK: Observações (stories 18-19)

    private func notesSection(_ profile: StudentProfile) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            Text("Observações")
                .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
                .padding(.top, LumiraTokens.Space.s2)

            ForEach(profile.notes) { note in
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                    Text(note.body)
                        .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg2)
                    Text(GraduationFormatters.noteMetaPTBR(note))
                        .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                }
                .padding(LumiraTokens.Space.s4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LumiraTokens.Colors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
                )
            }

            HStack(spacing: LumiraTokens.Space.s2) {
                TextField("Nova observação", text: $model.noteDraft, axis: .vertical)
                    .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                    .padding(.horizontal, LumiraTokens.Space.s3)
                    .padding(.vertical, LumiraTokens.Space.s2)
                    .background(LumiraTokens.Colors.bgSurface)
                    .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                            .strokeBorder(LumiraTokens.Colors.border2, lineWidth: 1)
                    )
                    .accessibilityIdentifier("nova-observacao-field")
                Button {
                    Task { await model.saveNote() }
                } label: {
                    Text("Salvar")
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                        .padding(.horizontal, LumiraTokens.Space.s4)
                        .frame(height: 38)
                        .background(LumiraTokens.Colors.inkPurple)
                        .clipShape(Capsule())
                }
                .disabled(!model.canSaveNote)
                .opacity(model.canSaveNote ? 1 : 0.45)
                .accessibilityIdentifier("salvar-observacao-button")
            }
        }
    }
}

/// Perfil stat tile (handoff professor-11).
struct ProfileStatTile: View {
    let value: String
    let label: String
    var footnote: String?

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            if let footnote {
                Text(footnote)
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
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
