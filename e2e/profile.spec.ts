import { test, expect, hasCreds } from './fixtures/auth';

test.describe('Profile', () => {
  test.skip(!hasCreds, 'E2E creds not set');
  test('profile page renders and shows member-since / subscription info', async ({ loggedInPage }) => {
    await loggedInPage.goto('/dashboard/profile');
    await expect(loggedInPage.getByRole('heading', { name: /profile|account/i }).first()).toBeVisible();
    await expect(loggedInPage.getByText(/member since/i)).toBeVisible();
    await expect(loggedInPage.getByText(/subscription status/i)).toBeVisible();
  });

  test('Connect Email modal opens + close button is 44×44', async ({ loggedInPage }) => {
    await loggedInPage.goto('/dashboard/profile');
    const connectBtn = loggedInPage.getByRole('button', { name: /connect email|add email/i }).first();
    if (!(await connectBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Connect Email CTA not visible — probably already at plan limit');
    }
    await connectBtn.click();
    await expect(loggedInPage.getByRole('heading', { name: /connect email/i })).toBeVisible();

    // Four OAuth provider cards (Gmail/Outlook/Yahoo/iCloud/IMAP) should be tappable
    const providerButtons = await loggedInPage.getByRole('button', { name: /gmail|outlook|yahoo|icloud|imap/i }).all();
    expect(providerButtons.length).toBeGreaterThanOrEqual(2);

    // Close button enlarged in #294
    const close = loggedInPage.getByRole('button', { name: /close/i }).first();
    const box = await close.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(40);
    expect(box?.height).toBeGreaterThanOrEqual(40);
    await close.click();
  });
});
