# Asset handling (logo, QR, avatar gradients)

Type: grilling
Status: open
Blocked by: (none — graduated from fog after 05 resolved)

## Question

Ticket 05 named the consuming components (`BrandLogo`, `QRPanel`, `Avatar`). Decide the assets behind them: (1) `BrandLogo` — keep the CSS/vector-drawn belt placeholder as code per platform vs a shared SVG/vector asset exported by the pipeline, and how the white-label academy logo upload replaces it; (2) QR generation — pick the lib per platform (e.g. `qrcode`/`react-native-qrcode-svg` on TS, ZXing on Android, CoreImage CIQRCodeGenerator on iOS) and whether `QRPanel` receives a payload string (component generates) or a pre-rendered image (backend generates); (3) `Avatar` initials gradients — pin the gradient recipe (which brand stops, deterministic per-user variation or fixed) into the token set so all platforms render identical avatars.
