# Icon strategy across platforms

Type: grilling
Status: open
Blocked by: (none — graduated from fog after 01 and 05 resolved)

## Question

Lucide (stroke 2px, rounded) is settled for web (`lucide-react`) and RN (`lucide-react-native`). Decide the Kotlin and Swift delivery: Lucide ships official/community ports (compose-lucide, swift Lucide packages) vs exporting the needed SVG subset through the token/asset pipeline as VectorDrawables + SF-Symbol-style template images. Also decide whether `packages/design-system` owns a named icon map (semantic names like `icon.checkin`, `icon.belt` → Lucide glyph) so all 4 platforms reference icons by the same semantic name per the shared anatomy specs (ticket 05), and whether the icon set is pinned to a fixed Lucide version.
