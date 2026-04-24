import { test, expect, Page } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_USER_EMAIL;
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD;

const hasAuthCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

test.describe('subscriptions — public-facing smoke', () => {
  test('landing page renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/Paybacker|LifeAdmin/i);
    expect(errors, `page errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
  });

  test('subscriptions page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard/subscriptions');
    // Either server-side redirect to /auth/login OR a client-side auth gate
    await expect(page).toHaveURL(/\/(auth|login)/, { timeout: 10_000 });
  });
});

test.describe('subscriptions — authenticated golden paths', () => {
  test.skip(!hasAuthCreds, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run');

  const login = async (page: Page) => {
    await page.goto('/auth/login');
    await page.getByRole('textbox', { name: /email/i }).fill(E2E_EMAIL!);
    await page.getByRole('textbox', { name: /password/i }).fill(E2E_PASSWORD!);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  };

  test('subscriptions page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await login(page);
    await page.goto('/dashboard/subscriptions');
    await expect(page.getByRole('heading', { name: /subscriptions/i })).toBeVisible();
    expect(errors, `page errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('add → edit → delete manual subscription', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/subscriptions');

    const unique = `E2E Test ${Date.now()}`;

    // Add
    await page.getByRole('button', { name: /add manually/i }).click();
    await page.getByLabel(/provider name/i).fill(unique);
    await page.getByLabel(/amount/i).first().fill('9.99');
    await page.getByRole('button', { name: /^add subscription$/i }).click();

    const row = page.locator('div', { hasText: unique }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Edit
    await row.getByRole('button', { name: /edit/i }).click();
    const amountField = page.getByLabel(/amount/i).first();
    await amountField.fill('12.34');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('£12.34').first()).toBeVisible();

    // Delete
    await row.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByText(unique)).toHaveCount(0, { timeout: 10_000 });
  });

  test('bulk selection bar shows correct count', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/subscriptions');

    // Select first two rows if any
    const checkboxes = page.locator('[class*="rounded border"]').filter({ hasText: '' });
    const count = await checkboxes.count();
    if (count < 2) test.skip(true, 'Need ≥2 subscriptions for bulk test');

    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await expect(page.getByText(/2 selected/)).toBeVisible();
    await page.getByRole('button', { name: /deselect/i }).click();
    await expect(page.getByText(/selected/i)).toHaveCount(0);
  });
});
