import { VersioningType, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

/**
 * App-level HTTP configuration shared by main.ts and the e2e harness so tests
 * exercise the exact production surface: URI versioning (/v1), cookies, and
 * the OpenAPI runtime routes (/docs + /docs-json, bearer scheme).
 */
export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Tatame API')
      .setDescription(
        'Identity surface (spec 001-auth). Errors are RFC 9457 application/problem+json with stable `code`s.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth')
      .addTag('public')
      .addTag('invites')
      .addTag('admin')
      .addTag('platform')
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
}
