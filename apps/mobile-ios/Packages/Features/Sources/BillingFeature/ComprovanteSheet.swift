// Comprovante sheet (spec 006, stories 5, 19): renders the receipt route
// payload for any settled payment — reachable from the mensalidade card, the
// histórico rows, and the responsável dependent cards.

import DesignSystem
import Observation
import SwiftUI
import TatameCore

@MainActor
@Observable
public final class ComprovanteModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(PaymentReceipt)
        case failed(message: String)
    }

    public let paymentId: UUID
    public private(set) var phase: Phase = .idle

    @ObservationIgnored private let repository: any BillingRepository

    public init(paymentId: UUID, repository: any BillingRepository) {
        self.paymentId = paymentId
        self.repository = repository
    }

    public func load() async {
        if case .loaded = phase { return }
        phase = .loading
        do {
            phase = .loaded(try await repository.receipt(paymentId: paymentId))
        } catch let error as ApiError {
            phase = .failed(message: BillingMessages.message(for: error, notFound: "Comprovante não encontrado."))
        } catch {
            phase = .failed(message: BillingMessages.generic)
        }
    }
}

struct ComprovanteSheet: View {
    @State var model: ComprovanteModel

    init(model: ComprovanteModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        SheetScaffold {
            Text("Comprovante")
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(ThemedColors.fg1)

            switch model.phase {
            case .idle, .loading:
                PaymentProgress()
            case .failed(let message):
                PaymentFailure(message: message) { Task { await model.load() } }
            case .loaded(let receipt):
                receiptCard(receipt)
            }
        }
        .task { await model.load() }
    }

    private func receiptCard(_ receipt: PaymentReceipt) -> some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            ZStack {
                Circle()
                    .fill(ThemedColors.success100)
                    .frame(width: 48, height: 48)
                Image(systemName: "checkmark")
                    .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold))
                    .foregroundStyle(ThemedColors.success500)
            }
            Text(BillingFormatters.amountBRL(receipt.payment.amountCents))
                .font(.system(size: LumiraTokens.FontSize.text2xl, weight: .bold, design: .rounded))
                .foregroundStyle(ThemedColors.fg1)
                .accessibilityIdentifier("receipt-amount")
            Text(BillingFormatters.mensalidadeTitlePTBR(periodStart: receipt.charge.periodStart))
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.fg2)

            VStack(spacing: LumiraTokens.Space.s2) {
                // Nil on professor order-charge receipts (spec 009 — no
                // student row behind the buyer); the row simply hides.
                if let studentName = receipt.studentName {
                    row("Aluno", studentName)
                }
                if let planName = receipt.planName {
                    row("Plano", planName)
                }
                if let academyName = receipt.academyName {
                    row("Academia", academyName)
                }
                row("Método", BillingFormatters.methodLabelPTBR(receipt.payment.method).capitalized)
                if let paidAt = receipt.payment.paidAt {
                    row("Pago em", paidAt.formatted(
                        .dateTime.day().month(.wide).year().locale(Locale(identifier: "pt_BR"))
                    ))
                }
            }
            .padding(.top, LumiraTokens.Space.s2)
        }
        .frame(maxWidth: .infinity)
        .padding(LumiraTokens.Space.s5)
        .background(ThemedColors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.lg, style: .continuous)
                .strokeBorder(ThemedColors.border1, lineWidth: 1)
        )
        .padding(.top, LumiraTokens.Space.s2)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.fg4)
            Spacer()
            Text(value)
                .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                .foregroundStyle(ThemedColors.fg2)
        }
    }
}
