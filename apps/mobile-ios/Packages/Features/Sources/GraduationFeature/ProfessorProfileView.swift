// Professor own profile (handoff professor-12): avatar header with the
// prominent belt chip ("Faixa preta · 2º dan") and the "Graduações válidas"
// card — the academy's merged régua as belt chips, kids belts dimmed when
// the admin disabled them. Invite-por-link and store areas of the handoff
// belong to their own slices. PT-BR copy; Lumira tokens only.

import DesignSystem
import Observation
import SwiftUI
import TatameCore

@MainActor
@Observable
public final class ProfessorProfileModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(ProfessorProfile)
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle

    @ObservationIgnored private let repository: any GraduationRepository

    public init(repository: any GraduationRepository) {
        self.repository = repository
    }

    public var profile: ProfessorProfile? {
        if case .loaded(let profile) = phase { return profile }
        return nil
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.professorProfile())
        } catch let error as ApiError {
            phase = .failed(message: GraduationMessages.message(for: error, notFound: GraduationMessages.loadFailed))
        } catch {
            phase = .failed(message: GraduationMessages.generic)
        }
    }
}

public struct ProfessorProfileView: View {
    @Environment(\.graduationRepository) private var repository
    @State private var model: ProfessorProfileModel?
    private let fullName: String
    private let academyName: String?

    public init(fullName: String, academyName: String?) {
        self.fullName = fullName
        self.academyName = academyName
    }

    public var body: some View {
        Group {
            if let model {
                ProfessorProfileContent(model: model, fullName: fullName, academyName: academyName)
            } else {
                LumiraTokens.Colors.bgApp
            }
        }
        .task {
            if model == nil {
                let created = ProfessorProfileModel(repository: repository)
                model = created
                await created.load()
            }
        }
    }
}

struct ProfessorProfileContent: View {
    let model: ProfessorProfileModel
    let fullName: String
    let academyName: String?

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            header
            switch model.phase {
            case .idle, .loading:
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(LumiraTokens.Colors.bgSunken)
                    .frame(height: 120)
                    .redacted(reason: .placeholder)
            case .failed(let message):
                GraduationErrorBanner(message: message) {
                    Task { await model.load() }
                }
            case .loaded(let profile):
                validGraduationsCard(profile.validGraduations)
            }
        }
    }

    // MARK: Header (belt chip — story 20)

    private var header: some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            GraduationAvatar(initials: GraduationInitials.from(fullName), size: 64)
            Text(fullName)
                .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(subtitle)
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            if let belt = model.profile?.belt {
                BeltChip(belt: belt, style: .prominent)
                    .accessibilityIdentifier("professor-belt-chip")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, LumiraTokens.Space.s4)
    }

    private var subtitle: String {
        if let academyName {
            return "Professor · \(academyName)"
        }
        return "Professor"
    }

    // MARK: Graduações válidas (story 21)

    private func validGraduationsCard(_ ladder: [ValidGraduation]) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            Text("Graduações válidas")
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(
                "Definição conjunta com o admin, para todo o ambiente do treino. "
                    + "Faixas infantis são opcionais — toque para ativar ou desativar fica com o admin."
            )
            .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg4)

            FlowChips(ladder: ladder)
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier("graduacoes-validas-card")
    }
}

/// Wrapping rows of régua chips (kids belts dim when disabled).
private struct FlowChips: View {
    let ladder: [ValidGraduation]

    var body: some View {
        // Simple two-column-ish wrap via LazyVGrid — the régua is 10 chips.
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 104), alignment: .leading)],
            alignment: .leading,
            spacing: LumiraTokens.Space.s2
        ) {
            ForEach(ladder) { belt in
                BeltChip(
                    label: belt.name,
                    colorSlug: belt.colorSlug,
                    tipColorSlug: belt.tipColorSlug,
                    degrees: 0,
                    maxDegrees: belt.maxDegrees,
                    style: belt.enabled ? .neutral : .disabled
                )
            }
        }
    }
}
