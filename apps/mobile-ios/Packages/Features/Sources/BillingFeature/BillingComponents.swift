// Shared billing UI atoms (spec 006, BIL.22-23): status chips, buttons, the
// CoreImage Pix QR (real generator, never the handoff's decorative SVG — the
// spec-004 precedent), the striped boleto barcode, the green success pop,
// error banners, and the cross-platform pasteboard shim. PT-BR copy; Lumira
// tokens only.

import CoreImage.CIFilterBuiltins
import DesignSystem
import SwiftUI
import TatameCore

// MARK: - Status chips (aluno-12 / responsavel-04)

/// "Em aberto" (warning) / "Paga" (success) mensalidade chip.
struct ChargeStatusChip: View {
    let open: Bool

    var body: some View {
        Text(open ? "Em aberto" : "Paga")
            .font(.quicksand(size: LumiraTokens.FontSize.text2xs, weight: .semibold))
            .foregroundStyle(open ? ThemedColors.warning500 : ThemedColors.success500)
            .padding(.horizontal, LumiraTokens.Space.s3)
            .padding(.vertical, LumiraTokens.Space.s1)
            .background(open ? ThemedColors.warning100 : ThemedColors.success100)
            .clipShape(Capsule())
            .accessibilityIdentifier(open ? "charge-chip-aberto" : "charge-chip-paga")
    }
}

// MARK: - Buttons

/// Filled purple pill (Pagar com Pix / Simular pagamento / Pagar R$ …).
struct BillingPrimaryButton: View {
    let title: String
    var enabled = true
    var identifier: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.fgOnColor)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(ThemedColors.purple700.opacity(enabled ? 1 : 0.4))
                .clipShape(Capsule())
        }
        .disabled(!enabled)
        .accessibilityIdentifier(identifier ?? "billing-primary")
    }
}

/// Bordered pill (Boleto / Cartão / Copiar … / Ver comprovante).
struct BillingSecondaryButton: View {
    let title: String
    var icon: String?
    var identifier: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: LumiraTokens.Space.s2) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .semibold))
                }
                Text(title)
                    .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
            }
            .foregroundStyle(ThemedColors.inkPurple)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .overlay(
                Capsule().strokeBorder(ThemedColors.purple200, lineWidth: 1.5)
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier ?? "billing-secondary")
    }
}

// MARK: - Pix QR (CoreImage, spec-004 precedent)

/// Renders the simulated provider's `qrPayload` as a real QR code.
struct PixQRView: View {
    let payload: String

    var body: some View {
        Group {
            if let image = Self.generate(payload) {
                Image(decorative: image, scale: 1)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
            } else {
                // CoreImage never fails for short ASCII payloads; degrade to
                // an icon rather than crash if it ever does.
                Image(systemName: "qrcode")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(ThemedColors.fg4)
            }
        }
        .accessibilityLabel("QR Code Pix")
    }

    static func generate(_ string: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        // Scale up so the crisp module edges survive resampling.
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        return CIContext().createCGImage(scaled, from: scaled.extent)
    }
}

// MARK: - Boleto barcode (aluno-14)

/// Deterministic striped barcode drawn from the provider's barcode payload —
/// a faithful render of the handoff's stripe treatment, seeded by the real
/// payload so two boletos never draw the same stripes.
struct BoletoBarcodeView: View {
    let payload: String

    var body: some View {
        Canvas { context, size in
            var x: CGFloat = 0
            let scalars = Array(payload.unicodeScalars)
            var index = 0
            while x < size.width {
                let seed = scalars.isEmpty ? UInt32(index) : scalars[index % scalars.count].value
                let width = CGFloat(1 + (Int(seed) + index) % 3)
                if (Int(seed) + index).isMultiple(of: 2) {
                    context.fill(
                        Path(CGRect(x: x, y: 0, width: width, height: size.height)),
                        with: .color(ThemedColors.gray950)
                    )
                }
                x += width + 1
                index += 1
            }
        }
        .accessibilityLabel("Código de barras do boleto")
    }
}

// MARK: - Success pop (payment settled — story 15 treatment)

/// The green check pop — DS motion spring scale-in (same treatment as the
/// check-in success, aluno-05).
struct BillingSuccessPop: View {
    @State private var appeared = false

    var body: some View {
        ZStack {
            Circle()
                .fill(ThemedColors.success500)
                .frame(width: 64, height: 64)
            Image(systemName: "checkmark")
                .font(.system(size: LumiraTokens.FontSize.textXl, weight: .bold))
                .foregroundStyle(ThemedColors.fgOnColor)
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

// MARK: - Error banners

/// Full-width load-failure banner with retry.
struct BillingErrorBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Text(message)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm))
                .foregroundStyle(ThemedColors.danger500)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Tentar novamente", action: retry)
                .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                .foregroundStyle(ThemedColors.inkPurple)
        }
        .padding(LumiraTokens.Space.s4)
        .background(ThemedColors.danger100)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
    }
}

/// Inline action-error banner (payment/cancel failures).
struct BillingActionErrorBanner: View {
    let message: String
    var identifier = "billing-action-error"

    var body: some View {
        Text(message)
            .font(.quicksand(size: LumiraTokens.FontSize.textSm))
            .foregroundStyle(ThemedColors.danger500)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LumiraTokens.Space.s3)
            .background(ThemedColors.danger100)
            .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.sm, style: .continuous))
            .accessibilityIdentifier(identifier)
    }
}

// MARK: - Histórico row (aluno-12 / responsavel-04)

/// One settled histórico row: green check, title, paid line, amount.
struct HistoryRow: View {
    let title: String
    let subtitle: String
    let amount: String
    var onTap: (() -> Void)?

    var body: some View {
        Button {
            onTap?()
        } label: {
            HStack(spacing: LumiraTokens.Space.s3) {
                ZStack {
                    Circle()
                        .fill(ThemedColors.success100)
                        .frame(width: 34, height: 34)
                    Image(systemName: "checkmark")
                        .font(.system(size: LumiraTokens.FontSize.textXs, weight: .bold))
                        .foregroundStyle(ThemedColors.success500)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.quicksand(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                        .foregroundStyle(ThemedColors.fg1)
                    Text(subtitle)
                        .font(.quicksand(size: LumiraTokens.FontSize.text2xs))
                        .foregroundStyle(ThemedColors.fg3)
                }
                Spacer()
                Text(amount)
                    .font(.quicksand(size: LumiraTokens.FontSize.textXs, weight: .bold))
                    .foregroundStyle(ThemedColors.fg2)
            }
            .padding(.horizontal, LumiraTokens.Space.s4)
            .padding(.vertical, LumiraTokens.Space.s3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(onTap == nil)
    }
}

// MARK: - Pasteboard shim

/// Copies text on iOS (UIPasteboard) and the macOS test host (NSPasteboard).
enum BillingPasteboard {
    static func copy(_ string: String) {
        #if os(iOS)
        UIPasteboard.general.string = string
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(string, forType: .string)
        #endif
    }
}

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif
