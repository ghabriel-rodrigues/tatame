# Camera & QR scanning

Type: research
Blocked by: 01

## Question

Which Expo API should handle QR scanning for check-in (student scans professor's live QR): `expo-camera` (`CameraView` with built-in barcode scanning — the current recommendation) vs the deprecated `expo-barcode-scanner`? Verify the state of both in the chosen Expo SDK, permission flows (camera permission UX per platform), scan performance/debounce, torch support, and how the scanner embeds inside the glass check-in bottom sheet. Also cover QR *generation* on the professor side (live rotating attendance QR — which RN QR lib renders it). Recommend the libraries and the integration pattern.
