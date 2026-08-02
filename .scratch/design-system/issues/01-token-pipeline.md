# Token pipeline: Lumira CSS to multi-platform outputs

Type: research
Status: open

## Question

How do we turn `colors_and_type.css` (Lumira CSS custom properties: color scales, semantic tokens, type scale, spacing, radii, shadows, glass, motion) into a single-source token pipeline that emits per-platform artifacts? Evaluate style-dictionary (and alternatives such as Tokens Studio / Terrazzo / cobalt) for producing: CSS variables + typed TS constants for web, TS constants for React Native, XML resources and/or Compose `Color`/`Typography` objects for Kotlin, and Swift assets (`Color` extensions / asset catalogs) for iOS. Decide the canonical token format (DTCG JSON?), where the pipeline lives in the nx monorepo, how composite tokens (shadows, glass surfaces, motion curves) degrade on platforms that can't express them natively, and how the runtime-only prototype tokens (`--purple-ink`, `--pink-ink`) get promoted into the canonical set.
