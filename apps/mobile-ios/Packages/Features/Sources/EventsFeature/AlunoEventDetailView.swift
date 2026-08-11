// Aluno event detail (handoff aluno-10, spec 008 EVT.14): gradient-preset
// banner with the back chevron, Gratuito/valor chip and event name; the info
// card (data/hora, local, responsável); the description; then the state
// machine — "Confirmar presença" (free), "Pagar inscrição · R$ X" (paid,
// riding the existing Pix sheet + simulate), the green "Presença confirmada
// — até lá!" banner, and "Cancelar participação" on free/not-yet-paid rows.
// PT-BR copy; Lumira tokens only.

import BillingFeature
import DesignSystem
import SwiftUI
import TatameCore

/// Navigation payload for pushing the detail from home/agenda/calendar.
public struct EventDetailTarget: Identifiable, Hashable, Sendable {
    public let id: UUID

    public init(id: UUID) {
        self.id = id
    }
}

public struct AlunoEventDetailView: View {
    @State private var model: AlunoEventDetailModel

    public init(eventId: UUID, repository: any EventsRepository) {
        _model = State(initialValue: AlunoEventDetailModel(eventId: eventId, repository: repository))
    }

    public var body: some View {
        AlunoEventDetailContent(model: model)
    }
}

struct AlunoEventDetailContent: View {
    @Bindable var model: AlunoEventDetailModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.tatameTheme) private var theme
    @Environment(\.billingRepository) private var billingRepository

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    banner(name: nil, preset: nil)
                    errorBanner(message) {
                        Task { await model.load() }
                    }
                case .loaded(let detail):
                    banner(name: detail.name, preset: detail.bannerPreset)
                    VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                        infoCard(detail)
                        if let description = detail.description {
                            Text(description)
                                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                                .foregroundStyle(ThemedColors.fg3)
                                .accessibilityIdentifier("event-description")
                        }
                        if let error = model.actionError {
                            errorBanner(error, retry: nil)
                        }
                        if let cta = model.cta {
                            ctaSection(cta, detail: detail)
                        }
                    }
                    .padding(.horizontal, LumiraTokens.Space.s6)
                }
            }
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .task { await model.load() }
        .refreshable { await model.load() }
        .eventsNavigationBarHiddenOnIOS()
        .sheet(item: $model.pixTarget) { target in
            pixSheet(target)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: Banner (gradient preset + chip + name, aluno-10)

    private func banner(name: String?, preset: String?) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(ThemedColors.fgOnColor)
                    .frame(width: 38, height: 38)
                    .background(ThemedColors.white.opacity(0.18))
                    .clipShape(Circle())
            }
            .accessibilityIdentifier("event-back-button")

            Spacer(minLength: LumiraTokens.Space.s4)

            if let detail = model.detail {
                Text(EventFormatters.valorChipPTBR(priceCents: detail.priceCents))
                    .font(.system(size: LumiraTokens.FontSize.text2xs, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.inkPurple)
                    .padding(.horizontal, LumiraTokens.Space.s2)
                    .padding(.vertical, LumiraTokens.Space.s1)
                    .background(ThemedColors.white)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("event-banner-chip")
            }
            if let name {
                Text(name)
                    .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.fgOnColor)
                    .accessibilityIdentifier("event-banner-name")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s5)
        .padding(.top, LumiraTokens.Space.s6)
        .frame(minHeight: 180, alignment: .bottomLeading)
        .background(
            LinearGradient(
                colors: EventGradients.colors(theme: theme, slug: preset),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(
            .rect(
                bottomLeadingRadius: LumiraTokens.Radius.lg,
                bottomTrailingRadius: LumiraTokens.Radius.lg
            )
        )
        .ignoresSafeArea(edges: .top)
    }

    // MARK: Info card (data/hora · local · responsável)

    private func infoCard(_ detail: EventDetail) -> some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
            infoRow(
                icon: "calendar",
                text: EventFormatters.dateLinePTBR(date: detail.date, time: detail.time),
                identifier: "event-date-line"
            )
            if let location = detail.location {
                infoRow(icon: "mappin.and.ellipse", text: location, identifier: "event-location-line")
            }
            infoRow(
                icon: "person",
                text: "Responsável: \(detail.responsibleName)",
                identifier: "event-responsible-line"
            )
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
    }

    private func infoRow(icon: String, text: String, identifier: String) -> some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: icon)
                .font(.system(size: LumiraTokens.FontSize.textXs))
                .foregroundStyle(ThemedColors.inkPurple)
                .frame(width: 18)
            Text(text)
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(ThemedColors.fg2)
        }
        .accessibilityIdentifier(identifier)
    }

    // MARK: CTA section (the aluno-10 state machine)

    @ViewBuilder
    private func ctaSection(_ cta: EventDetailCTA, detail: EventDetail) -> some View {
        if cta.showsConfirmedBanner {
            confirmedBanner
        }
        if cta.showsPendingBanner {
            pendingBanner
        }

        switch cta.primary {
        case .confirm:
            primaryButton("Confirmar presença", identifier: "event-confirmar-button") {
                Task { await model.confirmPresence() }
            }
        case .pay(let priceCents):
            primaryButton(
                EventFormatters.payButtonPTBR(priceCents: priceCents),
                identifier: "event-pagar-button"
            ) {
                Task { await model.payInscricao() }
            }
        case .none:
            EmptyView()
        }

        if cta.showsCancel {
            Button {
                Task { await model.cancelParticipation() }
            } label: {
                Text("Cancelar participação")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.danger500)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            .disabled(model.working)
            .accessibilityIdentifier("event-cancelar-button")
        }
    }

    private var confirmedBanner: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: "checkmark.circle.fill")
            Text(EventsMessages.confirmed)
        }
        .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
        .foregroundStyle(ThemedColors.success500)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s4)
        .background(ThemedColors.success100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .accessibilityIdentifier("event-confirmed-banner")
    }

    private var pendingBanner: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: "clock")
            Text(EventsMessages.pendingPayment)
        }
        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
        .foregroundStyle(ThemedColors.warning500)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LumiraTokens.Space.s3)
        .background(ThemedColors.warning100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .accessibilityIdentifier("event-pending-banner")
    }

    private func primaryButton(
        _ title: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.fgOnColor)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(ThemedColors.purple700)
                .clipShape(Capsule())
                .opacity(model.working ? 0.6 : 1)
        }
        .disabled(model.working)
        .accessibilityIdentifier(identifier)
    }

    // MARK: Pix sheet (the existing billing rails, story 13-14)

    @ViewBuilder
    private func pixSheet(_ target: AlunoEventDetailModel.PixTarget) -> some View {
        if let detail = model.detail {
            PixSheet(
                model: PaymentFlowModel(
                    // Display-only projection — billing owns the real row;
                    // only the charge id reaches the wallet endpoint.
                    charge: .eventInscricao(
                        chargeId: target.chargeId,
                        amountCents: target.amountCents,
                        dueDate: detail.date,
                        studentId: detail.id
                    ),
                    method: .pix,
                    payer: .aluno,
                    repository: billingRepository,
                    onSettled: { [weak model] in
                        Task { await model?.paymentSettled() }
                    }
                ),
                subtitle: EventFormatters.inscricaoPTBR(eventName: detail.name),
                successTitle: "Inscrição paga"
            )
        }
    }

    // MARK: Chrome

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
        .padding(.horizontal, retry == nil ? 0 : LumiraTokens.Space.s6)
        .accessibilityIdentifier("event-error-banner")
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .fill(ThemedColors.bgSunken)
                .frame(height: 180)
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .fill(ThemedColors.bgSunken)
                .frame(height: 110)
                .padding(.horizontal, LumiraTokens.Space.s6)
        }
        .redacted(reason: .placeholder)
    }
}

extension View {
    /// The gradient banner replaces the system bar on iOS; the macOS floor
    /// (test-only host) has no hiding API.
    @ViewBuilder
    func eventsNavigationBarHiddenOnIOS() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }
}
