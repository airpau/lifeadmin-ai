// /dashboard/complaints is the legacy route — kept alive only for old
// links (blog posts, emails, deep-links from PriceIncreaseCard etc).
// The canonical, user-facing URL is /dashboard/disputes — the sidebar,
// onboarding, and all new copy point there.
//
// 17 files still reference the legacy path; they continue to work via
// this redirect. New code should link to /dashboard/disputes directly.

import { redirect } from 'next/navigation';

export default function ComplaintsLegacyRedirect({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Preserve query params so deep-links keep their context (company, issue,
  // amount, alertId, type, etc).
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, item);
    } else if (v != null) {
      qs.set(k, v);
    }
  }
  const target = qs.toString()
    ? `/dashboard/disputes?${qs.toString()}`
    : '/dashboard/disputes';
  redirect(target);
}
