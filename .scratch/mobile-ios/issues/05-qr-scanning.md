# QR scanning

Type: research
Blocked by: 01

## Question

How does QR check-in scanning work on iOS: AVFoundation (`AVCaptureMetadataOutput`) vs VisionKit's `DataScannerViewController` (iOS 16+, simpler but less controllable) vs Vision framework? Weigh against the chosen minimum iOS version, camera permission UX, embedding inside the glass check-in bottom sheet (UIViewControllerRepresentable/preview layer in SwiftUI), scan debounce, and torch support. Also cover QR *generation* for the professor's live rotating attendance QR (CoreImage `CIQRCodeGenerator`). Recommend the approach and the integration pattern.
