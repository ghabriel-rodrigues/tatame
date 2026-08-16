/**
 * web-07 smoke 6 — Convite invalid token: the public invite flow renders
 * the friendly unavailable state (no crash, no console redirect) when the
 * API refuses the token.
 */
import { expect, test } from '@playwright/test';

test('invalid invite token shows the friendly unavailable state', async ({
  page,
}) => {
  await page.goto('/convite/invalid-token-e2e');

  await expect(page.getByText('Convite indisponível')).toBeVisible();
  await expect(page.getByText('peça um novo', { exact: false })).toBeVisible();
});
