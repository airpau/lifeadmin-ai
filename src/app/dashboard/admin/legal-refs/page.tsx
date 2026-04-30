'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Shield, CheckCircle, AlertTriangle, Clock, RefreshCw, ExternalLink,
  Loader2, ChevronLeft, ArrowLeft, Search, Filter,
} from 'lucide-react';
import Link from 'next/link';
import { AutoAppliedPanel } from './AutoAppliedPanel';
import PendingCorrectionsSection from './PendingCorrectionsSection';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

interface LegalRef {
  id: string;
  category: string;
  subcategory: string | null;
  law_name: string;
  section: string | null;
  summary: string;
  source_url: string;
  source_type: string;
  strength: string;
  escalation_body: string | null;
  verification_status: string;
  last_verified: string | null;
  last_changed: string | null;
  verification_notes: string | null;
  verified_url: string | null;
  auto_corrected?: boolean | null;
  created_at: string;
}

const PERPLEXITY_COST_PER_ROW_GBP = 0.005 * 0.79; // sonar-pro flat rate × USD→GBP

function relativeTime(d: string | null): string {
  if (!d) return 'Never';
  const then = new Date(d).getTime();
  const diff = Date.now() - then;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

// NOTE: the canonical "needs review" predicate is `needsReview` defined below
// (PR #373). The Review queue uses `needsReview` directly so the stats counter
// and the queue list always agree — previously a separate `isReviewable`
// predicate excluded `url_dead` rows, which caused the stats panel to say
// "28 need review" while the queue rendered empty (and therefore no per-row
// "Verify with AI" buttons). See fix(admin) on legal-refs page.

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  current: { label: 'Current', icon: CheckCircle, className: 'text-green-400 bg-green-500/10' },
  verified: { label: 'Verified', icon: CheckCircle, className: 'text-green-500 bg-green-500/10' },
  updated: { label: 'Auto-updated', icon: RefreshCw, className: 'text-emerald-600 bg-emerald-500/10' },
  needs_review: { label: 'Needs review', icon: AlertTriangle, className: 'text-amber-600 bg-amber-100' },
  outdated: { label: 'Outdated', icon: AlertTriangle, className: 'text-red-400 bg-red-500/10' },
  broken: { label: 'Broken', icon: AlertTriangle, className: 'text-red-500 bg-red-500/10' },
  stale: { label: 'Stale', icon: Clock, className: 'text-amber-500 bg-amber-500/10' },
  error: { label: 'Error', icon: AlertTriangle, className: 'text-red-400 bg-red-500/10' },
  superseded: { label: 'Superseded', icon: RefreshCw, className: 'text-slate-500 bg-slate-100' },
  url_dead: { label: 'URL dead', icon: AlertTriangle, className: 'text-red-500 bg-red-500/10' },
};

