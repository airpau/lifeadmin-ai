import { test, expect, hasCreds } from './fixtures/auth';

/**
 * Mobile-specific regression suite — runs under the iphone-17-pro-max project.
 * The acceptance criterion from PRs #288/#290/#294/#296: no route causes
 * horizontal scroll and no fixed-width element exceeds the viewport width.
 *
 * Destructive mutations stay in subscriptions.spec.ts behind DESTRUCTIVE=1.
 */

test.describe('Mobile viewport regressions (430px)', () => {
  test.skip(!hasCreds, 'E2E creds not set');

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'iphone-17-pro-max',
      'Mobile regressions only run under the iphone-17-pro-max project',
    );
  });
  const MOBILE_ROUTES = [
    '/dashboard',
    '/dashboard/money-hub',
    '/dashboard/subscriptions',
    '/dashboard/complaints',
    '/dashboard/profile',
    '/dashboard/settings',
    '/dashboard/deals',
    '/dashboard/contracts',
  ];

  for (const route of MOBILE_ROUTES) {
    test(`${route} has no horizontal scroll`, async ({ loggedInPage }) => {
      await loggedInPage.goto(route);
      // Wait for at least one main heading to guarantee the page laid out
      await loggedInPage.waitForLoadState('networkidle');

      const overflow = await loggedInPage.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return {
          scrollWidth: Math.max(body.scrollWidth, html.scrollWidth),
          clientWidth: Math.max(body.clientWidth, html.clientWidth),
        };
      });

      expect(overflow.scrollWidth, `${route} horizontal scroll`).toBeLessThanOrEqual(
        overflow.clientWidth + 1, // subpixel tolerance
      );
    });
  }

  test('pricing page comparison table scrolls horizontally at 430px', async ({ loggedInPage }) => {
    await loggedInPage.goto('/pricing');
    await loggedInPage.waitForLoadState('networkidle');

    // The table wrapper should be overflow-x:auto with rows ≥ 540px (from #299).
    const wrapper = loggedInPage.locator('.compare-table-wrap').first();
    if (await wrapper.isVisible().catch(() => false)) {
      const overflow = await wrapper.evaluate(
        (el) => el.scrollWidth > el.clientWidth + 1,
      );
      expect(overflow).toBeTruthy();
    }

    // Outer body must NOT horizontally scroll
    const bodyOverflow = await loggedInPage.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth - html.clientWidth;
    });
    expect(bodyOverflow).toBeLessThanOrEqual(1);
  });

  test('deal card dismiss button is visible on mobile (was opacity-0 group-hover before #294)', async ({
    loggedInPage,
  }) => {
    await loggedInPage.goto('/dashboard/deals');
    await loggedInPage.waitForLoadState('networkidle');
    const dismiss = loggedInPage.getByRole('button', { name: /dismiss deal/i }).first();
    if (!(await dismiss.isVisible().catch(() => false))) {
      test.skip(true, 'No deals rendered — either no personalised deals yet or user is not on Pro');
    }
    // opacity should be effectively 1 on mobile (the #294 fix)
    const opacity = await dismiss.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.9);
  });
});
