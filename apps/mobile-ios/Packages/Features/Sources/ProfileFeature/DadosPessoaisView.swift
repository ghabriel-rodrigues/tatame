// Aluno Dados pessoais (handoff aluno-18): avatar + "Trocar foto"
// placeholder, IDENTIFICAÇÃO / CONTATO / ENDEREÇO / CONTATO DE EMERGÊNCIA
// sections, locked CPF/RG as dashed lock boxes (editable inputs while
// empty), read-only email and birth date, the single "Cidade / UF" input +
// CEP row, and Salvar in the header driving the partial PUT with per-field
// errors. The locked boxes render the full masked value — the prototype's
// clipped CPF text is a design bug, not recreated. PT-BR copy; Lumira
// tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct DadosPessoaisView: View {
    @Environment(\.profileRepository) private var repository
    @State private var model: DadosPessoaisModel?
    private let fullNameFallback: String

    public init(fullNameFallback: String = "") {
        self.fullNameFallback = fullNameFallback
    }

    public var body: some View {
        Group {
            if let model {
                DadosPessoaisContent(model: model, fullNameFallback: fullNameFallback)
            } else {
                ThemedColors.bgApp
            }
        }
        .task {
            if model == nil {
                let created = DadosPessoaisModel(repository: repository)
                model = created
                await created.load()
            }
        }
    }
}

