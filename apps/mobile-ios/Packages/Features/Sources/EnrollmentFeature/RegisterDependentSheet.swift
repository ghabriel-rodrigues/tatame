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
                        .foregroundStyle(ThemedColors.fg1)
                    Text("O cadastro nasce vinculado a você e à academia.")
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(ThemedColors.fg4)
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
                        .foregroundStyle(ThemedColors.danger500)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(LumiraTokens.Space.s3)
                        .background(ThemedColors.danger100)
                        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                        .accessibilityIdentifier("register-dependent-error")
                }

                if case .registered(let message) = model.phase {
                    Text(message)
                        .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                        .foregroundStyle(ThemedColors.success500)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(LumiraTokens.Space.s3)
                        .background(ThemedColors.success100)
                        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                        .accessibilityIdentifier("register-dependent-success")
                }

                submitButton
                    .padding(.bottom, LumiraTokens.Space.s6)
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(ThemedColors.bgApp)
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
                        .foregroundStyle(ThemedColors.inkPurple)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(model.suggestionAccepted ? ThemedColors.purple100 : .clear)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule().strokeBorder(ThemedColors.inkPurple, lineWidth: 1)
                        )
                    }
                    .accessibilityIdentifier("suggestion-chip")
                }
            } else {
                Text("Nenhuma turma com vaga para essa idade — o cadastro segue sem matrícula.")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fg3)
            }
        }
    }

    private var suggestionLabel: some View {
        Text("Turma sugerida pela idade")
            .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
            .foregroundStyle(ThemedColors.fg3)
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
                        .tint(ThemedColors.fgOnColor)
                } else {
                    Text("Cadastrar")
                        .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                }
            }
            .foregroundStyle(ThemedColors.fgOnColor)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
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
        .disabled(model.phase == .submitting)
        .accessibilityIdentifier("register-dependent-submit")
    }
}

/// Handoff field styling for the sheet (white surface, thin border).
private struct SheetFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(ThemedColors.fg1)
            .padding(.horizontal, LumiraTokens.Space.s4)
            .frame(height: 48)
            .background(ThemedColors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(ThemedColors.border1, lineWidth: 1)
            )
    }
}

private extension View {
    func sheetFieldStyle() -> some View {
        modifier(SheetFieldStyle())
    }
}
