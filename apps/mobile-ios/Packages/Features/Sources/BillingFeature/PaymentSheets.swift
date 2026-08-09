// The three payment sheets (spec 006, BIL.23 — handoff aluno-13/14/15 and
// responsavel-05): Pix QR + copia-e-cola + Simular pagamento, boleto barcode
// + linha digitável + Simular compensação, cartão form + recurrence toggle +
// inline settle. All three share the settled success pop (story 15
// treatment). PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

// MARK: - Pix (aluno-13 / responsavel-05)

struct PixSheet: View {
    @State var model: PaymentFlowModel
    /// "Mensalidade de agosto · Horizonte BJJ" (aluno) / "… · Pedro
    /// Silveira" (responsável, story 18) context tail.
    let subtitleContext: String?
    @Environment(\.dismiss) private var dismiss

    init(model: PaymentFlowModel, subtitleContext: String? = nil) {
        _model = State(initialValue: model)
        self.subtitleContext = subtitleContext
    }

    var body: some View {
        SheetScaffold {
            switch model.phase {
            case .success(let payment, _):
                PaymentSuccessView(payment: payment, mandateCreated: false) { dismiss() }
            default:
                header
                content
            }
        }
        .task { await model.start() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Pagar com Pix")
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(subtitle)
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
        }
    }

    private var subtitle: String {
        let mensalidade = BillingFormatters.mensalidadeDePTBR(periodStart: model.charge.periodStart)
        guard let subtitleContext else { return mensalidade }
        return "\(mensalidade) · \(subtitleContext)"
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .idle, .creating, .processing:
            PaymentProgress()
        case .failed(let message):
            PaymentFailure(message: message) { Task { await model.retry() } }
        case .ready(let payment):
            VStack(spacing: LumiraTokens.Space.s3) {
                if let qrPayload = payment.providerData?.qrPayload {
                    PixQRView(payload: qrPayload)
                        .frame(width: 124, height: 124)
                        .padding(LumiraTokens.Space.s3)
                        .background(LumiraTokens.Colors.white)
                        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
                }
                Text(BillingFormatters.amountBRL(payment.amountCents))
                    .font(.system(size: LumiraTokens.FontSize.text2xl, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                if let confirmation = model.copyConfirmation {
                    Text(confirmation)
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.success500)
                        .accessibilityIdentifier("pix-copy-confirmation")
                }
                BillingSecondaryButton(
                    title: "Copiar código Pix",
                    icon: "doc.on.doc",
                    identifier: "pix-copy-button"
                ) {
                    model.copyPixCode()
                }
                if model.canSimulate {
                    BillingPrimaryButton(title: "Simular pagamento", identifier: "pix-simulate-button") {
                        Task { await model.simulate() }
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, LumiraTokens.Space.s4)
        case .success:
            EmptyView()
        }
    }
}

// MARK: - Boleto (aluno-14)

struct BoletoSheet: View {
    @State var model: PaymentFlowModel
    @Environment(\.dismiss) private var dismiss

    init(model: PaymentFlowModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        SheetScaffold {
            switch model.phase {
            case .success(let payment, _):
                PaymentSuccessView(payment: payment, mandateCreated: false) { dismiss() }
            default:
                header
                content
            }
        }
        .task { await model.start() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Boleto bancário")
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(
                "\(BillingFormatters.mensalidadeDePTBR(periodStart: model.charge.periodStart)) · vence em \(BillingFormatters.shortDatePTBR(fromISO: model.charge.dueDate)) · \(BillingFormatters.amountBRL(model.charge.amountCents))"
            )
            .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg3)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .idle, .creating, .processing:
            PaymentProgress()
        case .failed(let message):
            PaymentFailure(message: message) { Task { await model.retry() } }
        case .ready(let payment):
            VStack(spacing: LumiraTokens.Space.s3) {
                VStack(spacing: LumiraTokens.Space.s3) {
                    BoletoBarcodeView(payload: payment.providerData?.barcodePayload ?? payment.id.uuidString)
                        .frame(height: 52)
                    if let linha = payment.providerData?.linhaDigitavel {
                        Text(linha)
                            .font(.system(size: LumiraTokens.FontSize.text2xs, design: .monospaced))
                            .foregroundStyle(LumiraTokens.Colors.gray950)
                            .multilineTextAlignment(.center)
                            .accessibilityIdentifier("boleto-linha-digitavel")
                    }
                }
                .padding(LumiraTokens.Space.s4)
                .frame(maxWidth: .infinity)
                .background(LumiraTokens.Colors.white)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))

                if let confirmation = model.copyConfirmation {
                    Text(confirmation)
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        .foregroundStyle(LumiraTokens.Colors.success500)
                        .accessibilityIdentifier("boleto-copy-confirmation")
                }
                BillingSecondaryButton(
                    title: "Copiar linha digitável",
                    icon: "doc.on.doc",
                    identifier: "boleto-copy-button"
                ) {
                    model.copyLinhaDigitavel()
                }
                if model.canSimulate {
                    BillingPrimaryButton(title: "Simular compensação", identifier: "boleto-simulate-button") {
                        Task { await model.simulate() }
                    }
                }
                Text("Boletos compensam em até 2 dias úteis.")
                    .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, LumiraTokens.Space.s4)
        case .success:
            EmptyView()
        }
    }
}

