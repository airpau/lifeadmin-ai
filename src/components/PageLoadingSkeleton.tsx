/**
 * Page-level loading skeleton.
 *
 * Drop-in replacement for the centred-spinner empty state that
 * Subscriptions / Profile / Settings/MCP / Notifications currently
 * render while their initial fetches resolve. The full-page spinner
 * left users staring at a blank screen for 4-7s with no signal that
 * anything was about to appear; the skeleton gives a clear "page is
 * about to render here" cue while the data loads in the background.
 *
 * Sizes the skeleton blocks to roughly match the content shape so
 * the layout doesn't shift when data arrives. Animation is css-only
 * so we don't add a JS cost on already-slow renders.
 */

interface Props {
  title: string;
  subtitle?: string;
  /** Number of skeleton card rows. Default 4. */
  cards?: number;
}

export default function PageLoadingSkeleton({ title, subtitle, cards = 4 }: Props) {
  return (
    <div className="max-w-7xl px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
      {subtitle && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
      )}
      <div className="mt-6 space-y-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800/50 animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
