import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.js';
import { configureApp } from './app/setup.js';
import { APP_CONFIG, type AppConfig } from './infra/config/app-config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
  Logger.log(`Tatame API listening on http://localhost:${config.port}/v1 (docs at /docs)`);
}

void bootstrap();
