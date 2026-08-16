/**
 * web-07 smoke 2 — silent refresh: a full page reload drops the in-memory
 * access token; the boot-time cookie refresh must restore the session
 * without bouncing through /login.
 */
import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, login } from './support/auth';

test('page reload keeps the session via the silent cookie refresh', async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL);
  await page.waitForURL('**/admin');

  await page.reload();

  await expect(
    page.getByRole('navigation', { name: 'Seções do painel' }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/admin');
});
