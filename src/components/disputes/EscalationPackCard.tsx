'use client';

/**
 * EscalationPackCard — the in-dispute surface for the Ombudsman
 * escalation pack — £14.99 as a one-off, on every plan including Free.
 * No subscription tier bundles it, so this card never up-sells a plan.
 *
 * Sits under the Dispute Agent banner on the dispute detail page. Drops in
 * without touching the 3,000-line disputes-page monolith, same pattern as
 * DisputeAgentBanner.
 *
 * Three states:
 *   1. No entitlement  → show which ombudsman covers this dispute (that is
 *      free information and it is the reason to buy), plus Buy for £14.99.
 *   2. Entitled, not generated → Generate the pack.
 *   3. Generated → the referral letter, the numbered evidence bundle and
 *      the deadlines, with a print action.
 *
 * The routing block is deliberately shown in ALL states. Withholding "your
 * dispute goes to the Energy Ombudsman" behind a paywall would be mean and
 * would also stop the user understanding what they are buying.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Lock, Scale, ExternalLink, Printer } from 'lucide-react';

interface Routing {
  sector_key: string | null;
  sector_label: string | null;
  has_ombudsman: boolean;
  body_name: string;
  body_url: string;
  eligibility: string;
  time_limit: string;
  cost: string;
  binding: string;
  sector_deadlines: { title: string; body: string }[];
}

interface EvidenceItem {
  seq: number;
  label: string;
  title: string | null;
  dated: string | null;
  summary: string | null;
  attachment_count: number;
}

interface Pack {
  id: string;
  escalation_letter: string | null;
  legal_references: string[];
  next_steps: string[];
  evidence_pack: EvidenceItem[];
  evidence_item_count: number;
  eligible_from: string | null;
  referral_deadline: string | null;
  ombudsman_name: string | null;
  ombudsman_url: string | null;
}

interface State {
  entitlement: { allowed: boolean; via: 'tier' | 'entitlement' | null; reason: string; price_gbp: number };
  routing: Routing;
  pack: Pack | null;
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

export default function EscalationPackCard({ disputeId }: { disputeId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/disputes/${disputeId}/escalation-pack`, { cache: 'no-store' });
      if (!res.ok) return;
      setState(await res.json());
    } catch {
      /* best-effort — the card simply does not render */
    }
  }, [disputeId]);

  useEffect(() => { void load(); }, [load]);

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/escalation-pack/checkout`, { method: 'POST' });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      throw new Error(data.error || 'Could not start checkout.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/escalation-pack`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate the pack.');
      setState((s) => (s ? { ...s, pack: data.pack } : s));
      setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the pack.');
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    const pack = state?.pack;
    if (!pack) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const exhibits = (pack.evidence_pack ?? [])
      .map((e) => `<h3>Exhibit ${e.seq}: ${e.label}${e.dated ? `, ${fmtDate(e.dated)}` : ''}</h3><p>${(e.summary ?? e.title ?? '').replace(/</g, '&lt;')}</p>`)
      .join('');
    w.document.write(
      `<html><head><title>Ombudsman escalation pack</title>`
      + `<style>body{font-family:Georgia,serif;max-width:44em;margin:3em auto;line-height:1.6;color:#111}`
      + `pre{white-space:pre-wrap;font-family:Georgia,serif}h2{margin-top:2em}</style></head><body>`
      + `<h1>Referral to ${pack.ombudsman_name ?? 'the ombudsman'}</h1>`
      + `<pre>${(pack.escalation_letter ?? '').replace(/</g, '&lt;')}</pre>`
      + `<h2>Evidence bundle</h2>${exhibits}</body></html>`,
    );
    w.document.close();
    w.print();
  };

  if (!state) return null;

  const { routing, entitlement, pack } = state;
  const eligibleFrom = fmtDate(pack?.eligible_from);
  const eligibleNow = pack?.eligible_from ? new Date(pack.eligible_from) <= new Date() : null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-3">
        <Scale className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">
            {routing.has_ombudsman ? 'Escalate to the ombudsman' : 'Next step beyond the company'}
          </h3>

          {/* Routing — shown regardless of entitlement. */}
          <p className="mt-1 text-sm text-slate-700">
            {routing.has_ombudsman
              ? <>This dispute is covered by <strong>{routing.body_name}</strong>.</>
              : <>No ombudsman covers this sector. The route is <strong>{routing.body_name}</strong>.</>}
            {' '}
            <a href={routing.body_url} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-0.5 text-amber-800 underline underline-offset-2">
              Details <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">{routing.eligibility}</p>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            <strong>Time limit:</strong> {routing.time_limit}
          </p>

          {eligibleFrom && (
            <p className="mt-2 text-xs font-medium text-slate-800">
              {eligibleNow
                ? `The eight-week period passed on ${eligibleFrom}, so you can refer this now.`
                : `You can refer this from ${eligibleFrom}, once the eight-week period is up.`}
            </p>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ---- Actions ---- */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pack ? (
              <>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {expanded ? 'Hide pack' : 'Open escalation pack'}
                </button>
                <button
                  onClick={print}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" /> Print or save as PDF
                </button>
              </>
            ) : entitlement.allowed ? (
              <button
                onClick={generate}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {busy ? 'Building your pack…' : 'Generate escalation pack'}
              </button>
            ) : (
              <>
                <button
                  onClick={buy}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                  {busy ? 'Opening checkout…' : `Get the escalation pack for £${entitlement.price_gbp.toFixed(2)}`}
                </button>
                <span className="text-xs text-slate-500">
                  One payment, no subscription. Same price on every plan.
                </span>
              </>
            )}
            {entitlement.via === 'tier' && (
              <span className="text-xs text-emerald-700">Included with your plan</span>
            )}
          </div>

          {!pack && !entitlement.allowed && (
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              One payment, for this dispute. You get the referral letter drafted for{' '}
              {routing.body_name}, your correspondence bundled as numbered exhibits, and the
              deadlines tracked. No subscription needed.
            </p>
          )}

          {/* ---- Generated pack ---- */}
          {pack && expanded && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Referral letter</p>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-800">
                  {pack.escalation_letter}
                </pre>
              </div>

              {pack.legal_references?.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Law cited</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                    {pack.legal_references.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Evidence bundle ({pack.evidence_item_count} {pack.evidence_item_count === 1 ? 'exhibit' : 'exhibits'})
                </p>
                {pack.evidence_pack?.length ? (
                  <ol className="space-y-1 text-xs text-slate-700">
                    {pack.evidence_pack.map((e) => (
                      <li key={e.seq} className="rounded border border-slate-200 bg-white px-2 py-1.5">
                        <span className="font-semibold">Exhibit {e.seq}</span>: {e.label}
                        {e.dated ? `, ${fmtDate(e.dated)}` : ''}
                        {e.title ? ` (${e.title})` : ''}
                        {e.attachment_count > 0 && (
                          <span className="ml-1 text-slate-500">
                            · {e.attachment_count} attachment{e.attachment_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-slate-500">
                    No correspondence recorded on this dispute yet. Add the letters and replies
                    from the timeline below and they will be bundled here.
                  </p>
                )}
              </div>

              {pack.next_steps?.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">What to do next</p>
                  <ol className="list-decimal space-y-0.5 pl-5 text-xs text-slate-700">
                    {pack.next_steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              )}

              <p className="text-xs text-slate-500 leading-relaxed">
                We draft and bundle. You file the referral yourself on{' '}
                <a href={routing.body_url} target="_blank" rel="noopener noreferrer"
                   className="underline underline-offset-2">the scheme&rsquo;s own site</a>,
                because ombudsman bodies do not accept submissions from third parties. Check the
                time limit above before you file.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
