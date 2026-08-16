'use client';
// src/app/dashboard/money-hub/UpcomingForwardView.tsx
//
// The Money Hub forward view — money LANDING and LEAVING before it
// happens, plus what's LEFT afterwards.
//
// Emma ships "Committed Spending", which is outgoings only. Their
// community has been asking for recurring income since 2020 and it's
// still only in testing, so incoming is the differentiator here and it
// gets equal billing: the answer order is deliberately
// landing → leaving → left.
//
// Accessibility: direction is never carried by colour alone. Every
// amount is prefixed with an explicit + or −, every row has a direction
// icon, and each row carries an aria-label spelling out the direction,
// amount, counterparty and date in words.
//
// Mobile-first: the detail view is a bottom sheet on small screens and
// a centred dialog on sm+, following the pattern established in
// money-hub/transactions/page.tsx.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import type {
  UpcomingApiResponse,
  UpcomingCertainty,
  UpcomingPaymentRow,
} from '@/app/api/money-hub/upcoming/route';

type Window = 7 | 14 | 30;

const fmtGBP = (n: number, digits = 2) =>
  `£${Math.abs(n).toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

const fmtGBP0 = (n: number) => fmtGBP(n, 0);

const CERTAINTY: Record<
  UpcomingCertainty,
  { label: string; short: string; chip: string; blurb: string }
> = {
  bank_scheduled: {
    label: 'Scheduled by your bank',
    short: 'Bank scheduled',
    chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    blurb:
      'Your bank has already scheduled this. It is the strongest signal we have that it will happen on this date.',
  },
  regular: {
    label: 'Regular payment',
    short: 'Regular',
    chip: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    blurb:
      'A standing order or direct debit mandate on your account. The date is fixed; the amount can vary slightly.',
  },
  predicted: {
    label: 'Predicted',
    short: 'Predicted',
    chip: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    blurb:
      'We spotted this pattern in your history. It has not been confirmed by your bank, so treat the amount as an estimate.',
  },
};

function prettyDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7)
    return d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function longDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export default function UpcomingForwardView({
  variant = 'widget',
  initialWindow,
}: {
  variant?: 'widget' | 'page';
  initialWindow?: Window;
}) {
  const isPage = variant === 'page';
  const [win, setWin] = useState<Window>(initialWindow ?? 30);
  const [includePredicted, setIncludePredicted] = useState(true);
  const [data, setData] = useState<UpcomingApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(isPage);
  const [detail, setDetail] = useState<UpcomingPaymentRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The effect only ever setStates from an async callback — flipping the
  // spinner on is done in the event handlers below, where a synchronous
  // setState is the correct thing to do.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const qs = new URLSearchParams({
      days: String(win),
      predicted: includePredicted ? '1' : '0',
    });

    (async () => {
      try {
        const res = await fetch(`/api/money-hub/upcoming?${qs.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as UpcomingApiResponse;
        if (cancelled) return;
        setData(json);
        setFailed(false);
      } catch {
        if (cancelled) return;
        setData(null);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [win, includePredicted, reloadKey]);

  const changeWindow = useCallback((w: Window) => {
    setLoading(true);
    setWin(w);
  }, []);

  const togglePredicted = useCallback((next: boolean) => {
    setLoading(true);
    setIncludePredicted(next);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setFailed(false);
    setReloadKey((k) => k + 1);
  }, []);

  const groups = useMemo(() => data?.groups ?? [], [data]);
  const visibleGroups = useMemo(
    () => (expanded ? groups : groups.slice(0, 4)),
    [groups, expanded],
  );
  const hiddenCount = groups.length - visibleGroups.length;
  const hiddenItems = groups
    .slice(visibleGroups.length)
    .reduce((s, g) => s + g.items.length, 0);

  // ── loading ──────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <section className="card p-4 sm:p-5">
        <Header win={win} setWin={changeWindow} isPage={isPage} />
        <div className="flex items-center gap-2 py-8 justify-center text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Working out what&apos;s coming…
        </div>
      </section>
    );
  }

  // ── hard failure ─────────────────────────────────────────────────
  if (failed || !data) {
    return (
      <section className="card p-4 sm:p-5">
        <Header win={win} setWin={changeWindow} isPage={isPage} />
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-slate-900">
            We couldn&apos;t load your forward view
          </p>
          <p className="mt-1 text-sm text-slate-500">
            This is usually temporary. Try again in a moment.
          </p>
          <button
            onClick={reload}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </section>
    );
  }

  const p = data.projection;

  return (
    <section className="card p-4 sm:p-5">
      <Header win={win} setWin={changeWindow} isPage={isPage} />

      {/* ── The three answers, in order ─────────────────────────── */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Answer
          tone="in"
          label="Landing"
          value={`+${fmtGBP0(p.expectedIncoming)}`}
          sub={`over ${win} days`}
        />
        <Answer
          tone="out"
          label="Leaving"
          value={`−${fmtGBP0(p.expectedOutgoing)}`}
          sub={`over ${win} days`}
        />
        <div className="col-span-2 sm:col-span-1">
          {p.balanceAvailable && p.projectedBalance !== null ? (
            <Answer
              tone={p.projectedBalance >= 0 ? 'neutral' : 'out'}
              label="Left after these"
              value={`${p.projectedBalance < 0 ? '−' : ''}${fmtGBP0(p.projectedBalance)}`}
              sub={`from ${fmtGBP0(p.currentBalance ?? 0)} today`}
            />
          ) : (
            <Answer
              tone={p.netMovement >= 0 ? 'in' : 'out'}
              label="Net movement"
              value={`${p.netMovement >= 0 ? '+' : '−'}${fmtGBP0(p.netMovement)}`}
              sub="balance unavailable"
            />
          )}
        </div>
      </div>

      {/* Honest note when we can't project a balance. Never invent one. */}
      {!p.balanceAvailable && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Your bank isn&apos;t sharing an account balance with us, so we can&apos;t
            show what you&apos;ll be left with. The figure above is the net
            movement: what these payments add up to, in or out.
          </span>
        </p>
      )}

      {/* Lowest-point warning — the number that actually matters when
          money lands after it leaves. */}
      {p.balanceAvailable &&
        p.lowestPoint !== null &&
        p.lowestPointDate &&
        p.lowestPoint < 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              On this schedule your balance dips to{' '}
              <strong className="font-semibold">−{fmtGBP0(p.lowestPoint)}</strong> on{' '}
              {longDay(p.lowestPointDate)}, before any money that lands later.
            </span>
          </p>
        )}

      {/* ── Empty states — say what to do, never an empty box ────── */}
      {groups.length === 0 ? (
        <EmptyState reason={data.emptyReason} onRetry={reload} />
      ) : (
        <>
          <ol className="mt-4 space-y-3">
            {visibleGroups.map((g) => (
              <li key={g.date}>
                <div className="flex items-baseline justify-between gap-2 px-0.5">
                  <h4 className="text-[13px] font-semibold text-slate-900">
                    {prettyDay(g.date)}
                  </h4>
                  <div className="text-[11px] tabular-nums text-slate-500">
                    {g.incoming > 0 && (
                      <span className="mr-2 font-medium text-emerald-700">
                        +{fmtGBP(g.incoming)}
                      </span>
                    )}
                    {g.outgoing > 0 && (
                      <span className="font-medium text-rose-700">
                        −{fmtGBP(g.outgoing)}
                      </span>
                    )}
                  </div>
                </div>
                <ul className="mt-1 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {g.items.map((item) => (
                    <ItemRow key={item.id} item={item} onOpen={() => setDetail(item)} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          {hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Show {hiddenItems} more {hiddenItems === 1 ? 'item' : 'items'} across{' '}
              {hiddenCount} more {hiddenCount === 1 ? 'day' : 'days'}
            </button>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includePredicted}
                onChange={(e) => togglePredicted(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Include predicted items
            </label>
            <span className="text-xs text-slate-500">
              {data.totals.confirmedCount} confirmed · {data.totals.predictedCount}{' '}
              predicted
            </span>
          </div>
        </>
      )}

      {!isPage && groups.length > 0 && (
        <Link
          href="/dashboard/money-hub/upcoming"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          Open the full timeline <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {detail && <DetailSheet item={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

// ─── header ────────────────────────────────────────────────────────
function Header({
  win,
  setWin,
  isPage,
}: {
  win: Window;
  setWin: (w: Window) => void;
  isPage: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <CalendarClock className="h-4 w-4 text-emerald-600" />
        {isPage ? 'What happens next' : 'Landing and leaving'}
      </h3>
      <div
        role="group"
        aria-label="Forward window"
        className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5"
      >
        {([7, 14, 30] as Window[]).map((w) => (
          <button
            key={w}
            onClick={() => setWin(w)}
            aria-pressed={win === w}
            className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
              win === w
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {w}d
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── answer card ───────────────────────────────────────────────────
function Answer({
  tone,
  label,
  value,
  sub,
}: {
  tone: 'in' | 'out' | 'neutral';
  label: string;
  value: string;
  sub: string;
}) {
  const toneClasses =
    tone === 'in'
      ? 'text-emerald-700'
      : tone === 'out'
        ? 'text-rose-700'
        : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {tone === 'in' && <ArrowDownLeft className="h-3 w-3" aria-hidden />}
        {tone === 'out' && <ArrowUpRight className="h-3 w-3" aria-hidden />}
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${toneClasses}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

// ─── one upcoming item ─────────────────────────────────────────────
function ItemRow({
  item,
  onOpen,
}: {
  item: UpcomingPaymentRow;
  onOpen: () => void;
}) {
  const incoming = item.direction === 'incoming';
  const cert = CERTAINTY[item.certainty];
  const sign = incoming ? '+' : '−';
  const name = item.counterparty || 'Unknown counterparty';

  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 sm:gap-3 sm:px-4"
        aria-label={`${incoming ? 'Money in' : 'Money out'}: ${sign}${fmtGBP(
          item.amount,
        )} ${incoming ? 'from' : 'to'} ${name} on ${longDay(item.expected_date)}. ${
          cert.label
        }.`}
      >
        <span
          aria-hidden
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            incoming ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {incoming ? (
            <ArrowDownLeft className="h-4 w-4" />
          ) : (
            <ArrowUpRight className="h-4 w-4" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">
            {name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cert.chip}`}
            >
              <span className="sm:hidden">{cert.short}</span>
              <span className="hidden sm:inline">{cert.label}</span>
            </span>
            {item.cadence && (
              <span className="text-[11px] text-slate-500">
                {cadenceWords(item.cadence)}
              </span>
            )}
          </span>
        </span>

        <span
          className={`shrink-0 text-right text-sm font-semibold tabular-nums ${
            incoming ? 'text-emerald-700' : 'text-slate-900'
          }`}
        >
          {item.amount_varies && (
            <span className="mr-0.5 font-normal text-slate-400">≈</span>
          )}
          {sign}
          {fmtGBP(item.amount)}
        </span>
      </button>
    </li>
  );
}

// ─── detail sheet (bottom sheet on mobile, dialog on sm+) ──────────
function DetailSheet({
  item,
  onClose,
}: {
  item: UpcomingPaymentRow;
  onClose: () => void;
}) {
  const incoming = item.direction === 'incoming';
  const cert = CERTAINTY[item.certainty];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-slate-900/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upcoming payment detail"
        className={
          // Mobile: bottom sheet, immune to ancestor overflow clipping.
          'fixed inset-x-0 bottom-0 z-[70] max-h-[80vh] overflow-y-auto overscroll-contain ' +
          'rounded-t-2xl border border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl ' +
          // sm+: centred dialog.
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[26rem] sm:max-w-[calc(100vw-2rem)] ' +
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-5 sm:pb-5'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">
              {item.counterparty || 'Unknown counterparty'}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {longDay(item.expected_date)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`mt-3 rounded-xl px-3 py-3 ${
            incoming ? 'bg-emerald-50' : 'bg-rose-50'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {incoming ? (
              <ArrowDownLeft className="h-3 w-3" aria-hidden />
            ) : (
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            )}
            {incoming ? 'Money landing' : 'Money leaving'}
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${
              incoming ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            {incoming ? '+' : '−'}
            {fmtGBP(item.amount)}
          </div>
          {item.amount_varies && item.amount_low !== null && item.amount_high !== null && (
            <div className="mt-1 text-xs text-slate-600">
              Usually somewhere between {fmtGBP0(item.amount_low)} and{' '}
              {fmtGBP0(item.amount_high)}. This one varies a lot, so the figure
              above is the typical amount, not a promise.
            </div>
          )}
        </div>

        <dl className="mt-3 space-y-2.5 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              How sure are we
            </dt>
            <dd className="mt-1">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cert.chip}`}
              >
                {cert.label}
              </span>
              <p className="mt-1.5 leading-relaxed text-slate-600">{cert.blurb}</p>
              {item.certainty === 'predicted' && item.confidence !== null && (
                <p className="mt-1 text-xs text-slate-500">
                  Pattern confidence {Math.round(item.confidence * 100)}%
                  {item.cadence ? ` · ${cadenceWords(item.cadence)}` : ''}.
                </p>
              )}
            </dd>
          </div>
        </dl>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Done
        </button>
      </div>
    </>
  );
}

// ─── empty states ──────────────────────────────────────────────────
function EmptyState({
  reason,
  onRetry,
}: {
  reason: UpcomingApiResponse['emptyReason'];
  onRetry: () => void;
}) {
  if (reason === 'no_bank') {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
        <Building2 className="mx-auto h-5 w-5 text-slate-400" />
        <p className="mt-2 text-sm font-semibold text-slate-900">
          Connect a bank to see what&apos;s coming
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          We read your scheduled payments, standing orders and direct debits
          straight from your bank, then work out your regular income from your
          transaction history. Read-only, FCA regulated via Yapily, takes about
          two minutes.
        </p>
        <Link
          href="/dashboard/money-hub"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Building2 className="h-3.5 w-3.5" /> Connect your bank
        </Link>
      </div>
    );
  }

  if (reason === 'consent_expired') {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
        <TriangleAlert className="mx-auto h-5 w-5 text-amber-600" />
        <p className="mt-2 text-sm font-semibold text-amber-900">
          Your bank connection needs renewing
        </p>
        <p className="mt-1 text-sm leading-relaxed text-amber-800">
          Open Banking consent expires every 90 days by law, and yours has run
          out. Until you renew it your bank stops sending us scheduled payments,
          so we can&apos;t show you what&apos;s landing or leaving.
        </p>
        <Link
          href="/dashboard/money-hub"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reconnect your bank
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
      <CalendarClock className="mx-auto h-5 w-5 text-slate-400" />
      <p className="mt-2 text-sm font-semibold text-slate-900">
        Nothing scheduled in this window
      </p>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Your bank isn&apos;t reporting any scheduled payments for these dates, and
        we haven&apos;t seen enough history to predict any yet. We need a pattern
        at least three times before we&apos;ll put a number in front of you. Try a
        longer window, or check back after tomorrow&apos;s 06:00 sync.
      </p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Check again
      </button>
    </div>
  );
}

// ─── labels ────────────────────────────────────────────────────────
function cadenceWords(cadence: string): string {
  switch (cadence) {
    case 'weekdaily': return 'Most weekdays';
    case 'weekly': return 'Weekly';
    case 'fortnightly': return 'Fortnightly';
    case 'four_weekly': return 'Every 4 weeks';
    case 'monthly': return 'Monthly';
    case 'quarterly': return 'Quarterly';
    case 'annual': return 'Yearly';
    default: return cadence;
  }
}
