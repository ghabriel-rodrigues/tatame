// Responsável dependents panel (handoff responsavel-02): greeting, one card
// per child (avatar, age · turma, next-class tile, Fase-4 frequency
// placeholder), dashed "Cadastrar aluno" action (hidden when the academy
// disabled the toggle), navigation to the child detail. Billing/notification
// areas of the handoff belong to their own slices.

import DesignSystem
import SwiftUI
import TatameCore

public struct ResponsavelHomeView: View {
    @State private var model: ResponsavelHomeModel?
    private let repository: any EnrollmentRepository
    private let session: SessionStore
    private let context: SessionContext

    public init(repository: any EnrollmentRepository, session: SessionStore, context: SessionContext) {
        self.repository = repository
        self.session = session
        self.context = context
    }

    public var body: some View {
        NavigationStack {
            Group {
                if let model {
                    ResponsavelHomeContent(model: model, context: context)
                } else {
                    LumiraTokens.Colors.bgApp
                }
            }
            .task {
                if model == nil {
                    let created = ResponsavelHomeModel(repository: repository, session: session)
                    model = created
                    await created.load()
                }
            }
        }
    }
}

struct ResponsavelHomeContent: View {
    @Bindable var model: ResponsavelHomeModel
    let context: SessionContext
    @Environment(\.enrollmentRepository) private var repository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                greeting

                switch model.phase {
                case .idle, .loading:
                    loadingCards
                case .failed(let message):
                    EnrollmentErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded(let dependents):
                    if dependents.isEmpty {
                        Text("Nenhum aluno vinculado a você ainda.")
                            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                            .foregroundStyle(LumiraTokens.Colors.fg3)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, LumiraTokens.Space.s8)
                    } else {
                        ForEach(dependents) { dependent in
                            NavigationLink(value: dependent.id) {
                                DependentCard(dependent: dependent)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if model.canRegisterDependents {
                        registerButton
                    }
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .hideNavigationBarOnIOS()
        .refreshable { await model.load() }
        .navigationDestination(for: UUID.self) { dependentId in
            DependentDetailView(dependentId: dependentId)
        }
        .sheet(isPresented: $model.showRegisterSheet) {
            RegisterDependentSheet(repository: repository) {
                Task { await model.dependentRegistered() }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "pt_BR"))))
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            Text("Olá,\n\(firstName)")
                .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, LumiraTokens.Space.s6)
    }

    private var firstName: String {
        context.user.fullName.split(separator: " ").first.map(String.init) ?? context.user.fullName
    }

    private var loadingCards: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            ForEach(0..<2, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(LumiraTokens.Colors.bgSunken)
                    .frame(height: 120)
            }
        }
        .redacted(reason: .placeholder)
    }

    /// Handoff dashed "Cadastrar aluno" button — hidden when the academy
    /// disabled the dependents.register toggle (story 36).
    private var registerButton: some View {
        Button {
            model.showRegisterSheet = true
        } label: {
            HStack(spacing: LumiraTokens.Space.s2) {
                Image(systemName: "plus")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                Text("Cadastrar aluno")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
            }
            .foregroundStyle(LumiraTokens.Colors.inkPurple)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(
                        LumiraTokens.Colors.inkPurple,
                        style: StrokeStyle(lineWidth: 1, dash: [5, 4])
                    )
            )
        }
        .accessibilityIdentifier("register-dependent-button")
    }
}

/// One dependent card (handoff responsavel-02). Frequency and graduation
/// tiles are other slices — the next-class tile is real data.
struct DependentCard: View {
    let dependent: Dependent

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            HStack(spacing: LumiraTokens.Space.s3) {
                AvatarCircle(initials: NameInitials.from(dependent.fullName), size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(dependent.fullName)
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg1)
                    Text(subtitle)
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }

            // Drawn belt with degrees (spec 005, story 34).
            if let belt = dependent.belt {
                VStack(alignment: .leading, spacing: LumiraTokens.Space.s1) {
                    BeltBar(
                        colorSlug: belt.colorSlug,
                        tipColorSlug: belt.tipColorSlug,
                        degrees: belt.degrees,
                        maxDegrees: belt.maxDegrees,
                        size: .sm
                    )
                    Text(GraduationFormatters.chipLabelPTBR(belt: belt))
                        .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                }
            }

            HStack(spacing: LumiraTokens.Space.s3) {
                StatTile(value: "—", label: "frequência", footnote: "Fase 4")
                if let nextSlot = dependent.enrolledClass?.nextSlot {
                    StatTile(value: nextSlot.nextSlotLabelPTBR, label: "próxima aula")
                } else {
                    StatTile(value: "—", label: "próxima aula", footnote: "sem turma")
                }
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

    private var subtitle: String {
        let age = BirthDates.ageLabelPTBR(fromISO: dependent.birthDate)
        let turma = dependent.enrolledClass?.name
        switch (age, turma) {
        case let (.some(age), .some(turma)): return "\(age) · \(turma)"
        case let (.some(age), nil): return "\(age) · sem turma"
        case let (nil, .some(turma)): return turma
        case (nil, nil): return "sem turma"
        }
    }
}
