import { test, expect, hasCreds } from './fixtures/auth';

/**
 * Smoke sweep: every authenticated dashboard route should render without
 * a Next.js error boundary and without 4xx/5xx responses. This is the
 * "does it boot" test — deeper behaviour lives in per-feature specs.
 */

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/money-hub',
  '/dashboard/subscriptions',
  '/dashboard/complaints',
  '/dashboard/contracts',
  '/dashboard/contract-vault',
  '/dashboard/deals',
  '/dashboard/spending',
  '/dashboard/rewards',
  '/dashboard/pocket-agent',
  '/dashboard/notifications',
  '/dashboard/profile',
  '/dashboard/settings',
  '/dashboard/settings/spaces',
  '/dashboard/settings/notifications',
  '/dashboard/settings/telegram',
  '/dashboard/forms',
  '/dashboard/export',
  '/dashboard/tutorials',
  '/dashboard/upgrade',
] as const;

test.describe('Dashboard route smoke', () => {
  test.skip(!hasCreds, 'E2E creds not set');

  test.beforeEach(async ({ loggedInPage }) => {
    // warm session via fixture
    void loggedInPage;
  });

  for (const route of DASHBOARD_ROUTES) {
    test(`${route} renders without crash`, async ({ loggedInPage }) => {
      const errors: string[] = [];
      loggedInPage.on('pageerror', (err) => errors.push(err.message));
      loggedInPage.on('response', (res) => {
        if (res.status() >= 500 && new URL(res.url()).pathname === route) {
          errors.push(`${route} → ${res.status()}`);
        }
      });

      const response = await loggedInPage.goto(route);
      // Either 2xx (render) or 3xx (intentional redirect — e.g. /disputes → /complaints)
      expect(response?.status(), `${route} HTTP status`).toBeLessThan(400);

      // Next.js error overlay usually mounts a role="dialog" with "Application error"
      await expect(
        loggedInPage.getByText(/application error|unhandled runtime error/i),
      ).not.toBeVisible();

      expect(errors, `${route} runtime errors`).toEqual([]);
    });
  }
});
