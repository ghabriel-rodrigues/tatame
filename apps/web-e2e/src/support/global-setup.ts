/**
 * RLS.7 — real-stack prerequisites: compose Postgres up (host port from the
 * root `.env`, 5433 in dev), migrations applied, dev fixtures seeded
 * (admin@tatame.dev / professor@tatame.dev / etc — packages/db/src/seed).
 * Everything here is idempotent; a stack already up is left untouched.
 */
import { execSync } from 'node:child_process';
import { workspaceRoot } from '@nx/devkit';

/** `docker compose` (v2 plugin) or the standalone `docker-compose` binary. */
function composeCommand(): string {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return 'docker compose';
  } catch {
    return 'docker-compose';
  }
}

export default function globalSetup(): void {
  // Matches apps/api/.env and the compose defaults with the root .env
  // (POSTGRES_PORT=5433); override by exporting DATABASE_URL.
  const databaseUrl =
    process.env['DATABASE_URL'] ??
    'postgresql://tatame:tatame_dev@localhost:5433/tatame';

  const run = (command: string): void => {
    execSync(command, {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  };

  // --wait blocks on the container healthcheck (pg_isready).
  run(`${composeCommand()} up -d --wait postgres`);
  run('pnpm nx run db:migrate');
  run('pnpm nx run db:seed');
}
