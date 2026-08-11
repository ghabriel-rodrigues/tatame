// Responsável Eventos tab (handoff responsavel-06, spec 008 EVT.15):
// "Eventos" header with "Confirme a participação por dependente", one
// gradient-banner card per published event (name + valor chip in the
// banner, abbreviated date · local line) and one chip per dependent.
//
// Documented chip UX (stories 19-21): free chips toggle on tap (confirm ↔
// cancel, the chip gaining the green check); a paid chip opens the Pix sheet
// addressed "Inscrição · <evento> · <child>" with the charge billed to the
// guardian; a paid pending chip shows the clock, re-opens the sheet on tap
// and offers "Cancelar participação" via long-press (context menu); a paid
// confirmed chip is inert — settled inscriptions are undone only by the
// audited admin refund. PT-BR copy; Lumira tokens only.

import BillingFeature
import DesignSystem
import SwiftUI
import TatameCore

public struct ResponsavelEventosView: View {
    @State private var model: ResponsavelEventosModel

    public init(repository: any EventsRepository) {
        _model = State(initialValue: ResponsavelEventosModel(repository: repository))
    }

    public var body: some View {
        ResponsavelEventosContent(model: model)
    }
}

struct ResponsavelEventosContent: View {
    @Bindable var model: ResponsavelEventosModel
    @Environment(\.tatameTheme) private var theme
    @Environment(\.billingRepository) private var billingRepository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                header

                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    errorBanner(message) {
                        Task { await model.load() }
                    }
                case .loaded(let events):
                    if let error = model.actionError {
                        errorBanner(error, retry: nil)
                    }
                    if events.isEmpty {
                        emptyState
                    } else {
                        ForEach(events) { event in
                            eventCard(event)
                        }
                    }
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(item: $model.pixTarget) { target in
            pixSheet(target)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: Header (responsavel-06)

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Eventos")
                .font(.system(size: LumiraTokens.FontSize.text2xl, weight: .bold, design: .rounded))
                .foregroundStyle(ThemedColors.fg1)
            Text("Confirme a participação por dependente")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(ThemedColors.fg3)
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    // MARK: Event card (gradient banner + per-dependent chips)

    private func eventCard(_ event: GuardianEvent) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Gradient banner: name bottom-left, valor chip top-right.
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                HStack {
                    Spacer()
                    Text(EventFormatters.valorChipPTBR(priceCents: event.priceCents))
                        .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                        .foregroundStyle(ThemedColors.inkPurple)
                        .padding(.horizontal, LumiraTokens.Space.s2)
                        .padding(.vertical, LumiraTokens.Space.s1)
                        .background(ThemedColors.white)
                        .clipShape(Capsule())
                }
                Text(event.name)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor)
            }
            .padding(LumiraTokens.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(
                    colors: EventGradients.colors(theme: theme, slug: event.bannerPreset),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )

            // "Dom, 15 de setembro · 09:30 · Ginásio Municipal"
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                Text(dateLine(event))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fg3)
                    .accessibilityIdentifier("guardian-event-line")

                HStack(spacing: LumiraTokens.Space.s2) {
                    ForEach(event.dependents) { dependent in
                        dependentChip(event: event, dependent: dependent)
                    }
                }
            }
            .padding(LumiraTokens.Space.s4)
        }
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier("guardian-event-\(event.id.uuidString.lowercased())")
    }

    private func dateLine(_ event: GuardianEvent) -> String {
        let line = EventFormatters.shortDateLinePTBR(date: event.date, time: event.time)
        guard let location = event.location else { return line }
        return "\(line) · \(location)"
    }

    // MARK: Dependent chip (per-child state, spec 008 story 21)

    private func dependentChip(event: GuardianEvent, dependent: GuardianEventDependent) -> some View {
        let working = model.workingStudentId == dependent.studentId
        return Button {
            Task { await model.chipTapped(event: event, dependent: dependent) }
        } label: {
            HStack(spacing: LumiraTokens.Space.s1) {
                if dependent.isConfirmed {
                    Image(systemName: "checkmark")
                        .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .bold))
                } else if dependent.isPendingPayment {
                    Image(systemName: "clock")
                        .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
                }
                Text(firstName(dependent.fullName))
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
            }
            .foregroundStyle(chipForeground(dependent))
            .padding(.horizontal, LumiraTokens.Space.s4)
            .frame(height: 34)
            .frame(maxWidth: .infinity)
            .background(chipBackground(dependent))
            .clipShape(Capsule())
            .overlay(
                Capsule().strokeBorder(
                    dependent.isConfirmed ? Color.clear : ThemedColors.border2,
                    lineWidth: 1
                )
            )
            .opacity(working ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(working)
        .contextMenu {
            if DependentChipAction.canCancelPending(registration: dependent.registration) {
                Button(role: .destructive) {
                    Task { await model.cancel(event: event, dependent: dependent) }
                } label: {
                    Label("Cancelar participação", systemImage: "xmark.circle")
                }
            }
        }
        .accessibilityIdentifier(
            "event-\(event.id.uuidString.lowercased())-chip-\(dependent.studentId.uuidString.lowercased())"
        )
    }

    private func chipForeground(_ dependent: GuardianEventDependent) -> Color {
        if dependent.isConfirmed { return ThemedColors.success500 }
        if dependent.isPendingPayment { return ThemedColors.warning500 }
        return ThemedColors.fg2
    }

    private func chipBackground(_ dependent: GuardianEventDependent) -> Color {
        if dependent.isConfirmed { return ThemedColors.success100 }
        if dependent.isPendingPayment { return ThemedColors.warning100 }
        return ThemedColors.bgSurface
    }

    private func firstName(_ fullName: String) -> String {
        fullName.split(separator: " ").first.map(String.init) ?? fullName
    }

    // MARK: Pix sheet (billed to the guardian, story 20)

    private func pixSheet(_ target: ResponsavelEventosModel.PixTarget) -> some View {
        PixSheet(
            model: PaymentFlowModel(
                // Display-only projection — billing owns the real row; only
                // the charge id reaches the responsável payment endpoint.
                charge: .eventInscricao(
                    chargeId: target.chargeId,
                    amountCents: target.amountCents,
                    dueDate: nil,
                    studentId: target.studentId
                ),
                method: .pix,
                payer: .responsavel,
                repository: billingRepository,
                onSettled: { [weak model] in
                    Task { await model?.paymentSettled() }
                }
            ),
            subtitle: "\(EventFormatters.inscricaoPTBR(eventName: target.eventName)) · \(firstName(target.dependentName))",
            successTitle: "Inscrição paga"
        )
    }

    // MARK: Chrome

    private var emptyState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Image(systemName: "calendar")
                .font(.system(size: LumiraTokens.FontSize.text2xl))
                .foregroundStyle(ThemedColors.purple400)
            Text("Nenhum evento por aqui")
                .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.fg2)
            Text("Quando a academia publicar um evento, ele aparece aqui para você confirmar seus dependentes.")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(ThemedColors.fg4)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s12)
        .accessibilityIdentifier("eventos-empty-state")
    }

    private func errorBanner(_ message: String, retry: (() -> Void)?) -> some View {
        VStack(spacing: LumiraTokens.Space.s2) {
            Text(message)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.danger500)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let retry {
                Button("Tentar novamente", action: retry)
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.inkPurple)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(LumiraTokens.Space.s4)
        .background(ThemedColors.danger100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .accessibilityIdentifier("eventos-error-banner")
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            ForEach(0..<2, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                    .fill(ThemedColors.bgSunken)
                    .frame(height: 150)
            }
        }
        .redacted(reason: .placeholder)
    }
}
