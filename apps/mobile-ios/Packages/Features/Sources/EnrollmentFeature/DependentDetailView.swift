// Dependent detail (spec 003, ENR.25 — story 30): child header, class card
// with the full recurring schedule and the next slot. Foreign ids surface
// the ownership 404 as PT-BR copy (story 35 — server-enforced).

import DesignSystem
import GraduationFeature
import Observation
import SwiftUI
import TatameCore

@MainActor
@Observable
public final class DependentDetailModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(Dependent)
        case failed(message: String)
    }

    public let dependentId: UUID
    public private(set) var phase: Phase = .idle

    @ObservationIgnored private let repository: any EnrollmentRepository

    public init(dependentId: UUID, repository: any EnrollmentRepository) {
        self.dependentId = dependentId
        self.repository = repository
    }

    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(try await repository.dependent(id: dependentId))
        } catch let error as ApiError {
            phase = .failed(message: EnrollmentMessages.message(
                for: error,
                notFound: EnrollmentMessages.dependentNotFound
            ))
        } catch {
            phase = .failed(message: EnrollmentMessages.generic)
        }
    }
}

public struct DependentDetailView: View {
    @Environment(\.enrollmentRepository) private var repository
    @State private var model: DependentDetailModel?
    private let dependentId: UUID

    public init(dependentId: UUID) {
        self.dependentId = dependentId
    }

    public var body: some View {
        Group {
            if let model {
                DependentDetailContent(model: model)
            } else {
                LumiraTokens.Colors.bgApp
            }
        }
        .task {
            if model == nil {
                let created = DependentDetailModel(dependentId: dependentId, repository: repository)
                model = created
                await created.load()
            }
        }
    }
}

struct DependentDetailContent: View {
    let model: DependentDetailModel

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
                case .loaded(let dependent):
                    header(dependent)
                    classSection(dependent)
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .navigationTitle(navigationTitle)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private var navigationTitle: String {
        if case .loaded(let dependent) = model.phase { return dependent.fullName }
        return ""
    }

    private func header(_ dependent: Dependent) -> some View {
        HStack(spacing: LumiraTokens.Space.s4) {
            AvatarCircle(initials: NameInitials.from(dependent.fullName), size: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(dependent.fullName)
                    .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                if let ageLabel = BirthDates.ageLabelPTBR(fromISO: dependent.birthDate) {
                    Text(ageLabel)
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                }
                // Derived belt chip (spec 005, story 34).
                if let belt = dependent.belt {
                    BeltChip(belt: belt)
                        .padding(.top, LumiraTokens.Space.s1)
                        .accessibilityIdentifier("dependent-belt-chip")
                }
            }
        }
        .padding(.top, LumiraTokens.Space.s4)
    }

    @ViewBuilder
    private func classSection(_ dependent: Dependent) -> some View {
        if let enrolledClass = dependent.enrolledClass {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                Text("Turma")
                    .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)

                VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                    Text(enrolledClass.name)
                        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg1)
                    Text(enrolledClass.schedules.scheduleLinePTBR)
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.fg4)
                    if let nextSlot = enrolledClass.nextSlot {
                        HStack(spacing: LumiraTokens.Space.s2) {
                            Image(systemName: "calendar")
                                .font(.system(size: LumiraTokens.FontSize.textXs))
                            Text("Próxima aula: \(nextSlot.nextSlotLabelPTBR)")
                                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        }
                        .foregroundStyle(LumiraTokens.Colors.inkPurple)
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
        } else {
            Text("Ainda sem turma — a matrícula acontece quando houver vaga.")
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(LumiraTokens.Space.s4)
                .background(LumiraTokens.Colors.bgSunken)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        }
    }
}