// MARK: - Cartão (aluno-15)

struct CartaoSheet: View {
    @State var model: PaymentFlowModel
    @Environment(\.dismiss) private var dismiss

    init(model: PaymentFlowModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        SheetScaffold {
            switch model.phase {
            case .success(let payment, let mandateCreated):
                PaymentSuccessView(payment: payment, mandateCreated: mandateCreated) { dismiss() }
            case .processing:
                header
                PaymentProgress()
            case .failed(let message):
                header
                PaymentFailure(message: message) { Task { await model.retry() } }
            default:
                header
                form
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Pagar com cartão")
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(
                "\(BillingFormatters.mensalidadeDePTBR(periodStart: model.charge.periodStart)) · \(BillingFormatters.amountBRL(model.charge.amountCents))"
            )
            .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg3)
        }
    }

    private var form: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            cardField("Número do cartão", text: $model.cardNumber, numeric: true, identifier: "card-number-field")
            cardField("Nome impresso no cartão", text: $model.cardHolder, identifier: "card-holder-field")
            HStack(spacing: LumiraTokens.Space.s3) {
                cardField("Validade (MM/AA)", text: $model.cardValidity, identifier: "card-validity-field")
                cardField("CVV", text: $model.cardCVV, numeric: true, identifier: "card-cvv-field")
                    .frame(width: 88)
            }

            // "Usar este cartão na recorrência mensal" (story 12).
            HStack(spacing: LumiraTokens.Space.s3) {
                Text("Usar este cartão na recorrência mensal")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg2)
                Spacer()
                Toggle("", isOn: $model.recurrenceToggle)
                    .labelsHidden()
                    .tint(LumiraTokens.Colors.purple500)
                    .accessibilityIdentifier("card-recurrence-toggle")
            }
            .padding(.horizontal, LumiraTokens.Space.s4)
            .padding(.vertical, LumiraTokens.Space.s3)
            .background(LumiraTokens.Colors.purple50)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(LumiraTokens.Colors.purple200, lineWidth: 1)
            )

            BillingPrimaryButton(
                title: "Pagar \(BillingFormatters.amountBRL(model.charge.amountCents))",
                enabled: model.canPayCard,
                identifier: "card-pay-button"
            ) {
                Task { await model.payCard() }
            }
            .padding(.top, LumiraTokens.Space.s2)
        }
        .padding(.top, LumiraTokens.Space.s4)
    }

    private func cardField(
        _ placeholder: String,
        text: Binding<String>,
        numeric: Bool = false,
        identifier: String
    ) -> some View {
        TextField(placeholder, text: text)
            .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
            .foregroundStyle(LumiraTokens.Colors.fg1)
            .textFieldStyle(.plain)
            #if os(iOS)
            .keyboardType(numeric ? .numberPad : .default)
            #endif
            .padding(.horizontal, LumiraTokens.Space.s4)
            .frame(height: 46)
            .background(LumiraTokens.Colors.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                    .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
            )
            .accessibilityIdentifier(identifier)
    }
}

// MARK: - Shared sheet chrome

/// Sheet scaffold: grab handle + padded column on the app background.
struct SheetScaffold<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
            Capsule()
                .fill(LumiraTokens.Colors.gray300)
                .frame(width: 40, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, LumiraTokens.Space.s3)
            content
            Spacer(minLength: 0)
        }
        .padding(.horizontal, LumiraTokens.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(LumiraTokens.Colors.bgApp)
    }
}

/// In-flight indicator shared by the three sheets.
struct PaymentProgress: View {
    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            ProgressView()
            Text("Processando…")
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s10)
    }
}

/// Failure banner + retry shared by the three sheets.
struct PaymentFailure: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            BillingActionErrorBanner(message: message, identifier: "payment-error")
            Button("Tentar novamente", action: retry)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.inkPurple)
        }
        .padding(.top, LumiraTokens.Space.s4)
    }
}

/// Settled success pop (story 15): green check, "Mensalidade paga", the
/// mandate line when the toggle created one, Fechar.
struct PaymentSuccessView: View {
    let payment: Payment
    let mandateCreated: Bool
    let close: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            BillingSuccessPop()
                .padding(.top, LumiraTokens.Space.s8)
            Text("Mensalidade paga")
                .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
                .accessibilityIdentifier("payment-success")
            Text(successLine)
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg3)
                .multilineTextAlignment(.center)
            if mandateCreated {
                Text("Recorrência ativada no cartão — as próximas mensalidades são pagas automaticamente.")
                    .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("payment-mandate-created")
            }
            Button(action: close) {
                Text("Fechar")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(LumiraTokens.Colors.purple700)
                    .clipShape(Capsule())
            }
            .padding(.top, LumiraTokens.Space.s4)
            .accessibilityIdentifier("payment-close")
        }
        .frame(maxWidth: .infinity)
        .padding(.top, LumiraTokens.Space.s6)
    }

    private var successLine: String {
        let amount = BillingFormatters.amountBRL(payment.amountCents)
        return switch payment.method {
        case .pix: "\(amount) pagos via Pix."
        case .boleto: "Boleto compensado — \(amount) pagos."
        case .card: "\(amount) pagos no cartão."
        }
    }
}
