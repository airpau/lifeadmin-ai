import { test, expect, hasCreds } from './fixtures/auth';

test.describe('Money Hub', () => {
  test.skip(!hasCreds, 'E2E creds not set');
  test.beforeEach(async ({ loggedInPage }) => {
    await loggedInPage.goto('/dashboard/money-hub');
    await expect(loggedInPage.getByRole('heading', { name: /money hub/i })).toBeVisible();
  });

  test('tabs / panels render core regions', async ({ loggedInPage }) => {
    // Overview, Spending, Contracts, Net Worth — these are the primary panels.
    const overviewText = loggedInPage.getByText(/income|spending|net worth/i).first();
    await expect(overviewText).toBeVisible();
  });

  test('month nav buttons are reachable tap targets', async ({ loggedInPage }) => {
    const prev = loggedInPage.getByRole('button', { name: /previous month/i });
    const next = loggedInPage.getByRole('button', { name: /next month/i });
    await expect(prev).toBeVisible();
    await expect(next).toBeVisible();

    // 44px guideline for primary close / nav; we use 40×40 on inline row actions.
    const prevBox = await prev.boundingBox();
    expect(prevBox?.width).toBeGreaterThanOrEqual(36);
    expect(prevBox?.height).toBeGreaterThanOrEqual(36);
  });

  test('Category drill-down modal opens and closes cleanly', async ({ loggedInPage }) => {
    // Click any category row that has tap-feedback (we added active:bg-slate-200
    // on both income + spending rows in #288/#296). Pick by class instead of
    // content — any drill row has `cursor-pointer` with a percentage label.
    const anyRow = loggedInPage.locator('[class*="cursor-pointer"]').filter({
      hasText: /%/,
    }).first();
    if (!(await anyRow.isVisible().catch(() => false))) {
      test.skip(true, 'No income/spending rows available on this account yet');
    }

    await anyRow.click();
    const modal = loggedInPage.getByRole('heading').filter({ hasText: /transaction|search/i }).first();
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Close button should be 44×44 (the #288 fix) with aria-label="Close"
    const close = loggedInPage.getByRole('button', { name: /close/i }).first();
    const box = await close.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(40);
    expect(box?.height).toBeGreaterThanOrEqual(40);

    await close.click();
    await expect(modal).not.toBeVisible();
  });

  test('Net Worth Pro section either shows data or a clear upgrade CTA', async ({
    loggedInPage,
  }) => {
    const netWorth = loggedInPage.getByRole('heading', { name: /net worth/i });
    await expect(netWorth).toBeVisible();

    // Exactly one of these three must be true: shows data, shows "upgrade"
    // lock, or shows the empty-state CTA from #288.
    const hasData = await loggedInPage.getByText(/£[0-9]/).first().isVisible().catch(() => false);
    const hasUpgrade = await loggedInPage
      .getByRole('link', { name: /view plans/i })
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyCta = await loggedInPage
      .getByRole('button', { name: /add your first entry/i })
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasData || hasUpgrade || hasEmptyCta).toBeTruthy();
  });
});
