/**
 * Regenerates tokens/palette-fixtures.json — the golden fixtures that pin
 * every derivePalette port (TS/Kotlin/Swift) byte-equal (ds-03).
 *
 * 4 ready-made presets x 2 modes, full derived scales, produced by the
 * canonical TS executor. Run only when the recipe intentionally changes:
 *   pnpm --filter @tatame/design-system tokens:fixtures
 * The vitest fixture-lock test re-derives and compares byte-equal; an
 * unintentional math/recipe change fails CI instead of shipping drift.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePalette } from '../src/theme/derive-palette.ts';
import { READY_MADE_PALETTES } from '../src/theme/presets.ts';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const fixtures = {};
for (const [key, brand] of Object.entries(READY_MADE_PALETTES)) {
  fixtures[key] = {
    brand,
    light: derivePalette(brand, 'light'),
    dark: derivePalette(brand, 'dark'),
  };
}

const doc = {
  $description:
    'GENERATED golden fixtures for derivePalette (scripts/generate-fixtures.mjs). 4 ready-made presets x 2 modes, produced by the canonical TS executor. TS, Kotlin, and Swift test suites all assert byte-equal hex output against this file; regenerate only on an intentional recipe change.',
  fixtures,
};

writeFileSync(
  join(pkgRoot, 'tokens/palette-fixtures.json'),
  JSON.stringify(doc, null, 2) + '\n',
);
console.log(
  `[design-system] wrote tokens/palette-fixtures.json (${Object.keys(fixtures).length} presets x 2 modes x ${
    Object.keys(fixtures.roxo.light).length
  } tokens)`,
);
