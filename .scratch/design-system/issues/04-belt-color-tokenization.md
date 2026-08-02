# Belt color tokenization

Type: grilling
Status: open
Blocked by: 01

## Question

How do jiu-jitsu belts become first-class design tokens? The prototypes hardcode hex (azul `#1E5CB3`, cinza `#9A9AA2`, amarela `#E8C93D`, ponteira preta `#17141F`) and draw belts in CSS (bar + dark tip with degrees as white stripes) — BOSS forbids hardcoded colors. Decide: the belt token namespace (full adult + kids ladders, white through black/red, coral, kids belts toggleable per academy); degree rendering rules as tokens or component contract (stripe count, stripe color, tip color, black-belt dan bars, red-belt treatment); whether belt tokens are static brand-independent tokens (belts never re-theme under white-label) or a separate token category exempt from palette derivation; and how the data-driven graduation model (other belt-based arts later, per boss.md) constrains the token structure — belt tokens keyed by data, not by hardcoded belt names in components.
