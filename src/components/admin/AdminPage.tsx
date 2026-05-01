import type { ReactNode } from 'react';
import AdminBackLink from './AdminBackLink';

interface AdminPageProps {
  /** H1 page title rendered at the top. */
  title: string;
  /** Optional one-line subtitle/eyebrow under the H1. */
  description?: string;
  /** Right-side actions (buttons, CTAs) — rendered next to the title. */
  actions?: ReactNode;
  /** Override the back-link target. Defaults to /dashboard/admin. */
  backHref?: string;
  /** Override the back-link label. Defaults to "Back to Admin". */
  backLabel?: string;
  /** Hide the back link entirely (for the admin overview page itself). */
  hideBack?: boolean;
  children: ReactNode;
}

/**
 * Shared chrome wrapper for every admin sub-page under /dashboard/admin/*.
 *
 * Before this existed each sub-page rolled its own root container —
 * some were dark (`bg-slate-950 text-white`), some were light, and
 * max-widths varied between `max-w-2xl`, `max-w-5xl`, `max-w-6xl` and
 * `max-w-7xl`. The result was visual chaos when switching between
 * tabs from the AdminTabStrip.
 *
 * This component normalises:
 * - max-width to `max-w-7xl` so wide tables (cron jobs, analytics)
 *   have room to breathe without dwarfing narrow pages
 * - light theme matching the dashboard shell paper background
 *   (`.shell-v2 .main-inner` is `var(--paper)` = #FAFAF7)
 * - heading hierarchy: H1 = `text-2xl lg:text-3xl font-semibold`
 * - consistent vertical rhythm via `space-y-6 lg:space-y-8`
 * - a back-link to /dashboard/admin so the founder isn't relying on
 *   browser back to navigate the admin tree
 */
export default function AdminPage({
  title,
  description,
  actions,
  backHref,
  backLabel,
  hideBack = false,
  children,
}: AdminPageProps) {
  return (
    <div className="admin-page max-w-7xl mx-auto w-full">
      {!hideBack && <AdminBackLink href={backHref} label={backLabel} />}
      <div className="admin-page-head flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900 break-words">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm lg:text-[15px] text-slate-600 max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      <div className="space-y-6 lg:space-y-8">{children}</div>
    </div>
  );
}
