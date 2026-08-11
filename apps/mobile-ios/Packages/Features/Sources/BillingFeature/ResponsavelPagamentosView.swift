// Responsável Pagamentos (handoff responsavel-04/05): header, one card per
// dependent ("Pedro · agosto", amount, due/paid line with plan subtitle,
// Pagar com Pix or Ver comprovante), and the consolidated histórico across
// dependents. PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct ResponsavelPagamentosView: View {
    @State private var model: ResponsavelPagamentosModel

    public init(repository: any BillingRepository) {
        _model = State(initialValue: ResponsavelPagamentosModel(repository: repository))
    }

    public var body: some View {
        ResponsavelPagamentosContent(model: model)
    }
}

struct ResponsavelPagamentosContent: View {
    @Bindable var model: ResponsavelPagamentosModel

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
                case .loaded(let payments):
                    if payments.dependents.isEmpty, payments.history.isEmpty {
                        emptyState
                    } else {
                        ForEach(payments.dependents) { dependent in
                            dependentCard(dependent)
                        }
                        historySection(payments.history)
                    }
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(ThemedColors.bgApp)
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(item: $model.activeSheet) { sheet in
            sheetContent(sheet)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: Header (responsavel-04)

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Pagamentos")
                .font(.system(size: LumiraTokens.FontSize.text2xl, weight: .bold, design: .rounded))
                .foregroundStyle(ThemedColors.fg1)
            Text("Mensalidades dos seus dependentes")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(ThemedColors.fg3)
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            ForEach(0..<2, id: \.self) { _ in
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .fill(ThemedColors.bgSunken)
                    .frame(height: 140)
            }
        }
        .redacted(reason: .placeholder)
    }

    private var emptyState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Image(systemName: "creditcard")
                .font(.system(size: LumiraTokens.FontSize.text2xl))
                .foregroundStyle(ThemedColors.purple400)
            Text("Nenhuma mensalidade por aqui")
                .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.fg2)
            Text("Quando a academia atribuir um plano aos seus dependentes, as mensalidades aparecem aqui.")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(ThemedColors.fg4)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s12)
        .accessibilityIdentifier("pagamentos-empty-state")
    }

    // MARK: Dependent card (stories 17-19)

    @ViewBuilder
    private func dependentCard(_ dependent: DependentCharges) -> some View {
        if let charge = dependent.currentCharge {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(BillingFormatters.dependentChargeTitlePTBR(
                        fullName: dependent.fullName,
                        periodStart: charge.periodStart
                    ))
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg3)
                    .accessibilityIdentifier("dependent-charge-title")
                    Spacer()
                    ChargeStatusChip(open: charge.isOpen)
                }

                Text(BillingFormatters.amountBRL(charge.amountCents))
                    .font(.system(size: LumiraTokens.FontSize.text2xl, weight: .bold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                    .padding(.top, LumiraTokens.Space.s2)

                if charge.isOpen {
                    // "Vence em 10 de agosto · plano Kids mensal" (story 17).
                    Text(BillingFormatters.dependentDueLinePTBR(dueDate: charge.dueDate, plan: dependent.plan))
                        .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                        .foregroundStyle(ThemedColors.fg3)
                        .accessibilityIdentifier("dependent-due-line")

                    BillingPrimaryButton(title: "Pagar com Pix", identifier: "dependent-pagar-pix") {
                        model.activeSheet = .pix(studentId: dependent.studentId)
                    }
                    .padding(.top, LumiraTokens.Space.s3)
                } else if charge.isPaid, let payment = charge.settledPayment {
                    // "Paga em 02/08 via recorrência no cartão" (story 19).
                    Text(BillingFormatters.paidLinePTBR(
                        payment: payment,
                        recurrenceActive: dependent.recurrenceActive
                    ))
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(ThemedColors.fg3)
                    .accessibilityIdentifier("dependent-paid-line")

                    BillingSecondaryButton(title: "Ver comprovante", identifier: "dependent-ver-comprovante") {
                        model.activeSheet = .comprovante(paymentId: payment.id)
                    }
                    .padding(.top, LumiraTokens.Space.s3)
                }
            }
            .padding(LumiraTokens.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThemedColors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(ThemedColors.border1, lineWidth: 1)
            )
            .accessibilityIdentifier("dependent-charge-card")
        }
    }

    // MARK: Consolidated histórico (story 20)

    @ViewBuilder
    private func historySection(_ history: [WalletHistoryEntry]) -> some View {
        if !history.isEmpty {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s3) {
                Text("Histórico")
                    .font(.system(size: LumiraTokens.FontSize.textBase, weight: .semibold, design: .rounded))
                    .foregroundStyle(ThemedColors.fg1)
                    .padding(.top, LumiraTokens.Space.s2)

                VStack(spacing: 0) {
                    ForEach(Array(history.enumerated()), id: \.element.id) { index, entry in
                        HistoryRow(
                            title: historyTitle(entry),
                            subtitle: BillingFormatters.historyLinePTBR(entry: entry),
                            amount: BillingFormatters.amountBRL(entry.amountCents),
                            onTap: {
                                model.activeSheet = .comprovante(paymentId: entry.paymentId)
                            }
                        )
                        if index < history.count - 1 {
                            Divider().overlay(ThemedColors.gray100)
                        }
                    }
                }
                .background(ThemedColors.bgSurface)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .strokeBorder(ThemedColors.border1, lineWidth: 1)
                )
            }
            .accessibilityIdentifier("pagamentos-historico")
        }
    }

    /// "Pedro · julho" — child first name + competência (responsavel-04).
    private func historyTitle(_ entry: WalletHistoryEntry) -> String {
        guard let name = entry.studentName else {
            return BillingFormatters.mensalidadeTitlePTBR(periodStart: entry.periodStart)
        }
        return BillingFormatters.dependentChargeTitlePTBR(fullName: name, periodStart: entry.periodStart)
    }

    // MARK: Sheets

    @ViewBuilder
    private func sheetContent(_ sheet: ResponsavelPagamentosModel.ActiveSheet) -> some View {
        switch sheet {
        case .pix(let studentId):
            if let flow = model.pixFlowModel(studentId: studentId) {
                // Addressed to the child: "Mensalidade de agosto · Pedro
                // Silveira" (story 18).
                PixSheet(model: flow, subtitleContext: model.dependent(studentId: studentId)?.fullName)
            }
        case .comprovante(let paymentId):
            ComprovanteSheet(model: model.comprovanteModel(paymentId: paymentId))
        }
    }
}
