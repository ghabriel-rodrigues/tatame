import { VersioningType, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

/** URI versioning (/v1) — must be enabled before the OpenAPI scan. */
export function configureVersioning(app: INestApplication): void {
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}

/**
 * OpenAPI document for the identity surface. Shared by the runtime /docs
 * routes and the headless `openapi` emit target (web-03 contract pipeline).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Tatame API')
      .setDescription(
        'Identity (spec 001-auth), enrollment (spec 003) and attendance (spec 004) surfaces. ' +
          'Errors are RFC 9457 application/problem+json with stable `code`s. The live-chamada ' +
          'SSE stream is a documented exception to the generated REST contract: its event ' +
          'payloads are component schemas, but clients wire their own streaming primitive.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth')
      .addTag('public')
      .addTag('invites')
      .addTag('admin')
      .addTag('professor')
      .addTag('aluno')
      .addTag('responsavel')
      .addTag('billing')
      .addTag('store')
      .addTag('platform')
      .build(),
  );
}

/**
 * App-level HTTP configuration shared by main.ts and the e2e harness so tests
 * exercise the exact production surface: URI versioning (/v1), cookies, and
 * the OpenAPI runtime routes (/docs + /docs-json, bearer scheme).
 */
export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  configureVersioning(app);
  app.enableShutdownHooks();

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
}
