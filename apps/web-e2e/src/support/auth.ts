/**
 * Shared login helper for the smoke lane. Credentials come from the dev
 * seed (packages/db/src/seed/dev.ts — one known password for every
 * persona account).
 */
import type { Page } from '@playwright/test';

export const DEV_PASSWORD = 'TatameDev!123';

export const ADMIN_EMAIL = 'admin@tatame.dev';
export const PROFESSOR_EMAIL = 'professor@tatame.dev';

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  // exact: the visibility toggle's aria-label ("Mostrar senha") would also
  // match a substring "Senha" lookup.
  await page.getByLabel('Senha', { exact: true }).fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
