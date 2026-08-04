// "Cadastrar aluno" bottom sheet (handoff responsavel-08): nome + data de
// nascimento fields, the age-suggested class chip (fetched only after a
// valid birth date), and the Cadastrar CTA. PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

struct RegisterDependentSheet: View {
    @State private var model: RegisterDependentModel
    private let onRegistered: () -> Void
    @Environment(\.tatameTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    init(repository: any EnrollmentRepository, onRegistered: @escaping () -> Void) {
        _model = State(initialValue: RegisterDependentModel(repository: repository))
        self.onRegistered = onRegistered
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                    Text("Cadastrar aluno")
                        .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg1)
                    Text("O cadastro nasce vinculado a você e à academia.")
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                }
                .padding(.top, LumiraTokens.Space.s6)

                VStack(spacing: LumiraTokens.Space.s3) {
                    TextField("Nome completo", text: $model.fullName)
                        .textContentType(.name)
                        .sheetFieldStyle()
                        .accessibilityIdentifier("dependent-name-field")
                    TextField("Data de nascimento (dd/mm/aaaa)", text: $model.birthDateBR)
                        .sheetFieldStyle()
                        .accessibilityIdentifier("dependent-birthdate-field")
                        #if os(iOS)
                        .keyboardType(.numbersAndPunctuation)
                        #endif
                }

                suggestionSection

                if case .failed(let message) = model.phase {
                    Text(message)
                        .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.danger500)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(LumiraTokens.Space.s3)
                        .background(LumiraTokens.Colors.danger100)
                        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                        .accessibilityIdentifier("register-dependent-error")
                }

                if case .registered(let message) = model.phase {
                    Text(message)
                        .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.success500)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(LumiraTokens.Space.s3)
                        .background(LumiraTokens.Colors.success100)
                        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                        .accessibilityIdentifier("register-dependent-success")
                }

                submitButton
                    .padding(.bottom, LumiraTokens.Space.s6)
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(LumiraTokens.Colors.bgApp)
    }

    // MARK: Suggestion chip (fetched only after a valid birth date)

    @ViewBuilder
    private var suggestionSection: some View {
        switch model.suggestionPhase {
        case .idle, .failed:
            EmptyView()
        case .loading:
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                suggestionLabel
                ProgressView()
            }
        case .loaded(let suggestion):
            if let suggestion {
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                    suggestionLabel
                    Button {
                        model.suggestionAccepted.toggle()
                    } label: {
                        HStack(spacing: LumiraTokens.Space.s2) {
                            if model.suggestionAccepted {
                                Image(systemName: "checkmark")
                                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .bold))
                            }
                            Text("\(suggestion.name) · \(suggestion.schedules.suggestionLinePTBR)")
                                .font(.system(
                                    size: LumiraTokens.FontSize.textSm,
                                    weight: .semibold,
                                    design: .rounded
                                ))
                        }
                        .foregroundStyle(LumiraTokens.Colors.inkPurple)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(model.suggestionAccepted ? LumiraTokens.Colors.purple100 : .clear)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule().strokeBorder(LumiraTokens.Colors.inkPurple, lineWidth: 1)
                        )
                    }
                    .accessibilityIdentifier("suggestion-chip")
                }
            } else {
                Text("Nenhuma turma com vaga para essa idade — o cadastro segue sem matrícula.")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
            }
        }
    }

    private var suggestionLabel: some View {
        Text("Turma sugerida pela idade")
            .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg3)
    }

    // MARK: Submit

    private var submitButton: some View {
        Button {
            Task {
                if await model.register() != nil {
                    // Brief success beat, then hand back to the panel.
                    try? await Task.sleep(for: .seconds(0.8))
                    onRegistered()
                    dismiss()
                }
            }
        } label: {
            Group {
                if model.phase == .submitting {
                    ProgressView()
                        .tint(LumiraTokens.Colors.fgOnColor)
                } else {
                    Text("Cadastrar")
                        .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                }
            }
            .foregroundStyle(LumiraTokens.Colors.fgOnColor)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
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
        }
        .disabled(model.phase == .submitting)
        .accessibilityIdentifier("register-dependent-submit")
    }
}

/// Handoff field styling for the sheet (white surface, thin border).
private struct SheetFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg1)
            .padding(.horizontal, LumiraTokens.Space.s4)
            .frame(height: 48)
            .background(LumiraTokens.Colors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
            )
    }
}

private extension View {
    func sheetFieldStyle() -> some View {
        modifier(SheetFieldStyle())
    }
}