struct DadosPessoaisContent: View {
    @Bindable var model: DadosPessoaisModel
    let fullNameFallback: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    ProfileErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                    .padding(.top, LumiraTokens.Space.s6)
                case .loaded:
                    avatarRow
                    if model.saved {
                        savedBanner
                    }
                    if let bannerError = model.bannerError {
                        Text(bannerError)
                            .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                            .foregroundStyle(ThemedColors.danger500)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(LumiraTokens.Space.s3)
                            .background(ThemedColors.danger100)
                            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                            .accessibilityIdentifier("profile-banner-error")
                    }
                    identificacaoSection
                    contatoSection
                    enderecoSection
                    emergenciaSection
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .navigationTitle("Dados pessoais")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                salvarButton
            }
        }
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            ForEach(0..<5, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(ThemedColors.bgSunken)
                    .frame(height: 52)
            }
        }
        .redacted(reason: .placeholder)
        .padding(.top, LumiraTokens.Space.s4)
    }

    // MARK: Header actions

    private var salvarButton: some View {
        Button {
            Task { await model.save() }
        } label: {
            if model.saving {
                ProgressView()
            } else {
                Text("Salvar")
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(ThemedColors.fgOnColor)
                    .padding(.horizontal, LumiraTokens.Space.s4)
                    .frame(height: 30)
                    .background(ThemedColors.purple700)
                    .clipShape(Capsule())
            }
        }
        .disabled(model.saving || model.phase != .loaded)
        .accessibilityIdentifier("dados-salvar-button")
    }

    private var savedBanner: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: "checkmark.circle.fill")
            Text(ProfileMessages.saved)
        }
        .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .semibold))
        .foregroundStyle(ThemedColors.success500)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s3)
        .background(ThemedColors.success100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
        .accessibilityIdentifier("profile-saved-banner")
    }

    // MARK: Avatar + Trocar foto placeholder (story 27)

    private var avatarRow: some View {
        HStack(spacing: LumiraTokens.Space.s4) {
            ProfileAvatar(name: model.fullName.isEmpty ? fullNameFallback : model.fullName)
            // Rendered as the placeholder it is (upload is recorded debt).
            Text(ProfileMessages.photoPlaceholder)
                .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                .foregroundStyle(ThemedColors.fg4)
                .padding(.horizontal, LumiraTokens.Space.s3)
                .padding(.vertical, LumiraTokens.Space.s1)
                .overlay(Capsule().strokeBorder(ThemedColors.border1, lineWidth: 1))
                .accessibilityIdentifier("trocar-foto-placeholder")
            Spacer()
        }
        .padding(.top, LumiraTokens.Space.s2)
    }

    // MARK: Identificação (stories 22-24)

    private var identificacaoSection: some View {
        ProfileSection(title: "Identificação") {
            ProfileField(
                text: $model.fullName,
                placeholder: "Nome completo",
                error: model.fieldError("fullName"),
                identifier: "dados-nome",
                onEdit: model.markEdited
            )
            HStack(alignment: .top, spacing: LumiraTokens.Space.s3) {
                // Read-only identity facts (story 23).
                ProfileReadOnlyBox(value: model.birthDateBR.isEmpty ? "—" : model.birthDateBR, identifier: "dados-nascimento")
                genderPicker
            }
            HStack(alignment: .top, spacing: LumiraTokens.Space.s3) {
                documentBox(
                    label: "CPF",
                    locked: model.cpfLocked,
                    lockedValue: model.lockedCpfMasked,
                    text: $model.cpfInput,
                    error: model.fieldError("cpf"),
                    identifier: "dados-cpf"
                )
                documentBox(
                    label: "RG",
                    locked: model.rgLocked,
                    lockedValue: model.lockedRg,
                    text: $model.rgInput,
                    error: model.fieldError("rg"),
                    identifier: "dados-rg"
                )
            }
        }
    }

    private var genderPicker: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
            Menu {
                ForEach(Gender.allCases, id: \.self) { option in
                    Button(option.labelPTBR) {
                        model.gender = option
                        model.markEdited()
                    }
                }
            } label: {
                HStack {
                    Text(model.gender?.labelPTBR ?? "Gênero")
                        .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                        .foregroundStyle(model.gender == nil ? ThemedColors.fg4 : ThemedColors.fg1)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                        .foregroundStyle(ThemedColors.fg4)
                }
                .padding(.horizontal, LumiraTokens.Space.s3)
                .frame(height: 44)
                .background(ThemedColors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                        .strokeBorder(ThemedColors.border1, lineWidth: 1)
                )
            }
            .accessibilityIdentifier("dados-genero")
            if let error = model.fieldError("gender") {
                ProfileFieldError(message: error)
            }
        }
    }

    /// CPF/RG box: dashed lock box once set (aluno-18), editable input while
    /// empty — the write-once story rendered honestly.
    @ViewBuilder
    private func documentBox(
        label: String,
        locked: Bool,
        lockedValue: String,
        text: Binding<String>,
        error: String?,
        identifier: String
    ) -> some View {
        if locked {
            ProfileLockedBox(label: label, value: lockedValue, identifier: identifier)
        } else {
            ProfileField(
                text: text,
                placeholder: label,
                error: error,
                identifier: identifier,
                onEdit: model.markEdited
            )
        }
    }

    // MARK: Contato

    private var contatoSection: some View {
        ProfileSection(title: "Contato") {
            // Read-only login identity (story 23).
            ProfileReadOnlyBox(value: model.email, identifier: "dados-email")
            ProfileField(
                text: $model.phone,
                placeholder: "Telefone",
                error: model.fieldError("phone"),
                identifier: "dados-telefone",
                onEdit: model.markEdited
            )
        }
    }

    // MARK: Endereço (story 24 — Cidade / UF single input + CEP)

    private var enderecoSection: some View {
        ProfileSection(title: "Endereço") {
            ProfileField(
                text: $model.addressLine,
                placeholder: "Rua, número, complemento",
                error: model.fieldError("addressLine"),
                identifier: "dados-endereco",
                onEdit: model.markEdited
            )
            HStack(alignment: .top, spacing: LumiraTokens.Space.s3) {
                ProfileField(
                    text: $model.cityUF,
                    placeholder: "Cidade / UF",
                    error: model.fieldError("addressCity", "addressState"),
                    identifier: "dados-cidade-uf",
                    onEdit: model.markEdited
                )
                ProfileField(
                    text: $model.cep,
                    placeholder: "CEP",
                    error: model.fieldError("addressZip"),
                    identifier: "dados-cep",
                    onEdit: model.markEdited
                )
            }
        }
    }

    // MARK: Contato de emergência

    private var emergenciaSection: some View {
        ProfileSection(title: "Contato de emergência") {
            ProfileField(
                text: $model.emergencyName,
                placeholder: "Nome do contato",
                error: model.fieldError("emergencyContactName"),
                identifier: "dados-emergencia-nome",
                onEdit: model.markEdited
            )
            ProfileField(
                text: $model.emergencyPhone,
                placeholder: "Telefone do contato",
                error: model.fieldError("emergencyContactPhone"),
                identifier: "dados-emergencia-telefone",
                onEdit: model.markEdited
            )
        }
    }
}

