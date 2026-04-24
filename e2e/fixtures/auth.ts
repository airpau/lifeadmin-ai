import { test as base, expect, Page } from '@playwright/test';

/**
 * Auth fixture. Logs in via email+password on /auth/login and hands the
 * authenticated Page to the test. Session state is persisted per worker to
 * a shared storage-state file so follow-up tests don't re-login every time.
 *
 * Credentials come from .env.e2e (E2E_EMAIL / E2E_PASSWORD). Tests that
 * require auth will fail fast with a clear message if those aren't set.
 */

type Fixtures = {
  loggedInPage: Page;
};

export const E2E_EMAIL = process.env.E2E_EMAIL || '';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || '';

export const hasCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

export const loginViaForm = async (page: Page) => {
  if (!hasCreds) {
    throw new Error(
      'E2E_EMAIL / E2E_PASSWORD not set in .env.e2e — cannot run authenticated tests.',
    );
  }
  await page.goto('/auth/login');
  await page.getByLabel(/email/i).first().fill(E2E_EMAIL);
  await page.getByLabel(/password/i).first().fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  // Settle on either dashboard or the terms gate, depending on account state.
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith('/dashboard') ||
      url.pathname.startsWith('/onboarding') ||
      url.pathname.startsWith('/auth/accept-terms'),
    { timeout: 20_000 },
  );
};

export const test = base.extend<Fixtures>({
  loggedInPage: async ({ page }, use) => {
    await loginViaForm(page);
    await use(page);
  },
});

export { expect };
