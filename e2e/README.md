# Paybacker E2E UAT Suite

Playwright suite covering acquisition funnel + authenticated dashboard flows.
Two projects: `desktop-chromium` (default) and `iphone-17-pro-max` (430×932).

## First run

```bash
# 1. Copy creds template and fill in
cp .env.e2e.example .env.e2e

# 2. Install browsers (once)
npx playwright install chromium

# 3. Run — boots the dev server on :3000 automatically
npm run test:e2e
```

## Useful commands

| Command                            | What it does                                                   |
| ---------------------------------- | -------------------------------------------------------------- |
| `npm run test:e2e`                 | Full suite, headless, both projects                            |
| `npm run test:e2e:headed`          | Watch the browser drive the tests                              |
| `npm run test:e2e:ui`              | Playwright's interactive UI runner                             |
| `npm run test:e2e:mobile`          | Only the mobile viewport project                               |
| `npm run test:e2e:desktop`         | Only desktop                                                   |
| `npm run test:e2e:prod`            | Run against https://paybacker.co.uk (read-only, no dev server) |
| `npm run test:e2e:report`          | Open the HTML report after a run                               |

## Scope

| Spec                         | Covers                                                                   |
| ---------------------------- | ------------------------------------------------------------------------ |
| `auth.spec.ts`               | Login/signup page shape, invalid creds, successful login                 |
| `dashboard-routes.spec.ts`   | Every authenticated dashboard route loads without runtime error          |
| `money-hub.spec.ts`          | Tabs, month nav tap targets, drill-down modal, Net Worth Pro states      |
| `subscriptions.spec.ts`      | List, Add modal, card action tap targets; add/delete gated on DESTRUCTIVE |
| `complaints.spec.ts`         | New dispute chooser shows both entry points; scratch form fields mount    |
| `profile.spec.ts`            | Profile info visible; Connect Email modal opens + close target is 44×44   |
| `mobile.spec.ts`             | No horizontal scroll on any route at 430px; deal dismiss visible on touch |

## Safety

- **Destructive tests are opt-in.** `DESTRUCTIVE=1 npm run test:e2e` is required to run the add-then-delete subscription flow. Running `test:e2e:prod` without that flag is read-only.
- **Credentials stay local.** `.env.e2e` is gitignored. Never commit real passwords.
- **No OAuth driving.** Google OAuth in tests would require real interstitials; we only assert the buttons exist and are tappable.

## Updating when UI changes

Most specs use accessible-name locators (`getByRole`, `getByLabel`) so they're stable across copy tweaks. If a test breaks after a UI change, first check whether the test's accessibility assumption still holds — missing `aria-label`s are often the real issue, not the test.
