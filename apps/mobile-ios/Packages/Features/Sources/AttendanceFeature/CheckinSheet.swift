// Aluno check-in bottom sheet (handoff aluno-04/05): segmented QR / Código /
// Manual, one submit path, green success pop (DS motion spring) with the
// streak line, and the distinct already-registered state. PT-BR copy; Lumira
// tokens only.

import DesignSystem
import SwiftUI
import TatameCore

/// Public so the agenda slice reuses the exact same sheet from its class
/// rows (spec 007 story 7 — check-in behaves identically everywhere).
public struct CheckinSheet: View {
    @State var model: CheckinModel
    @Environment(\.dismiss) private var dismiss

    public init(model: CheckinModel) {
        _model = State(initialValue: model)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
            switch model.phase {
            case .entry, .submitting, .failed:
                header
                methodPicker
                if case .failed(let message) = model.phase {
                    AttendanceActionErrorBanner(message: message, identifier: "checkin-error")
                }
                methodContent
                Spacer(minLength: 0)
            case .success(let outcome):
                successPop(outcome)
            }
        }
        .padding(.horizontal, LumiraTokens.Space.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(LumiraTokens.Colors.bgApp)
    }

    // MARK: Header (story 2)

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Check-in · \(model.todayClass.className)")
                .font(.system(size: LumiraTokens.FontSize.textLg, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
            Text(AttendanceFormatters.todayRangePTBR(slot: model.todayClass.slot))
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
        }
        .padding(.top, LumiraTokens.Space.s6)
    }

    // MARK: Segmented control (story 3)

    private var methodPicker: some View {
        HStack(spacing: 0) {
            ForEach(CheckinModel.Method.allCases, id: \.self) { method in
                Button {
                    model.method = method
                } label: {
                    Text(method.labelPTBR)
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold, design: .rounded))
                        .foregroundStyle(
                            model.method == method
                                ? LumiraTokens.Colors.fgOnColor
                                : LumiraTokens.Colors.fg3
                        )
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background(
                            model.method == method ? LumiraTokens.Colors.inkPurple : .clear
                        )
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("checkin-method-\(method.rawValue)")
            }
        }
        .padding(3)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(Capsule())
        .overlay(
            Capsule().strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }

    // MARK: Method panels (stories 4-6)

    @ViewBuilder
    private var methodContent: some View {
        if model.phase == .submitting {
            VStack(spacing: LumiraTokens.Space.s3) {
                ProgressView()
                Text("Registrando presença…")
                    .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, LumiraTokens.Space.s10)
        } else {
            switch model.method {
            case .qr:
                qrPanel
            case .code:
                codePanel
            case .manual:
                manualPanel
            }
        }
    }

    private var qrPanel: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            QRScannerPanel { token in
                Task { await model.handleScannedToken(token) }
            }
            .frame(height: 240)
            Text("Aponte para o QR Code exibido pelo professor no tatame.")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }

    private var codePanel: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            ZStack {
                CodeDigitBoxes(digits: model.codeDigits)
                // Invisible field carrying focus + the number pad.
                TextField("", text: $model.codeDigits)
                    #if os(iOS)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    #endif
                    .foregroundStyle(.clear)
                    .tint(.clear)
                    .accessibilityIdentifier("checkin-code-field")
            }
            .onChange(of: model.codeDigits) { _, newValue in
                let filtered = String(newValue.filter(\.isNumber).prefix(4))
                if filtered != newValue {
                    model.codeDigits = filtered
                }
            }
            Text("Digite o código de 4 dígitos mostrado pelo professor.")
                .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            primaryButton("Confirmar código", enabled: model.canSubmitCode) {
                Task { await model.submitCode() }
            }
            .accessibilityIdentifier("checkin-submit-code")
        }
        .padding(.top, LumiraTokens.Space.s4)
    }

    private var manualPanel: some View {
        VStack(spacing: LumiraTokens.Space.s4) {
            HStack(spacing: LumiraTokens.Space.s3) {
                Image(systemName: "location")
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
                Text("Verificação de localização em breve — por enquanto seu check-in é registrado direto para a aula de hoje.")
                    .font(.system(size: LumiraTokens.FontSize.textXs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
            }
            .padding(LumiraTokens.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LumiraTokens.Colors.purple100.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            primaryButton("Registrar presença", enabled: true) {
                Task { await model.submitManual() }
            }
            .accessibilityIdentifier("checkin-submit-manual")
        }
        .padding(.top, LumiraTokens.Space.s4)
    }

    private func primaryButton(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(LumiraTokens.Colors.inkPurple.opacity(enabled ? 1 : 0.4))
                .clipShape(Capsule())
        }
        .disabled(!enabled)
    }

    // MARK: Success pop (stories 8-9, aluno-05)

    private func successPop(_ outcome: CheckinModel.Outcome) -> some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            SuccessCheckPop()
                .padding(.top, LumiraTokens.Space.s8)
            Text(outcome.alreadyCheckedIn ? "Presença já registrada" : "Presença registrada")
                .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
                .accessibilityIdentifier(
                    outcome.alreadyCheckedIn ? "checkin-already-registered" : "checkin-success"
                )
            if outcome.alreadyCheckedIn {
                Text("Você já tinha feito check-in nesta aula — está tudo certo.")
                    .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg3)
                    .multilineTextAlignment(.center)
            } else if let streakLine = outcome.streakLinePTBR {
                Text(streakLine)
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.inkPink)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("checkin-streak-line")
            }
            Button {
                dismiss()
            } label: {
                Text("Fechar")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fgOnColor)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(LumiraTokens.Colors.inkPurple)
                    .clipShape(Capsule())
            }
            .padding(.top, LumiraTokens.Space.s4)
            .accessibilityIdentifier("checkin-close")
        }
        .frame(maxWidth: .infinity)
        .padding(.top, LumiraTokens.Space.s6)
    }
}

/// The green check pop — DS motion spring scale-in (aluno-05).
struct SuccessCheckPop: View {
    @State private var appeared = false

    var body: some View {
        ZStack {
            Circle()
                .fill(LumiraTokens.Colors.success500)
                .frame(width: 64, height: 64)
            Image(systemName: "checkmark")
                .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold))
                .foregroundStyle(LumiraTokens.Colors.fgOnColor)
        }
        .scaleEffect(appeared ? 1 : 0.4)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(
                .timingCurve(
                    LumiraTokens.Motion.easeSpring.0,
                    LumiraTokens.Motion.easeSpring.1,
                    LumiraTokens.Motion.easeSpring.2,
                    LumiraTokens.Motion.easeSpring.3,
                    duration: LumiraTokens.Motion.durSlow
                )
            ) {
                appeared = true
            }
        }
    }
}
