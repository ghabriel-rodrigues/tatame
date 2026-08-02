import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createAppDb, createPlatformDb, type DbHandle } from '@tatame/db';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

/**
 * RLS-enforced pool (`tatame_app`). ALL tenant/persona traffic goes through
 * `withTenant` on this handle; the pre-auth SECURITY DEFINER seams are also
 * executed here (they are the only RLS bypass the app role has).
 */
export const APP_DB = Symbol('APP_DB');

/**
 * BYPASSRLS pool (`tatame_platform`). Inject exclusively into platform-scope
 * providers (impersonation mint, platform console) — never into tenant
 * feature services.
 */
export const PLATFORM_DB = Symbol('PLATFORM_DB');

/** Closes both pools on shutdown (graceful-shutdown wiki rule). */
@Injectable()
class DbLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    @Inject(PLATFORM_DB) private readonly platformDb: DbHandle,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.appDb.close(), this.platformDb.close()]);
  }
}

@Module({
  providers: [
    {
      provide: APP_DB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DbHandle =>
        createAppDb(config.databaseUrl, {
          // Test containers connect as superuser; SET ROLE still applies RLS
          // because tatame_app is NOBYPASSRLS.
          max: 10,
        }),
    },
    {
      provide: PLATFORM_DB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DbHandle => createPlatformDb(config.databaseUrl, { max: 5 }),
    },
    DbLifecycle,
  ],
  exports: [APP_DB, PLATFORM_DB],
})
export class DbModule {}
