// QR rendering via CoreImage CIQRCodeGenerator (spec 004 note: a real QR
// generator, not the handoff's decorative SVG). The QR encodes only the
// opaque qr_token — never the 4 digits.

import CoreImage.CIFilterBuiltins
import DesignSystem
import SwiftUI

struct QRCodeView: View {
    let content: String

    var body: some View {
        Group {
            if let image = Self.generate(content) {
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
                    .foregroundStyle(LumiraTokens.Colors.fg4)
            }
        }
        .accessibilityLabel("QR Code de check-in")
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
