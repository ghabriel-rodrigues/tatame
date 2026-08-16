/**
 * web-07 smokes 3 + 4 — route guards over the real session boot:
 * anonymous visitors bounce to /login with ?next=, and a persona without a
 * web surface (professor) is redirected to /baixe-o-app, /admin included.
 */
import { expect, test } from '@playwright/test';
import { PROFESSOR_EMAIL, login } from './support/auth';

test('anonymous /admin visit redirects to /login preserving next', async ({
  page,
}) => {
  await page.goto('/admin');

  await page.waitForURL('**/login?next=%2Fadmin');
  await expect(
    page.getByRole('button', { name: 'Entrar', exact: true }),
  ).toBeVisible();
});

test('professor login is sent to /baixe-o-app and denied the admin console', async ({
  page,
}) => {
  await login(page, PROFESSOR_EMAIL);

  await page.waitForURL('**/baixe-o-app');
  await expect(page.getByText('Baixe o app do Tatame')).toBeVisible();

  // A direct /admin visit re-boots the session from the cookie and the
  // guard still routes the professor to their own surface.
  await page.goto('/admin');
  await page.waitForURL('**/baixe-o-app');
});
