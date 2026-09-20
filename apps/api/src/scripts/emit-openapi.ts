/**
 * Headless OpenAPI emit (web-03 pipeline): boots Nest WITHOUT listening or
 * touching the database (pools are lazy), writes the /docs-json document to
 * the shared contract location, and exits. Wired as `nx run api:openapi`;
 * `nx run shared:generate-api` turns the artifact into `schema.d.ts`.
 *
 * Usage: node dist/emit-openapi.cjs [output-path]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Safe placeholders so the env contract passes headless (no DB connection is
// ever opened — document generation only reads route/DTO metadata).
process.env['DATABASE_URL'] ??= 'postgresql://emit:emit@localhost:5432/emit';
process.env['JWT_ACCESS_SECRET'] ??= 'openapi-emit-placeholder-secret';

const OUTPUT = resolve(
  process.argv[2] ?? '../../packages/shared/src/api/openapi.json',
);

async function emit(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app/app.module.js');
  const { buildOpenApiDocument, configureVersioning } =
    await import('../app/setup.js');

  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    configureVersioning(app);
    const document = buildOpenApiDocument(app);
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log(`OpenAPI document written to ${OUTPUT}`);
  } finally {
    await app.close();
  }
}

emit().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
