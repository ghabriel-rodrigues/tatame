/**
 * web-07 smoke 5 — logout revocation: "Sair" revokes the refresh session
 * server-side; neither the back button nor a fresh navigation restores the
 * console.
 */
import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, login } from './support/auth';

test('logout lands on login; back button and reload cannot restore', async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL);
  await page.waitForURL('**/admin');

  // Push a second console entry so the back button has somewhere to go.
  await page.getByRole('link', { name: 'Cadastros' }).click();
  await page.waitForURL('**/admin/cadastros');

  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.waitForURL('**/login');

  // Back button: the SPA history returns to /admin, but the store is anon —
  // the guard bounces straight back to /login.
  await page.goBack();
  await page.waitForURL('**/login?next=%2Fadmin');

  // Fresh navigation: the cookie is revoked server-side, so the boot-time
  // silent refresh fails and the guard redirects again.
  await page.goto('/admin');
  await page.waitForURL('**/login?next=%2Fadmin');
  await expect(
    page.getByRole('button', { name: 'Entrar', exact: true }),
  ).toBeVisible();
});
