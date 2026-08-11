// QR scanning via VisionKit's DataScannerViewController (the attendance
// map's research pick — no AVFoundation session plumbing, no third-party
// deps). Graceful degradation: on macOS test hosts, simulators, and devices
// without camera/scanner support the panel renders a hint pointing at the
// Código tab instead of a dead viewfinder.

import DesignSystem
import SwiftUI

#if os(iOS)
import VisionKit

/// True when live scanning can actually run here (false on simulators).
@MainActor
func isQRScanningSupported() -> Bool {
    DataScannerViewController.isSupported && DataScannerViewController.isAvailable
}

struct QRScannerRepresentable: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onScan: onScan)
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .fast,
            recognizesMultipleItems: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context _: Context) {
        // Start is idempotent; it fails harmlessly (throwing) when the
        // camera is unavailable — the degraded panel covers that path.
        try? scanner.startScanning()
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator _: Coordinator) {
        scanner.stopScanning()
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (String) -> Void

        init(onScan: @escaping (String) -> Void) {
            self.onScan = onScan
        }

        func dataScanner(
            _: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems _: [RecognizedItem]
        ) {
            for item in addedItems {
                if case .barcode(let barcode) = item, let payload = barcode.payloadStringValue {
                    onScan(payload)
                    return
                }
            }
        }
    }
}
#else
@MainActor
func isQRScanningSupported() -> Bool { false }
#endif

/// The QR tab panel: live scanner when supported, hint otherwise.
struct QRScannerPanel: View {
    let onScan: (String) -> Void

    var body: some View {
        #if os(iOS)
        if isQRScanningSupported() {
            QRScannerRepresentable(onScan: onScan)
                .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        } else {
            degraded
        }
        #else
        degraded
        #endif
    }

    private var degraded: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            Image(systemName: "camera.on.rectangle")
                .font(.system(size: LumiraTokens.FontSize.text2xl))
                .foregroundStyle(ThemedColors.fg4)
            Text("Câmera indisponível neste aparelho.\nUse a aba Código para digitar os 4 dígitos.")
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(ThemedColors.fg3)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, LumiraTokens.Space.s10)
        .background(ThemedColors.bgSunken)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .accessibilityIdentifier("qr-scanner-unavailable")
    }
}
