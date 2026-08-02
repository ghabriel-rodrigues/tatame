# QR scanning

Type: research
Blocked by: 01

## Question

How does QR check-in scanning work on Android: CameraX + ML Kit barcode scanning (bundled vs unbundled/Play-services model, APK size impact), vs the `GmsBarcodeScanner` prebuilt UI, vs ZXing? Cover camera permission UX, embedding the scanner in the glass check-in bottom sheet (CameraX `PreviewView`/Compose interop), scan debounce, torch support, and QR *generation* for the professor's live rotating attendance QR (ZXing writer or equivalent). Recommend libraries and the integration pattern.
