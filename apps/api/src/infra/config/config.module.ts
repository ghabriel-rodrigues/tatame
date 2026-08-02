import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG, buildAppConfig, validateEnv } from './app-config.js';

/**
 * @Global by design (module-sharing rule: config/logger only). Wraps
 * @nestjs/config with the zod-validated, typed APP_CONFIG provider.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // .env at the workspace root (dev); real envs inject variables directly.
      envFilePath: ['.env', '../../.env'],
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => buildAppConfig(validateEnv(process.env)),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
