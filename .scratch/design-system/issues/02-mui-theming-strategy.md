# MUI theming strategy for Lumira

Type: grilling
Status: open
Blocked by: 01

## Question

How do Lumira tokens map onto an MUI theme so web components come out pixel-faithful to the handoff? Decide: palette mapping (purple-700 primary, pink-500 accent/secondary, purple-950 text — never pure black, gray-50 canvas, semantic success/warning/danger/info); typography (Quicksand 300–700, sentence case, -0.02em display tracking, 25px/700 screen titles, 13–14px body, 10px label floor); shape (cards 18–20px, sheets 28px top, inputs 14px, buttons/chips/tab bar pill 999px — MUI's single `shape.borderRadius` vs per-component overrides); purple-tinted shadows and `--shadow-glow` on primary CTAs; and how glass surfaces (blur 24px, saturate 180%, only on floating interactive surfaces, never glass-on-glass) are expressed — theme-level styleOverrides vs dedicated Glass components. Also decide whether the MUI theme is generated from the token pipeline output or hand-written against it.
