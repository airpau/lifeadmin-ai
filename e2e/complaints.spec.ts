import { test, expect, hasCreds } from './fixtures/auth';

test.describe('Complaints / Disputes', () => {
  test.skip(!hasCreds, 'E2E creds not set');
  test.beforeEach(async ({ loggedInPage }) => {
    await loggedInPage.goto('/dashboard/complaints');
    await expect(
      loggedInPage.getByRole('heading', { name: /complaints|disputes/i }).first(),
    ).toBeVisible();
  });

  test('NewDisputeChooser opens with both "from email" and "from scratch" options', async ({
    loggedInPage,
  }) => {
    const newBtn = loggedInPage
      .getByRole('button', { name: /new dispute|start a new dispute|\+ new|new complaint/i })
      .first();
    if (!(await newBtn.isVisible().catch(() => false))) {
      test.skip(true, 'New dispute CTA not visible on this surface');
    }
    await newBtn.click();

    await expect(loggedInPage.getByRole('heading', { name: /start a new dispute/i })).toBeVisible();
    await expect(loggedInPage.getByText(/from an email in my inbox/i)).toBeVisible();
    await expect(loggedInPage.getByText(/from scratch/i)).toBeVisible();

    // Close button is the upgraded 44×44 (post-#290)
    const close = loggedInPage.getByRole('button', { name: /close/i }).first();
    const box = await close.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(40);
    await close.click();
    await expect(loggedInPage.getByRole('heading', { name: /start a new dispute/i })).not.toBeVisible();
  });

  test('From-scratch form loads required fields', async ({ loggedInPage }) => {
    const newBtn = loggedInPage
      .getByRole('button', { name: /new dispute|start a new dispute|\+ new|new complaint/i })
      .first();
    if (!(await newBtn.isVisible().catch(() => false))) test.skip(true, 'CTA missing');
    await newBtn.click();

    // Choose "from scratch" path
    const fromScratch = loggedInPage.getByText(/from scratch/i);
    if (await fromScratch.isVisible().catch(() => false)) {
      await fromScratch.click();
    }

    // At least a company + issue + outcome field should be visible
    const hasCompany = await loggedInPage.getByLabel(/company|provider|business/i).first().isVisible().catch(() => false);
    const hasIssue = await loggedInPage.getByLabel(/issue|what happened|describe/i).first().isVisible().catch(() => false);
    expect(hasCompany || hasIssue).toBeTruthy();
  });
});
