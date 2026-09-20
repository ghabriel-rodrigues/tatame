import { and, eq } from 'drizzle-orm';
import type { Database, DbTransaction } from '../lib/client.js';
import { withPlatform } from '../lib/client.js';
import { beltLadders, belts, martialArts } from '../schema/index.js';

/**
 * Shared belt catalog (spec 005 GRD.1) — production data, seeded through the
 * platform (BYPASSRLS) pool per the platform_plans convention (the app role
 * cannot write catalogs by construction). Idempotent upserts keyed on the
 * natural keys: `martial_arts.key`, `(martial_art_id, kind)`,
 * `(ladder_id, position)`.
 *
 * Colors are design-token SLUGS from the resolved belt-tokenization ticket
 * (`color.belt.*` namespace) — never hex. Ladder contents per the handoff
 * régua: adult Branca → Azul → Roxa → Marrom → Preta (6 dans, red tip) →
 * Vermelha (no degree stripes in v1); kids Cinza → Amarela → Laranja → Verde
 * (max 4 each) — deliberately WITHOUT a white row (Branca lives in the adult
 * ladder; the merged display order is a server-side rule).
 */

export interface BeltCatalogBelt {
  position: number;
  /** PT-BR display name (client copy). */
  name: string;
  colorSlug: string;
  tipColorSlug: string | null;
  maxDegrees: number;
}

export interface BeltCatalogLadder {
  kind: 'adult' | 'kids';
  name: string;
  belts: BeltCatalogBelt[];
}

export interface BeltCatalogArt {
  key: string;
  name: string;
  ladders: BeltCatalogLadder[];
}

export const BELT_CATALOG: BeltCatalogArt[] = [
  {
    key: 'bjj',
    name: 'Jiu-Jitsu Brasileiro',
    ladders: [
      {
        kind: 'adult',
        name: 'Adulto',
        belts: [
          {
            position: 1,
            name: 'Branca',
            colorSlug: 'belt.white',
            tipColorSlug: null,
            maxDegrees: 4,
          },
          {
            position: 2,
            name: 'Azul',
            colorSlug: 'belt.blue',
            tipColorSlug: null,
            maxDegrees: 4,
          },
          {
            position: 3,
            name: 'Roxa',
            colorSlug: 'belt.purple',
            tipColorSlug: null,
            maxDegrees: 4,
          },
          {
            position: 4,
            name: 'Marrom',
            colorSlug: 'belt.brown',
            tipColorSlug: null,
            maxDegrees: 4,
          },
          // Black belt: 6 dans, red ponteira with white dan stripes.
          {
            position: 5,
            name: 'Preta',
            colorSlug: 'belt.black',
            tipColorSlug: 'belt.red',
            maxDegrees: 6,
          },
          // Red belt renders no degree stripes in v1.
          {
            position: 6,
            name: 'Vermelha',
            colorSlug: 'belt.red',
            tipColorSlug: null,
            maxDegrees: 0,
          },
        ],
      },
      {
        kind: 'kids',
        name: 'Kids',
        belts: [
          {
            position: 1,
            name: 'Cinza',
            colorSlug: 'belt.gray',
            tipColorSlug: null,
            maxDegrees: 4,
          },
          {
            position: 2,
            name: 'Amarela',
            colorSlug: 'belt.yellow',
            tipColorSlug: null,
            maxDegrees: 4,
          },
          {
            position: 3,
            name: 'Laranja',
            colorSlug: 'belt.orange',
            tipColorSlug: null,
            maxDegrees: 4,
          },
          {
            position: 4,
            name: 'Verde',
            colorSlug: 'belt.green',
            tipColorSlug: null,
            maxDegrees: 4,
          },
        ],
      },
    ],
  },
];

async function upsertArt(
  tx: DbTransaction,
  art: BeltCatalogArt,
): Promise<string> {
  const [row] = await tx
    .insert(martialArts)
    .values({ key: art.key, name: art.name })
    .onConflictDoUpdate({
      target: martialArts.key,
      set: { name: art.name, updatedAt: new Date() },
    })
    .returning({ id: martialArts.id });
  if (!row) throw new Error(`Failed to upsert martial art ${art.key}`);
  return row.id;
}

async function upsertLadder(
  tx: DbTransaction,
  martialArtId: string,
  ladder: BeltCatalogLadder,
): Promise<string> {
  const [row] = await tx
    .insert(beltLadders)
    .values({ martialArtId, kind: ladder.kind, name: ladder.name })
    .onConflictDoUpdate({
      target: [beltLadders.martialArtId, beltLadders.kind],
      set: { name: ladder.name, updatedAt: new Date() },
    })
    .returning({ id: beltLadders.id });
  if (!row) throw new Error(`Failed to upsert belt ladder ${ladder.kind}`);
  return row.id;
}

/** Seeds/updates the shared belt catalog through the platform (BYPASSRLS) pool. */
export async function seedBeltCatalog(platformDb: Database): Promise<void> {
  await withPlatform(platformDb, async (tx) => {
    for (const art of BELT_CATALOG) {
      const artId = await upsertArt(tx, art);
      for (const ladder of art.ladders) {
        const ladderId = await upsertLadder(tx, artId, ladder);
        for (const belt of ladder.belts) {
          await tx
            .insert(belts)
            .values({
              ladderId,
              position: belt.position,
              name: belt.name,
              colorSlug: belt.colorSlug,
              tipColorSlug: belt.tipColorSlug,
              maxDegrees: belt.maxDegrees,
            })
            .onConflictDoUpdate({
              target: [belts.ladderId, belts.position],
              set: {
                name: belt.name,
                colorSlug: belt.colorSlug,
                tipColorSlug: belt.tipColorSlug,
                maxDegrees: belt.maxDegrees,
                updatedAt: new Date(),
              },
            });
        }
      }
    }
  });
}

/** Resolves a seeded belt id by ladder kind + PT-BR name (helper for fixtures). */
export async function findBeltId(
  tx: DbTransaction,
  ladderKind: 'adult' | 'kids',
  beltName: string,
): Promise<string> {
  const rows = await tx
    .select({ id: belts.id })
    .from(belts)
    .innerJoin(beltLadders, eq(beltLadders.id, belts.ladderId))
    .where(and(eq(beltLadders.kind, ladderKind), eq(belts.name, beltName)));
  const row = rows[0];
  if (!row)
    throw new Error(
      `Belt ${ladderKind}/${beltName} not seeded — run seedBeltCatalog first`,
    );
  return row.id;
}