// A row "needs review" if its verification_status is in this set OR last_verified
// is null OR older than 60 days. Mirrors PR #373's review-list predicate so the
// summary stats and the list view always agree.
const NEEDS_REVIEW_STATUSES = new Set(['needs_review', 'broken', 'stale', 'error', 'outdated', 'url_dead']);
const STALE_AFTER_DAYS = 60;
function needsReview(ref: LegalRef): boolean {
  if (NEEDS_REVIEW_STATUSES.has(ref.verification_status)) return true;
  if (!ref.last_verified) return true;
  const ageMs = Date.now() - new Date(ref.last_verified).getTime();
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

const STRENGTH_CONFIG: Record<string, string> = {
  strong: 'text-green-400',
  moderate: 'text-amber-600',
  weak: 'text-red-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  energy: 'Energy',
  broadband: 'Broadband / Mobile',
  travel: 'Travel',
  parking: 'Parking',
  debt: 'Debt',
  finance: 'Finance',
  hmrc: 'HMRC',
  council_tax: 'Council Tax',
  dvla: 'DVLA',
  nhs: 'NHS',
};

function formatDate(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Candidate {
  id: string;
  title: string;
  source_url: string | null;
  source_type: string | null;
  summary: string | null;
  category: string | null;
  jurisdiction: string | null;
  confidence: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'duplicate';
  discovered_at: string;
  notes: string | null;
}

export default function LegalRefsAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [refs, setRefs] = useState<LegalRef[]>([]);
  const [dbTotal, setDbTotal] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pendingCandCount, setPendingCandCount] = useState(0);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [aiVerifyingIds, setAiVerifyingIds] = useState<Set<string>>(new Set());
  const [aiResults, setAiResults] = useState<Record<string, { status: string; notes: string; ok: boolean }>>({});
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [reviewPage, setReviewPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [verifyAllRunning, setVerifyAllRunning] = useState(false);
  const [verifyAllResult, setVerifyAllResult] = useState<string | null>(null);
  const [blockEffect, setBlockEffect] = useState<Record<string, { b2c: number; b2b: number; total: number }>>({});
  const REVIEW_PAGE_SIZE = 50;
  const supabase = createClient();

  // Compliance-ops toolbar state — wired in feat/compliance-ops-from-dashboard
  // so the founder can run every compliance op from this page (no terminal
  // scripts, no hand-curl). Each op shares the same modal pattern: confirm
  // cost (or zero-cost note), POST, show toast, refresh.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [opModal, setOpModal] = useState<null | {
    op:
      | 'compliance-sync'
      | 'recover-url-dead'
      | 'authority-audit'
      | 'discover'
      | 'enrich'
      | 'auto-apply-sweep'
      | 'verify-all-baseline';
    title: string;
    body: string;
    action: () => Promise<void>;
  }>(null);
  const [opRunning, setOpRunning] = useState<string | null>(null);
  const [opToast, setOpToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!opToast) return;
    const t = setTimeout(() => setOpToast(null), 8000);
    return () => clearTimeout(t);
  }, [opToast]);

  const urlDeadCount = refs.filter((r) => r.verification_status === 'url_dead').length;

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);
      await Promise.all([fetchRefs(), fetchCandidates()]);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRefs = async () => {
    // Page rows in batches of 1000 — PostgREST default range cap is 1000 and
    // the founder reported the count widget showed 78 / 112. We need every
    // row regardless of status to surface the true table size.
    const PAGE = 1000;
    const all: LegalRef[] = [];
    let from = 0;
    // Best-effort exact count — separate head:true query so we can compare
    // .length vs server count and detect range truncation.
    const { count } = await supabase
      .from('legal_references')
      .select('*', { count: 'exact', head: true });
    setDbTotal(typeof count === 'number' ? count : null);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('legal_references')
        .select('*')
        .order('category')
        .order('law_name')
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as LegalRef[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setRefs(all);
    // PR γ — fetch block-effect counts (how many letters / disputes cite each ref).
    try {
      const ids = all.map((r: any) => r.id).filter(Boolean);
      if (ids.length > 0) {
        const res = await fetch(`/api/admin/legal-refs/audit?block_effect=${ids.join(',')}`, { credentials: 'include' });
        if (res.ok) {
          const j = await res.json();
          if (j?.counts) setBlockEffect(j.counts);
        }
      }
    } catch {}
    setLoading(false);
  };

  const fetchCandidates = async () => {
    const { data: pendingData } = await supabase
      .from('legal_ref_candidates')
      .select('*')
      .eq('status', 'pending')
      .order('discovered_at', { ascending: false })
      .limit(200);
    const list = (pendingData as Candidate[] | null) ?? [];
    setCandidates(list);
    setPendingCandCount(list.length);
  };

  const decideCandidate = async (
    id: string,
    action: 'approve' | 'reject' | 'duplicate',
    notes?: string,
    duplicate_of?: string,
  ) => {
    const res = await fetch(`/api/admin/legal-ref-candidates/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action, notes, duplicate_of }),
    });
    if (res.ok) {
      await Promise.all([fetchRefs(), fetchCandidates()]);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Decision failed: ${err.error ?? res.status}`);
    }
  };

  const triggerDiscovery = async (leg: 'recent' | 'category') => {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await fetch(`/api/cron/discover-legal-refs?leg=${leg}`, { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setDiscoverResult(
          `Done. ${data.candidates_found ?? 0} found, ${data.candidates_added ?? 0} new, ${data.candidates_skipped_duplicate ?? 0} duplicates.${data.notes ? ' ' + data.notes : ''}`,
        );
        await fetchCandidates();
      } else {
        setDiscoverResult(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setDiscoverResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDiscovering(false);
    }
  };

  const runVerification = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/cron/verify-legal-refs', { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setVerifyResult(
          `Done. ${data.current} current, ${data.updated} auto-updated, ${data.needs_review} need review, ${data.errors} errors out of ${data.total} references.`
        );
        await fetchRefs();
      } else {
        setVerifyResult(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setVerifyResult(`Failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const verifyWithAi = async (ids: string[]) => {
    if (ids.length === 0) return;
    const single = ids.length === 1;
    setAiVerifyingIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
    try {
      if (single) {
        const res = await fetch('/api/admin/legal-refs/verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ids[0] }),
        });
        const data = await res.json();
        const u = data?.updated;
        if (u) {
          // The verify route is now propose-only. Possible statuses:
          //   - 'no_change'    — observational fields touched only
          //   - 'queued'       — correction inserted into legal_ref_corrections
          //   - 'auto_applied' — rare; correction passed all auto-apply gates
          //   - 'error'        — surface the error, don't mutate row state
          setAiResults(prev => ({
            ...prev,
            [u.id]: {
              status: u.status,
              notes: u.error || u.notes || '',
              ok: u.status !== 'error',
            },
          }));
          setRefs(prev => prev.map(r => {
            if (r.id !== u.id) return r;
            if (u.status === 'error') return r;
            // Only refresh observational fields. Canonical verification_status
            // is mutated only by the auto-apply sweep or a founder approval click.
            return {
              ...r,
              verification_notes: u.notes ?? r.verification_notes,
              last_verified: new Date().toISOString(),
            };
          }));
        }
      } else {
        // Batch in chunks of 25.
        setBatchProgress({ done: 0, total: ids.length });
        let done = 0;
        for (let i = 0; i < ids.length; i += 25) {
          const chunk = ids.slice(i, i + 25);
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch('/api/admin/legal-refs/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: chunk }),
          });
          // eslint-disable-next-line no-await-in-loop
          const data = await res.json();
          const results: Array<{ id: string; status: string; current_url: string | null; notes: string; error?: string }> = data?.results || [];
          setAiResults(prev => {
            const next = { ...prev };
            results.forEach(r => {
              next[r.id] = { status: r.status, notes: r.error || r.notes || '', ok: r.status !== 'error' };
            });
            return next;
          });
          setRefs(prev => prev.map(r => {
            const u = results.find(x => x.id === r.id);
            if (!u || u.status === 'error') return r;
            // Propose-only: only refresh observational fields client-side.
            // Canonical verification_status is mutated by the auto-apply
            // sweep or a founder approval click, not this route.
            return {
              ...r,
              verification_notes: u.notes ?? r.verification_notes,
              last_verified: new Date().toISOString(),
            };
          }));
          done += chunk.length;
          setBatchProgress({ done, total: ids.length });
        }
      }
    } catch (err: any) {
      console.error('verifyWithAi failed', err);
      ids.forEach(id => {
        setAiResults(prev => ({ ...prev, [id]: { status: 'error', notes: err?.message || 'Request failed', ok: false } }));
      });
    } finally {
      setAiVerifyingIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      setTimeout(() => setBatchProgress(null), 2000);
    }
  };

  // ---------- Compliance ops handlers ----------
  // All ops post to founder-gated endpoints, surface a toast on completion,
  // and refresh the page state so any new pending corrections become
  // visible in the existing review queue.

  const runOp = async (
    op: NonNullable<typeof opModal>['op'],
    fn: () => Promise<{ ok: boolean; text: string }>,
  ) => {
    setOpRunning(op);
    try {
      const result = await fn();
      setOpToast({ kind: result.ok ? 'ok' : 'err', text: result.text });
      await Promise.all([fetchRefs(), fetchCandidates()]);
    } catch (err) {
      setOpToast({
        kind: 'err',
        text: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setOpRunning(null);
    }
  };

  const opComplianceSync = () => {
    setOpModal({
      op: 'compliance-sync',
      title: 'Run end-to-end compliance sync',
      body:
        'Run the full daily pipeline now: probe url_dead refs → authority audit → Perplexity discovery → enrich → auto-reject non-authority → auto-apply low-risk → email summary.\n\n' +
        'Estimated cost ≈ £0.30–£0.50 depending on backlog size.\n\n' +
        'You will receive a punch-list email with what auto-applied vs. what needs your eye.',
      action: async () => {
        await runOp('compliance-sync', async () => {
          const res = await fetch('/api/cron/compliance-sync', {
            method: 'POST',
            credentials: 'include',
          });
          const data = await res.json();
          if (!data.ok) {
            const failed = (data.phases || [])
              .filter((p: { status: string }) => p.status === 'error')
              .map((p: { name: string }) => p.name)
              .join(', ');
            return {
              ok: false,
              text: `Sync failed${failed ? ` in: ${failed}` : ''}. See network tab for details.`,
            };
          }
          const t = data.totals;
          return {
            ok: true,
            text:
              `Sync done in ${(data.total_ms / 1000).toFixed(1)}s · ` +
              `${t.auto_applied} auto-applied · ${t.auto_rejected} auto-rejected · ` +
              `${t.needs_review} need review · ${t.new_candidates} new candidates · ` +
              `${t.url_dead_unrecoverable} url_dead unrecoverable.` +
              (data.email_sent ? ' Email sent.' : ''),
          };
        });
      },
    });
  };

  const opRecoverUrlDead = () => {
    setOpModal({
      op: 'recover-url-dead',
      title: 'Recover url_dead refs',
      body: `Probe ${urlDeadCount} url_dead ref${urlDeadCount === 1 ? '' : 's'} (no API cost — server-side HTTP probes, ~30–60s for typical batches). Recoverable URLs will be queued as pending corrections for your approval.`,
      action: async () => {
        await runOp('recover-url-dead', async () => {
          const res = await fetch('/api/admin/legal-refs/recover-url-dead', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queue: true }),
          });
          const data = await res.json();
          if (!data.ok) return { ok: false, text: `Error: ${data.error || 'Unknown'}` };
          return {
            ok: true,
            text:
              `Probed ${data.probed} · still dead ${data.still_dead} · now resolves ${data.now_resolves} · ` +
              `redirected to authority ${data.redirected_to_authority} · queued ${data.queued} pending correction${data.queued === 1 ? '' : 's'}.`,
          };
        });
      },
    });
  };

  const opAuthorityAudit = () => {
    setOpModal({
      op: 'authority-audit',
      title: 'Run authority audit',
      body: `Audit ${counts.dbTotal} ref source URLs against the UK legal authority allowlist. No API cost — local check. Refs flagged as rejected/unrecognised will be queued as pending corrections.`,
      action: async () => {
        await runOp('authority-audit', async () => {
          const res = await fetch('/api/admin/legal-refs/audit-authority', {
            method: 'POST',
            credentials: 'include',
          });
          const data = await res.json();
          if (!data.ok) return { ok: false, text: `Error: ${data.error || 'Unknown'}` };
          const c = data.counts;
          return {
            ok: true,
            text: `Audit done. Authority ${c.authority} · secondary ${c.secondary} · rejected ${c.rejected} · unrecognised ${c.unrecognised}. Inserted ${data.inserted} pending corrections (skipped ${data.skipped_existing} already-queued).`,
          };
        });
      },
    });
  };

  const opDiscover = () => {
    setOpModal({
      op: 'discover',
      title: 'Discover new refs (Perplexity)',
      body: 'Run Perplexity discovery for recent UK consumer-law updates. Estimated cost ~£0.05–£0.30 depending on candidates found. New candidates appear in the discovery queue for founder approval.',
      action: async () => {
        await runOp('discover', async () => {
          const res = await fetch('/api/cron/discover-legal-refs?leg=recent', {
            method: 'POST',
            credentials: 'include',
          });
          const data = await res.json();
          if (!data.ok) return { ok: false, text: `Error: ${data.error || 'Unknown'}` };
          return {
            ok: true,
            text: `Discovery done. ${data.candidates_found ?? 0} found · ${data.candidates_added ?? 0} new · ${data.candidates_skipped_duplicate ?? 0} duplicates.`,
          };
        });
      },
    });
  };

  const opEnrich = () => {
    setOpModal({
      op: 'enrich',
      title: 'Enrich pending review queue',
      body: 'Run enrichment on pending corrections + candidates (adds risk_score + URL diff so the auto-apply sweep can act on low-risk rows). Estimated cost ~£0.01–£0.05 per run.',
      action: async () => {
        await runOp('enrich', async () => {
          const res = await fetch('/api/cron/enrich-compliance-pending', {
            method: 'POST',
            credentials: 'include',
          });
          const data = await res.json();
          if (!data.ok) return { ok: false, text: `Error: ${data.error || 'Unknown'}` };
          return {
            ok: true,
            text: `Enrichment done. Corrections ${data.processed_corrections} · candidates ${data.processed_candidates} · low ${data.risk_low} · medium ${data.risk_medium} · high ${data.risk_high} · errors ${data.errors}.`,
          };
        });
      },
    });
  };

  const opAutoApplySweep = () => {
    setOpModal({
      op: 'auto-apply-sweep',
      title: 'Run auto-apply sweep',
      body: 'Evaluate pending corrections through the three auto-apply gates (risk=low, source-text corroboration, no semantic change) and auto-apply LOW-risk rows. Hard cap 50 per run. No API cost — local evaluation.',
      action: async () => {
        await runOp('auto-apply-sweep', async () => {
          const res = await fetch('/api/cron/legal-refs-auto-apply-sweep', {
            method: 'POST',
            credentials: 'include',
          });
          const data = await res.json();
          if (data.skipped_table_missing) {
            return { ok: false, text: 'Skipped: legal_ref_corrections table not available.' };
          }
          return {
            ok: true,
            text: `Sweep done. Processed ${data.processed} · auto-applied ${data.auto_applied} · still pending ${data.still_pending} · failures ${data.failures}.`,
          };
        });
      },
    });
  };

  const opVerifyAllBaseline = () => {
    setOpModal({
      op: 'verify-all-baseline',
      title: 'Re-verify ALL refs (Perplexity baseline)',
      body: `Re-verify all ${refs.length} refs via Perplexity to establish a clean compliance baseline. Estimated cost ~£${(refs.length * PERPLEXITY_COST_PER_ROW_GBP).toFixed(2)}. Corrections route through the pending review queue.`,
      action: async () => {
        await runOp('verify-all-baseline', async () => {
          const res = await fetch('/api/admin/legal-refs/verify-all', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          if (!data.ok || !data.counts) return { ok: false, text: `Error: ${data.error || 'Unknown'}` };
          const c = data.counts;
          return {
            ok: true,
            text: `Baseline done. ${c.verified} verified · ${c.updated} auto-updated · ${c.superseded} superseded · ${c.needs_review} needs review · ${c.broken} broken · ${c.error} errors.`,
          };
        });
      },
    });
  };

  const filtered = refs.filter(r => {
    if (filterStatus === 'needs_review_any') {
      if (!needsReview(r)) return false;
    } else if (filterStatus !== 'all' && r.verification_status !== filterStatus) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.law_name.toLowerCase().includes(q) ||
        (r.section || '').toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const categories = [...new Set(refs.map(r => r.category))].sort();
  // Stats now share the same predicate as the review list (PR #373) so the
  // "Needs review" count equals the rows the founder actually sees.
  const reviewList = refs.filter(needsReview);
  const staleAfter = Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const counts = {
    total: refs.length,
    dbTotal: dbTotal ?? refs.length,
    current: refs.filter(r => r.verification_status === 'current' || r.verification_status === 'verified').length,
    updated: refs.filter(r => r.verification_status === 'updated').length,
    needs_review: reviewList.length,
    stale: refs.filter(r => r.last_verified && new Date(r.last_verified).getTime() < staleAfter).length,
    outdated: refs.filter(r => r.verification_status === 'outdated' || r.verification_status === 'broken' || r.verification_status === 'url_dead').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600">Admin access only.</p>
        </div>
      </div>
    );
  }

  const opButtons: Array<{
    key: NonNullable<typeof opModal>['op'];
    label: string;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
    variant: 'primary' | 'secondary' | 'amber';
  }> = [
    {
      key: 'discover',
      label: 'Discover new refs',
      tooltip: 'Perplexity scans for recent UK consumer-law updates. Cost ~£0.05–£0.30.',
      onClick: opDiscover,
      variant: 'primary',
    },
    {
      key: 'verify-all-baseline',
      label: 'Re-verify ALL (baseline)',
      tooltip: `Perplexity re-verifies all ${refs.length} refs. Cost ~£${(refs.length * PERPLEXITY_COST_PER_ROW_GBP).toFixed(2)}.`,
      onClick: opVerifyAllBaseline,
      variant: 'amber',
    },
    {
      key: 'authority-audit',
      label: 'Authority audit',
      tooltip: 'Audit source URLs against the UK legal authority allowlist. No API cost.',
      onClick: opAuthorityAudit,
      variant: 'secondary',
    },
    {
      key: 'recover-url-dead',
      label: `Recover url_dead (${urlDeadCount})`,
      tooltip: 'Probe url_dead refs with a real-browser UA. No API cost — server-side HTTP probes.',
      onClick: opRecoverUrlDead,
      disabled: urlDeadCount === 0,
      variant: 'secondary',
    },
    {
      key: 'enrich',
      label: 'Enrich pending queue',
      tooltip: 'Add risk_score + URL diff to pending rows so auto-apply can act. Cost ~£0.01–£0.05.',
      onClick: opEnrich,
      variant: 'secondary',
    },
    {
      key: 'auto-apply-sweep',
      label: 'Run auto-apply sweep',
      tooltip: 'Auto-apply LOW-risk corrections that pass all 3 gates. No API cost.',
      onClick: opAutoApplySweep,
      variant: 'secondary',
    },
  ];

  const opVariantClass = (v: 'primary' | 'secondary' | 'amber') =>
    v === 'primary'
      ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-900 border-emerald-500'
      : v === 'amber'
        ? 'bg-amber-500 hover:bg-amber-600 text-slate-900 border-amber-500'
        : 'bg-white hover:border-emerald-500 text-slate-900 border-slate-200';

  return (
    <div className="max-w-7xl">
      {/* Compliance ops toast */}
      {opToast && (
        <div
          className={`fixed top-4 right-4 z-[60] max-w-md px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
            opToast.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{opToast.text}</span>
            <button
              onClick={() => setOpToast(null)}
              className="text-xs text-slate-500 hover:text-slate-900"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Compliance ops cost-confirmation modal */}
      {opModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => setOpModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 mb-2">{opModal.title}</h3>
            <p className="text-sm text-slate-600 mb-5 whitespace-pre-line">{opModal.body}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpModal(null)}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = opModal.action;
                  setOpModal(null);
                  void action();
                }}
                className="px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-lg"
              >
                Confirm &amp; run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3 font-[family-name:var(--font-heading)]">
              <Shield className="h-9 w-9 text-emerald-600" />
              Legal References
            </h1>
            <p className="text-slate-600">
              {counts.dbTotal} references across {categories.length} categories
              {counts.dbTotal !== counts.total && (
                <span className="text-amber-600"> · {counts.total} loaded</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={runVerification}
              disabled={verifying}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm"
              title="Run the cron-based verification pass (legislation.gov.uk staleness + regulator rule diff)"
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {verifying ? 'Verifying...' : 'Run Verification'}
            </button>
          </div>
        </div>
      </div>

      {/* Single end-to-end compliance pipeline button. The chained
          /api/cron/compliance-sync runs the same phases as the nightly
          cron: recover url_dead → authority audit → discover → enrich →
          auto-reject non-authority → auto-apply low-risk → email summary.
          This is the founder's daily-driver — the older granular ops are
          escape hatches and live below in the "Advanced ops" disclosure. */}
      <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-900">Compliance pipeline</p>
            <p className="text-xs text-slate-600 max-w-xl">
              One button runs the full chain: probe url_dead refs, authority audit, Perplexity discovery,
              enrichment, auto-reject non-authority, auto-apply low-risk, and email a punch-list summary.
              The same chain runs nightly at 03:00 UTC.
            </p>
          </div>
          <button
            onClick={opComplianceSync}
            disabled={opRunning !== null}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-all text-sm shrink-0"
          >
            {opRunning === 'compliance-sync' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {opRunning === 'compliance-sync' ? 'Running sync…' : 'Run sync now'}
          </button>
        </div>

        <button
          onClick={() => setAdvancedOpen((s) => !s)}
          className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
        >
          {advancedOpen ? '▾' : '▸'} Advanced ops (escape hatches)
        </button>
        {advancedOpen && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-2">
              Run individual phases manually. Use the single-button pipeline above for normal operation.
            </p>
            <div className="flex flex-wrap gap-2">
              {opButtons.map((b) => (
                <button
                  key={b.key}
                  onClick={b.onClick}
                  disabled={!!b.disabled || opRunning !== null}
                  title={b.tooltip}
                  className={`flex items-center gap-2 border disabled:opacity-50 font-semibold px-3.5 py-2 rounded-lg transition-all text-xs ${opVariantClass(b.variant)}`}
                >
                  {opRunning === b.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PR γ — compliance debt alert. Refs cited in the last (audit
          window) that are currently stale. The block-effect counts come
          from legal_ref_usages so this surfaces refs that high-traffic
          flows depend on. */}
      {(() => {
        const usedRefs = refs.filter((r) => (blockEffect[r.id]?.total ?? 0) > 0);
        const staleUsed = usedRefs.filter((r) => !['current', 'updated', 'verified'].includes(r.verification_status));
        if (usedRefs.length === 0) return null;
        return (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${
            staleUsed.length > 0 ? 'bg-red-500/10 border-red-500/20 text-red-700' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'
          }`}>
            Refs used in the audit window: {usedRefs.length} / {staleUsed.length} stale{staleUsed.length > 0 ? ' — compliance debt' : ''}.
          </div>
        );
      })()}

      {/* Verify result banner */}
      {verifyResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${
          verifyResult.startsWith('Done') ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {verifyResult}
        </div>
      )}
      {discoverResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${
          discoverResult.startsWith('Done') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {discoverResult}
        </div>
      )}

      {/* Discovery candidates queue */}
      {pendingCandCount > 0 && (
        <div className="mb-6 bg-white border border-emerald-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
            <p className="font-semibold text-emerald-800 text-sm">
              Discovery candidates ({pendingCandCount} pending)
            </p>
            <p className="text-xs text-emerald-700">Founder review only — never auto-approved.</p>
          </div>
          <div className="divide-y divide-slate-200">
            {candidates.map(c => (
              <div key={c.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm">{c.title}</p>
                    {c.category && (
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                        {CATEGORY_LABELS[c.category] || c.category}
                      </span>
                    )}
                    {c.source_type && (
                      <span className="text-xs text-slate-500">{c.source_type}</span>
                    )}
                  </div>
                  {c.summary && <p className="text-xs text-slate-600 mt-1 line-clamp-2">{c.summary}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    {c.source_url && (
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> source
                      </a>
                    )}
                    <span className="text-[11px] text-slate-500">{formatDate(c.discovered_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => decideCandidate(c.id, 'approve')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      const notes = window.prompt('Notes (optional)') ?? undefined;
                      void decideCandidate(c.id, 'reject', notes);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-red-400 text-slate-700"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      const dup = window.prompt('Existing legal_references.id (UUID) this duplicates') ?? undefined;
                      void decideCandidate(c.id, 'duplicate', undefined, dup);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-amber-400 text-slate-700"
                  >
                    Duplicate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* η — Auto-applied (last 7 days) panel */}
      <AutoAppliedPanel />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total in DB', count: counts.dbTotal, className: 'border-slate-200 bg-slate-50', textClass: 'text-slate-900' },
          { label: 'Current', count: counts.current, className: 'border-green-500/20 bg-green-500/5', textClass: 'text-green-400' },
          { label: 'Auto-updated', count: counts.updated, className: 'border-emerald-500/20 bg-emerald-500/5', textClass: 'text-emerald-600' },
          { label: 'Needs review', count: counts.needs_review, className: 'border-amber-200 bg-amber-50', textClass: 'text-amber-600' },
          { label: 'Stale (>60d)', count: counts.stale, className: 'border-amber-300 bg-amber-50/50', textClass: 'text-amber-700' },
        ].map(card => (
          <button
            key={card.label}
            onClick={() => {
              const target = card.label === 'Needs review'
                ? 'needs_review_any'
                : card.label === 'Total in DB' || card.label === 'Stale (>60d)'
                  ? 'all'
                  : card.label.toLowerCase().replace(' ', '_').replace('auto-updated', 'updated');
              setFilterStatus(filterStatus === target ? 'all' : target);
            }}
            className={`border rounded-2xl p-5 text-left transition-all hover:opacity-80 ${card.className}`}
          >
            <p className={`text-3xl font-bold ${card.textClass}`}>{card.count}</p>
            <p className="text-slate-600 text-sm mt-1">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Pending corrections (PR ε — human-in-loop gate) */}
      <PendingCorrectionsSection />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-700" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search references..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All statuses</option>
          <option value="needs_review_any">Needs review (any)</option>
          <option value="current">Current</option>
          <option value="updated">Auto-updated</option>
          <option value="needs_review">Needs review</option>
          <option value="outdated">Outdated</option>
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
          ))}
        </select>
        {(search || filterStatus !== 'all' || filterCategory !== 'all') && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('all'); setFilterCategory('all'); }}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 text-sm transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-slate-700 text-sm mb-4">Showing {filtered.length} of {refs.length} references</p>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Law / Section</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Category</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden lg:table-cell">Last verified</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden xl:table-cell">Strength</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden xl:table-cell" title="How many B2C letters / B2B disputes are currently citing this ref. Wired in PR γ.">Block effect</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ref, i) => {
                const status = STATUS_CONFIG[ref.verification_status] || STATUS_CONFIG.needs_review;
                const StatusIcon = status.icon;
                return (
                  <tr
                    key={ref.id}
                    id={`ref-${ref.id}`}
                    className={`border-b border-slate-200 hover:bg-slate-100/50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-100/30'}`}
                  >
                    <td className="px-5 py-4">
                      <p className="text-slate-900 text-sm font-medium">{ref.law_name}</p>
                      {ref.section && (
                        <p className="text-slate-700 text-xs mt-0.5">{ref.section}</p>
                      )}
                      <p className="text-slate-600 text-xs mt-1 line-clamp-2 max-w-sm">{ref.summary}</p>
                      {ref.verification_notes && (
                        <p className="text-amber-600/70 text-[11px] mt-1 line-clamp-1">{ref.verification_notes}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
                        {CATEGORY_LABELS[ref.category] || ref.category}
                      </span>
                      {ref.subcategory && (
                        <p className="text-slate-600 text-[11px] mt-1">{ref.subcategory.replace('_', ' ')}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                      {ref.auto_corrected && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200" title="Perplexity auto-overwrote the canonical citation. Please review.">
                          <AlertTriangle className="h-3 w-3" />
                          AI auto-correction
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        {formatDate(ref.last_verified)}
                      </div>
                      {ref.last_changed && (
                        <p className="text-slate-600 text-[11px] mt-0.5">Changed: {formatDate(ref.last_changed)}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden xl:table-cell">
                      <span className={`text-xs font-medium capitalize ${STRENGTH_CONFIG[ref.strength] || 'text-slate-600'}`}>
                        {ref.strength}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden xl:table-cell">
                      {(() => {
                        const c = blockEffect[ref.id];
                        if (!c || c.total === 0) {
                          return <span className="text-xs text-slate-400">—</span>;
                        }
                        const stale = !['current', 'updated', 'verified'].includes(ref.verification_status);
                        return (
                          <span className={`text-xs font-medium ${stale && c.total > 0 ? 'text-red-600' : 'text-slate-700'}`} title={`B2C ${c.b2c} · B2B ${c.b2b}`}>
                            {c.total}{stale ? ' ⚠' : ''}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={ref.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-500 transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View source
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Shield className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-600 text-sm">No references match your filters.</p>
          </div>
        )}
      </div>

      {/* Review queue — AI-assisted manual verification */}
      {(() => {
        const reviewable = refs
          .filter(needsReview)
          .sort((a, b) => {
            // last_verified NULLS FIRST, then created_at DESC
            if (!a.last_verified && b.last_verified) return -1;
            if (a.last_verified && !b.last_verified) return 1;
            if (a.last_verified && b.last_verified) {
              const at = new Date(a.last_verified).getTime();
              const bt = new Date(b.last_verified).getTime();
              if (at !== bt) return at - bt;
            }
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        const totalPages = Math.max(1, Math.ceil(reviewable.length / REVIEW_PAGE_SIZE));
        const page = Math.min(reviewPage, totalPages - 1);
        const slice = reviewable.slice(page * REVIEW_PAGE_SIZE, (page + 1) * REVIEW_PAGE_SIZE);
        const allIds = reviewable.map(r => r.id);
        const totalCost = (reviewable.length * PERPLEXITY_COST_PER_ROW_GBP).toFixed(3);
        const anyVerifying = aiVerifyingIds.size > 0;
        return (
          <div className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 font-[family-name:var(--font-heading)]">
                  Review queue
                </h2>
                <p className="text-slate-600 text-sm mt-1">
                  {reviewable.length} reference{reviewable.length === 1 ? '' : 's'} need attention
                  {' '}— needs review, broken, stale, errored, never verified, or last verified &gt; 60 days ago.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {batchProgress && (
                  <span className="text-xs text-slate-600">
                    Verifying {batchProgress.done} of {batchProgress.total}…
                  </span>
                )}
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={anyVerifying || verifyAllRunning || reviewable.length === 0}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                >
                  {anyVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Verify needs-review only
                </button>
                <button
                  onClick={() => setConfirmAllOpen(true)}
                  disabled={anyVerifying || verifyAllRunning || refs.length === 0}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                  title="Re-verify every legal_references row to establish a clean baseline"
                >
                  {verifyAllRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Re-verify ALL refs (full baseline)
                </button>
              </div>
            </div>

            {verifyAllResult && (
              <div className={`mb-3 px-4 py-3 rounded-xl text-sm font-medium border ${
                verifyAllResult.startsWith('Done') ? 'bg-green-500/10 border-green-500/20 text-green-700' : 'bg-red-500/10 border-red-500/20 text-red-500'
              }`}>
                {verifyAllResult}
              </div>
            )}

            {confirmAllOpen && (
              <div
                className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                onClick={() => setConfirmAllOpen(false)}
              >
                <div
                  className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Re-verify ALL references</h3>
                  <p className="text-sm text-slate-600 mb-5">
                    This will re-verify all {refs.length} refs to establish a clean
                    compliance baseline. Cost ~£{(refs.length * PERPLEXITY_COST_PER_ROW_GBP).toFixed(2)}.
                    High-confidence corrections will auto-overwrite the canonical
                    citation fields and be flagged with an amber badge for your review.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmAllOpen(false)}
                      className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setConfirmAllOpen(false);
                        setVerifyAllRunning(true);
                        setVerifyAllResult(null);
                        try {
                          const res = await fetch('/api/admin/legal-refs/verify-all', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({}),
                          });
                          const data = await res.json();
                          if (data.ok && data.counts) {
                            const c = data.counts;
                            setVerifyAllResult(
                              `Done. ${c.verified} verified · ${c.updated} auto-updated · ${c.superseded} superseded · ${c.needs_review} needs review · ${c.broken} broken · ${c.error} errors · ${c.auto_corrected} auto-corrected (review).`
                            );
                            await fetchRefs();
                          } else {
                            setVerifyAllResult(`Error: ${data.error || 'Unknown error'}`);
                          }
                        } catch (err: any) {
                          setVerifyAllResult(`Failed: ${err?.message || 'Request failed'}`);
                        } finally {
                          setVerifyAllRunning(false);
                        }
                      }}
                      className="px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg"
                    >
                      Run full baseline
                    </button>
                  </div>
                </div>
              </div>
            )}

            {confirmOpen && (
              <div
                className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                onClick={() => setConfirmOpen(false)}
              >
                <div
                  className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Confirm AI verification</h3>
                  <p className="text-sm text-slate-600 mb-5">
                    This will run Perplexity verification on {reviewable.length} row
                    {reviewable.length === 1 ? '' : 's'} at ~£0.004 each = £{totalCost} total.
                    Proceed?
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmOpen(false)}
                      className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setConfirmOpen(false);
                        verifyWithAi(allIds);
                      }}
                      className="px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-lg"
                    >
                      Run verification
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Title / Source</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden md:table-cell">Year</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden md:table-cell">URL</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide hidden lg:table-cell">Last verified</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slice.map((ref) => {
                      const status = STATUS_CONFIG[ref.verification_status] || STATUS_CONFIG.needs_review;
                      const StatusIcon = status.icon;
                      const verifying = aiVerifyingIds.has(ref.id);
                      const result = aiResults[ref.id];
                      const year = (ref.created_at || '').slice(0, 4) || '—';
                      const truncated = ref.source_url.length > 50
                        ? ref.source_url.slice(0, 47) + '…'
                        : ref.source_url;
                      return (
                        <tr key={ref.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-slate-900 text-sm font-medium">{ref.law_name}</p>
                            <p className="text-slate-600 text-xs mt-0.5">{ref.source_type || '—'}{ref.section ? ` · ${ref.section}` : ''}</p>
                          </td>
                          <td className="px-5 py-4 text-slate-700 text-sm hidden md:table-cell">{year}</td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <a
                              href={ref.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-500 text-xs"
                              title={ref.source_url}
                            >
                              {truncated}
                            </a>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}>
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </span>
                            {ref.auto_corrected && (
                              <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200" title="Perplexity auto-overwrote the canonical citation. Please review.">
                                <AlertTriangle className="h-3 w-3" />
                                AI auto-correction — please review
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 hidden lg:table-cell text-slate-600 text-xs">
                            {relativeTime(ref.last_verified)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              <a
                                href={ref.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 px-2.5 py-1.5 border border-slate-200 rounded-lg"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open URL
                              </a>
                              <button
                                onClick={() => verifyWithAi([ref.id])}
                                disabled={verifying}
                                className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 px-2.5 py-1.5 rounded-lg"
                              >
                                {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                Verify with AI
                              </button>
                            </div>
                            {result && (
                              <p className={`text-[11px] mt-1.5 text-right ${result.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                                {result.ok ? '✓ ' : '✗ '}{result.ok ? (
                                  result.status === 'no_change' ? 'No change · still current'
                                  : result.status === 'queued' ? 'Correction queued for review'
                                  : result.status === 'auto_applied' ? 'Auto-applied (low-risk)'
                                  : `Verified · ${result.status}`
                                ) : (result.notes || 'Failed')}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {reviewable.length === 0 && (
                <div className="py-12 text-center">
                  <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-slate-600 text-sm">All references are up to date.</p>
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3">
                <p className="text-slate-600 text-xs">
                  Page {page + 1} of {totalPages} · showing {slice.length} of {reviewable.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReviewPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setReviewPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <p className="text-slate-600 text-xs mt-4 text-center">
        Verification runs automatically on the 1st of each month. Statutes are checked via legislation.gov.uk. Regulator rules are compared with a fast AI model.
      </p>
    </div>
  );
}
