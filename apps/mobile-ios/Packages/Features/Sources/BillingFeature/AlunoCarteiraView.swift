// Aluno Carteira (handoff aluno-12): header + plan subtitle, the mensalidade
// card (Em aberto/Paga chip, big amount, Pagar com Pix / Boleto / Cartão or
// Ver comprovante), the recurrence banner with cancel (story 14), the
// histórico with comprovante per row, and the clean no-plan empty state
// (story 8 — billing never invents money). PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct AlunoCarteiraView: View {
    @State private var model: AlunoCarteiraModel
    /// "Mensalidade de agosto · Horizonte BJJ" Pix-sheet context (aluno-13).
    private let academyName: String?

    public init(repository: any BillingRepository, academyName: String? = nil) {
        _model = State(initialValue: AlunoCarteiraModel(repository: repository))
        self.academyName = academyName
    }

    public var body: some View {
        AlunoCarteiraContent(model: model, academyName: academyName)
    }
}

struct AlunoCarteiraContent: View {
    @Bindable var model: AlunoCarteiraModel
    let academyName: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                header

                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    BillingErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded(let wallet):
                    if wallet.plan == nil, wallet.currentCharge == nil, wallet.history.isEmpty {
                        emptyState
                    } else {
                        if let error = model.actionError {
                            BillingActionErrorBanner(message: error)
                        }
                        if let charge = wallet.currentCharge {
                            mensalidadeCard(charge)
                        }
                        if wallet.recurrence.active {
                            recurrenceBanner(wallet.recurrence)
                        }
                        historySection(wallet.history)
                    }
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(item: $model.activeSheet) { sheet in
            sheetContent(sheet)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: Header (aluno-12)

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Carteira")
                .font(.system(size: LumiraTokens.FontSize.text2xl, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            if let plan = model.wallet?.plan {
                Text(BillingFormatters.planHeaderPTBR(plan: plan))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .accessibilityIdentifier("carteira-plan-header")
            }
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .fill(LumiraTokens.Colors.bgSunken)
                .frame(height: 180)
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .fill(LumiraTokens.Colors.bgSunken)
                .frame(height: 120)
        }
        .redacted(reason: .placeholder)
    }

    // MARK: Empty state (story 8)

    private var emptyState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Image(systemName: "creditcard")
                .font(.system(size: LumiraTokens.FontSize.text2xl))
                .foregroundStyle(LumiraTokens.Colors.purple400)
            Text("Nenhum plano de mensalidade")
                .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg2)
            Text("Quando a academia atribuir um plano a você, suas mensalidades aparecem aqui.")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s12)
        .accessibilityIdentifier("carteira-empty-state")
    }

    // MARK: Mensalidade card (stories 1, 3, 15)

    private func mensalidadeCard(_ charge: Charge) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(BillingFormatters.mensalidadeTitlePTBR(periodStart: charge.periodStart))
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .accessibilityIdentifier("mensalidade-title")
                Spacer()
                ChargeStatusChip(open: charge.isOpen)
            }

            Text(BillingFormatters.amountBRL(charge.amountCents))
                .font(.system(size: LumiraTokens.FontSize.text3xl, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
                .padding(.top, LumiraTokens.Space.s2)
                .accessibilityIdentifier("mensalidade-amount")

            if charge.isOpen {
                Text(BillingFormatters.dueLinePTBR(fromISO: charge.dueDate))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .accessibilityIdentifier("mensalidade-due-line")

                BillingPrimaryButton(title: "Pagar com Pix", identifier: "pagar-pix-button") {
                    model.activeSheet = .pay(.pix)
                }
                .padding(.top, LumiraTokens.Space.s4)

                HStack(spacing: LumiraTokens.Space.s2) {
                    BillingSecondaryButton(title: "Boleto", identifier: "pagar-boleto-button") {
                        model.activeSheet = .pay(.boleto)
                    }
                    BillingSecondaryButton(title: "Cartão", identifier: "pagar-cartao-button") {
                        model.activeSheet = .pay(.card)
                    }
                }
                .padding(.top, LumiraTokens.Space.s2)
            } else if charge.isPaid {
                if let payment = charge.settledPayment {
                    Text(BillingFormatters.paidLinePTBR(
                        payment: payment,
                        recurrenceActive: model.wallet?.recurrence.active ?? false
                    ))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .accessibilityIdentifier("mensalidade-paid-line")

                    BillingSecondaryButton(title: "Ver comprovante", identifier: "ver-comprovante-button") {
                        model.activeSheet = .comprovante(paymentId: payment.id)
                    }
                    .padding(.top, LumiraTokens.Space.s4)
                }
            }
        }
        .padding(LumiraTokens.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
        .accessibilityIdentifier("mensalidade-card")
    }

    // MARK: Recurrence banner (stories 6, 14)

    private func recurrenceBanner(_ recurrence: WalletRecurrence) -> some View {
        HStack(alignment: .top, spacing: LumiraTokens.Space.s3) {
            ZStack {
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous)
                    .fill(LumiraTokens.Colors.purple700)
                    .frame(width: 36, height: 36)
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
            }
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s2) {
                Text(BillingFormatters.recurrenceBannerPTBR(nextChargeDueDate: recurrence.nextChargeDueDate))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                Button {
                    Task { await model.cancelRecurrence() }
                } label: {
                    Text(model.cancelingRecurrence ? "Cancelando…" : "Cancelar recorrência")
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.danger500)
                }
                .disabled(model.cancelingRecurrence)
                .accessibilityIdentifier("cancel-recurrence-button")
            }
        }
        .padding(LumiraTokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LumiraTokens.Colors.purple50)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .accessibilityIdentifier("recurrence-banner")
    }

    // MARK: Histórico (stories 4-5)

    @ViewBuilder
    private func historySection(_ history: [WalletHistoryEntry]) -> some View {
        if !history.isEmpty {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                Text("Histórico")
                    .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                    .padding(.top, LumiraTokens.Space.s2)

                VStack(spacing: 0) {
                    ForEach(Array(history.enumerated()), id: \.element.id) { index, entry in
                        HistoryRow(
                            title: BillingFormatters.mensalidadeTitlePTBR(periodStart: entry.periodStart),
                            subtitle: BillingFormatters.historyLinePTBR(entry: entry),
                            amount: BillingFormatters.amountBRL(entry.amountCents),
                            onTap: {
                                model.activeSheet = .comprovante(paymentId: entry.paymentId)
                            }
                        )
                        if index < history.count - 1 {
                            Divider().overlay(LumiraTokens.Colors.gray100)
                        }
                    }
                }
                .background(LumiraTokens.Colors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
                )
            }
            .accessibilityIdentifier("carteira-historico")
        }
    }

    // MARK: Sheets

    @ViewBuilder
    private func sheetContent(_ sheet: AlunoCarteiraModel.ActiveSheet) -> some View {
        switch sheet {
        case .pay(let method):
            if let flow = model.flowModel(method: method) {
                switch method {
                case .pix:
                    PixSheet(model: flow, subtitleContext: academyName)
                case .boleto:
                    BoletoSheet(model: flow)
                case .card:
                    CartaoSheet(model: flow)
                }
            }
        case .comprovante(let paymentId):
            ComprovanteSheet(model: model.comprovanteModel(paymentId: paymentId))
        }
    }
}
