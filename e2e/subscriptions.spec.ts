import { test, expect, hasCreds } from './fixtures/auth';

const DESTRUCTIVE = process.env.DESTRUCTIVE === '1';

test.describe('Subscriptions', () => {
  test.skip(!hasCreds, 'E2E creds not set');
  test.beforeEach(async ({ loggedInPage }) => {
    await loggedInPage.goto('/dashboard/subscriptions');
    await expect(loggedInPage.getByRole('heading', { name: /subscriptions/i })).toBeVisible();
  });

  test('list renders either subscriptions or the empty-state CTA', async ({ loggedInPage }) => {
    const hasSubs = await loggedInPage.locator('[data-needs-review], article, .sub-card').first().isVisible().catch(() => false);
    const hasEmpty = await loggedInPage.getByText(/no subscriptions/i).first().isVisible().catch(() => false);
    expect(hasSubs || hasEmpty).toBeTruthy();
  });

  test('Add subscription modal opens + closes without mutations', async ({ loggedInPage }) => {
    const addBtn = loggedInPage.getByRole('button', { name: /add|new subscription|\+ add/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Add button not visible on this account');
    }
    await addBtn.click();

    // Modal should mount — heading or Amount field indicates the form is there.
    await expect(loggedInPage.getByLabel(/amount/i).first()).toBeVisible();

    // Close via the header X (44×44 after #290)
    const close = loggedInPage.getByRole('button', { name: /close/i }).first();
    const box = await close.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(40);
    await close.click();
  });

  test('subscription card action icons are ≥36px tap targets', async ({ loggedInPage }) => {
    const anyEditBtn = loggedInPage.getByRole('button', { name: /^edit$/i }).first();
    if (!(await anyEditBtn.isVisible().catch(() => false))) {
      test.skip(true, 'No subscription cards to exercise action buttons on');
    }
    const box = await anyEditBtn.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(36);
    expect(box?.height).toBeGreaterThanOrEqual(36);
  });

  test.describe('Destructive', () => {
    test.skip(!DESTRUCTIVE, 'DESTRUCTIVE=1 not set — skipping mutation tests');

    test('can add then delete a throwaway subscription', async ({ loggedInPage }) => {
      const unique = `E2E-${Date.now()}`;
      const addBtn = loggedInPage.getByRole('button', { name: /add|new subscription|\+ add/i }).first();
      await addBtn.click();

      await loggedInPage.getByLabel(/provider|name/i).first().fill(unique);
      await loggedInPage.getByLabel(/amount/i).first().fill('1.00');
      await loggedInPage.getByRole('button', { name: /save|add/i }).last().click();

      await expect(loggedInPage.getByText(unique)).toBeVisible({ timeout: 10_000 });

      // Delete — locate the card then its Delete icon
      const card = loggedInPage.getByText(unique).locator('xpath=ancestor::*[contains(@class,"rounded-2xl")][1]');
      await card.getByRole('button', { name: /^delete$/i }).click();

      // Confirm dialog, if present
      const confirm = loggedInPage.getByRole('button', { name: /confirm|yes|delete/i }).last();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
      }

      await expect(loggedInPage.getByText(unique)).not.toBeVisible({ timeout: 10_000 });
    });
  });
});
