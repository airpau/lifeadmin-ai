import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Paybacker E2E UAT suite.
 *
 * Defaults to a local dev server on :3000 — set BASE_URL to a deployed URL
 * (e.g. https://paybacker.co.uk) for smoke-testing production. Credentials
 * come from .env.e2e (see .env.e2e.example); never commit them.
 *
 * Destructive mutations (creating disputes, deleting subscriptions) are gated
 * behind DESTRUCTIVE=1 so a bare `npm run test:e2e` against prod can't delete
 * real data.
 */

require('dotenv').config({ path: path.resolve(__dirname, '.env.e2e') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const IS_PROD = /paybacker\.co\.uk/i.test(BASE_URL);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'iphone-17-pro-max',
      use: {
        ...devices['iPhone 14 Pro Max'],
        viewport: { width: 430, height: 932 },
      },
    },
  ],

  // Only boot the dev server when running against localhost. Skip if BASE_URL
  // points at a deployed environment — we don't want to double-start Next.
  webServer: IS_PROD
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
