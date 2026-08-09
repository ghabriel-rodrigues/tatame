// Aluno profile header (handoff aluno-19, graduation scope only): avatar,
// name, and the real belt chip ("Faixa azul · 2 graus") derived from
// GET /aluno/graduation. The rest of the aluno-19 profile (store, personal
// data, settings) belongs to later slices.

import DesignSystem
import Observation
import SwiftUI
import TatameCore

@MainActor
@Observable
public final class AlunoProfileModel {
    public private(set) var belt: BeltView?
    public private(set) var loading = false

    @ObservationIgnored private let repository: any GraduationRepository

    public init(repository: any GraduationRepository) {
        self.repository = repository
    }

    public func load() async {
        loading = true
        defer { loading = false }
        // Chip is best-effort decoration: failures leave the header beltless
        // rather than blocking the profile tab.
        belt = try? await repository.alunoGraduation().belt
    }
}

public struct AlunoProfileHeader: View {
    @Environment(\.graduationRepository) private var repository
    @State private var model: AlunoProfileModel?
    private let fullName: String

    public init(fullName: String) {
        self.fullName = fullName
    }

    public var body: some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            GraduationAvatar(initials: GraduationInitials.from(fullName), size: 64)
            Text(fullName)
                .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            if let belt = model?.belt {
                BeltChip(belt: belt, style: .prominent)
                    .accessibilityIdentifier("aluno-belt-chip")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, LumiraTokens.Space.s4)
        .task {
            if model == nil {
                let created = AlunoProfileModel(repository: repository)
                model = created
                await created.load()
            }
        }
    }
}
