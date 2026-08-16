/**
 * web-07 smoke 1 — login happy path: admin credentials against the real
 * API set the refresh cookie and land on the academy console.
 */
import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, login } from './support/auth';

test('admin login lands on the academy console', async ({ page }) => {
  await login(page, ADMIN_EMAIL);

  await page.waitForURL('**/admin');
  await expect(
    page.getByRole('navigation', { name: 'Seções do painel' }),
  ).toBeVisible();
  // The console header carries the active academy identity from /auth/me.
  await expect(page.getByText('Alpha Jiu-Jitsu').first()).toBeVisible();
});