// MARK: - Section + field chrome (aluno-18)

/// Caption-labeled section ("IDENTIFICAÇÃO", ...).
struct ProfileSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            Text(title.uppercased())
                .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                .tracking(LumiraTokens.FontSize.text2xs * LumiraTokens.Tracking.caps)
                .foregroundStyle(ThemedColors.fg4)
                .padding(.top, LumiraTokens.Space.s2)
            content
        }
    }
}

/// One editable input with its error line. Typing marks the form edited
/// only through user interaction (`onEdit` fires from the focused field),
/// never from programmatic repopulation after a save.
struct ProfileField: View {
    @Binding var text: String
    let placeholder: String
    var error: String?
    var identifier: String
    var onEdit: () -> Void = {}
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
            TextField(placeholder, text: $text)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                .foregroundStyle(ThemedColors.fg1)
                .autocorrectionDisabled()
                .focused($focused)
                .padding(.horizontal, LumiraTokens.Space.s3)
                .frame(height: 44)
                .background(ThemedColors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                        .strokeBorder(
                            error == nil ? ThemedColors.border1 : ThemedColors.danger500,
                            lineWidth: 1
                        )
                )
                .accessibilityIdentifier(identifier)
                .onChange(of: text) { _, _ in
                    if focused { onEdit() }
                }
            if let error {
                ProfileFieldError(message: error)
                    .accessibilityIdentifier("\(identifier)-error")
            }
        }
    }
}

/// Per-field PT-BR validation message.
struct ProfileFieldError: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
            .foregroundStyle(ThemedColors.danger500)
    }
}

/// Read-only identity fact (email, data de nascimento) — sunken, no border,
/// visually not an input.
struct ProfileReadOnlyBox: View {
    let value: String
    var identifier: String

    var body: some View {
        Text(value)
            .font(.quicksand(size: LumiraTokens.FontSize.textSm))
            .foregroundStyle(ThemedColors.fg3)
            .lineLimit(1)
            .padding(.horizontal, LumiraTokens.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 44)
            .background(ThemedColors.bgSunken)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            .accessibilityIdentifier(identifier)
    }
}

/// The aluno-18 locked document box: dashed border, "CPF · 123.456.789-00"
/// and the lock icon. The full masked value renders (the prototype clips
/// it — a design bug, not recreated).
struct ProfileLockedBox: View {
    let label: String
    let value: String
    var identifier: String

    var body: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Text("\(label) · \(value)")
                .font(.quicksand(size: LumiraTokens.FontSize.textXs))
                .foregroundStyle(ThemedColors.fg4)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Spacer(minLength: 0)
            Image(systemName: "lock")
                .font(.system(size: LumiraTokens.FontSize.textXs))
                .foregroundStyle(ThemedColors.fg4)
        }
        .padding(.horizontal, LumiraTokens.Space.s3)
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .background(ThemedColors.bgSunken.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                .strokeBorder(
                    ThemedColors.border1,
                    style: StrokeStyle(lineWidth: 1, dash: [4, 3])
                )
        )
        .accessibilityIdentifier("\(identifier)-locked")
    }
}

/// Initials avatar (pink→purple gradient per aluno-18).
struct ProfileAvatar: View {
    let name: String

    var body: some View {
        Text(initials)
            .font(.quicksand(size: LumiraTokens.FontSize.textMd, weight: .bold))
            .foregroundStyle(ThemedColors.fgOnColor)
            .frame(width: 56, height: 56)
            .background(
                LinearGradient(
                    colors: [ThemedColors.pink500, ThemedColors.purple700],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(Circle())
            .accessibilityIdentifier("dados-avatar")
    }

    private var initials: String {
        let parts = name.split(separator: " ")
        let first = parts.first?.first.map(String.init) ?? ""
        let last = parts.count > 1 ? parts.last?.first.map(String.init) ?? "" : ""
        return (first + last).uppercased()
    }
}

/// Shared load-failure banner with retry.
struct ProfileErrorBanner: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Text(message)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                .foregroundStyle(ThemedColors.fg2)
                .multilineTextAlignment(.center)
            Button("Tentar novamente", action: onRetry)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.inkPurple)
        }
        .frame(maxWidth: .infinity)
        .padding(LumiraTokens.Space.s5)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
    }
}
