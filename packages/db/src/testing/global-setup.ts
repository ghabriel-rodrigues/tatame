import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

// Testcontainers resolves the runtime from DOCKER_HOST / the default socket.
// On hosts using colima (no /var/run/docker.sock), point it at the colima
// socket automatically.
if (!process.env['DOCKER_HOST']) {
  const colimaSocket = join(homedir(), '.colima', 'default', 'docker.sock');
  if (existsSync(colimaSocket)) {
    process.env['DOCKER_HOST'] = `unix://${colimaSocket}`;
    // Ryuk mounts the docker socket from inside the colima VM, where it
    // lives at the default path.
    process.env['TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE'] ??=
      '/var/run/docker.sock';
  }
}

/**
 * Starts one Postgres 16 container (Testcontainers) for the whole test run.
 * Each spec file creates its own fresh database on it (see test-db.ts), so
 * "migrations apply cleanly to a fresh database" is exercised per file.
 *
 * The superuser URI is handed to workers via TEST_PG_ADMIN_URL (globalSetup
 * runs before workers spawn, so they inherit the env).
 */
export default async function setup(): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env['TEST_PG_ADMIN_URL'] = container.getConnectionUri();
  return async () => {
    await container.stop();
  };
}
