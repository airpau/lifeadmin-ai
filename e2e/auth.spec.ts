import { test, expect, loginViaForm, hasCreds, dismissCookieBanner } from './fixtures/auth';

/**
 * Auth UAT — login flow, invalid creds, session persistence.
 * Read-only. Doesn't touch OAuth (would require real Google interaction).
 */

test.describe('Auth', () => {
  test('login page loads with all required fields', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: /log in|sign in|welcome/i })).toBeVisible();
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /log in|sign in/i })).toBeVisible();
    // "Forgot password" link should exist and be reachable
    await expect(page.getByRole('link', { name: /forgot/i })).toBeVisible();
    // OAuth button present
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
  });

  test('signup page loads with consent checkboxes', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.getByRole('heading', { name: /sign up|create|join/i })).toBeVisible();
    // Terms + privacy consent checkbox is mandatory
    const consentCheckbox = page.getByRole('checkbox').first();
    await expect(consentCheckbox).toBeVisible();
    // Must NOT be able to submit without checking it
    const submit = page.getByRole('button', { name: /sign up|create account/i });
    await expect(submit).toBeDisabled();
  });

  test('invalid credentials show an error', async ({ page }) => {
    await page.goto('/auth/login');
    // Wait for form to be fully mounted
    await page.locator('input#email').waitFor({ state: 'visible' });
    await page.locator('input#email').fill('invalid-e2e@example.com');
    await page.locator('input#password').fill('wrong-password-12345');
    // Submit via Enter on password field (avoids cookie-banner click-intercept at bottom)
    await page.locator('input#password').press('Enter');
    // Expect an error message; wording is permissive since it might be
    // "Invalid credentials" or "Email or password is incorrect"
    await expect(
      page.getByText(/invalid|incorrect|wrong|not found/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    // Must stay on login page
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('valid credentials authenticate and land on dashboard or gate', async ({ page }) => {
    test.skip(!hasCreds, 'E2E_EMAIL / E2E_PASSWORD not set in .env.e2e');
    await loginViaForm(page);
    const url = new URL(page.url());
    expect(
      ['/dashboard', '/onboarding', '/auth/accept-terms'].some((prefix) =>
        url.pathname.startsWith(prefix),
      ),
    ).toBeTruthy();
  });
});
