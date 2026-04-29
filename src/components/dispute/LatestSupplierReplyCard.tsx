'use client';

/**
 * Pinned card showing the most-recent supplier reply for a dispute.
 *
 * Why this exists: the dispute timeline collapses everything except
 * the top-most entry by default ("Show full history (N earlier
 * entries)"). When the user has just sent a follow-up letter, the
 * letter sorts above the supplier reply by created_at tiebreak — so
 * the reply they actually need to read is hidden behind the toggle.
 *
 * Paul reported (2026-04-29) that OneStream showed "NEW REPLY · 4"
 * in the disputes list but the detail page showed zero reply
 * content. Root cause: the user's freshly-saved 28-Apr letter had a
 * later created_at than the imported 28-Apr supplier replies, so
 * only the letter rendered before "Show full history".
 *
 * This card is independent of timeline collapse — it ALWAYS shows
 * the latest company_email entry with full expandable body.
 */

import { useState } from 'react';
import { Mail, ExternalLink, Sparkles } from 'lucide-react';
import EmailCorrespondenceBody from '@/components/dispute/EmailCorrespondenceBody';

interface CorrespondenceEntry {
  id: string;
  entry_type: string;
  title?: string | null;
  content?: string | null;
  sender_name?: string | null;
  sender_address?: string | null;
  entry_date: string;
  created_at?: string;
  detected_from_email?: boolean;
  supplier_web_link?: string | null;
  ai_respond_needed?: boolean | null;
  ai_urgency?: string | null;
  ai_rationale?: string | null;
}

const SUPPLIER_TYPES = new Set(['company_email', 'company_letter', 'company_response']);

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function LatestSupplierReplyCard({
  correspondence,
  providerName,
  userHasGmail,
  userHasOutlook,
  onDraftReply,
}: {
  correspondence: CorrespondenceEntry[];
  providerName: string;
  userHasGmail?: boolean;
  userHasOutlook?: boolean;
  onDraftReply?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const supplierReplies = (correspondence ?? [])
    .filter((c) => SUPPLIER_TYPES.has(c.entry_type))
    .sort((a, b) => {
      const ad = new Date(a.entry_date).getTime();
      const bd = new Date(b.entry_date).getTime();
      if (bd !== ad) return bd - ad;
      const ac = new Date(a.created_at || 0).getTime();
      const bc = new Date(b.created_at || 0).getTime();
      return bc - ac;
    });

  if (supplierReplies.length === 0) return null;

  const latest = supplierReplies[0];
  const olderReplies = supplierReplies.slice(1);
  const visible = showAll ? supplierReplies : [latest];

  const headerLabel = supplierReplies.length === 1
    ? `Latest reply from ${providerName}`
    : `${supplierReplies.length} replies from ${providerName} — latest first`;

  return (
    <div className="card mb-4" style={{ borderColor: '#fde68a', background: '#fffdf5' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-900">{headerLabel}</h3>
          {latest.ai_respond_needed === true && (
            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide" title={latest.ai_rationale ?? undefined}>
              Action needed
            </span>
          )}
          {latest.ai_respond_needed === false && (
            <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-300 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide" title={latest.ai_rationale ?? undefined}>
              Auto-reply · no action
            </span>
          )}
        </div>
        {onDraftReply && (
          <button
            type="button"
            onClick={onDraftReply}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            title="Draft a follow-up letter responding to this reply"
          >
            <Sparkles className="h-3 w-3" /> Draft reply
          </button>
        )}
      </div>

      <div className="space-y-3">
        {visible.map((reply) => (
          <div key={reply.id} className={visible.length > 1 ? 'border-t border-amber-200/60 pt-3 first:border-t-0 first:pt-0' : ''}>
            <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {reply.sender_name && (
                  <span className="font-medium text-slate-800 truncate">{reply.sender_name}</span>
                )}
                {reply.sender_address && (
                  <span className="text-slate-500 truncate">&lt;{reply.sender_address}&gt;</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span>{timeAgo(reply.entry_date)}</span>
                {reply.supplier_web_link && (userHasGmail || userHasOutlook) && (
                  <a
                    href={reply.supplier_web_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900"
                    title={userHasGmail ? 'Open in Gmail' : 'Open in Outlook'}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                )}
              </div>
            </div>
            {reply.title && (
              <p className="text-xs font-medium text-slate-700 mb-2">{reply.title}</p>
            )}
            <EmailCorrespondenceBody content={reply.content || ''} />
          </div>
        ))}
      </div>

      {olderReplies.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs text-emerald-700 hover:text-emerald-900 font-medium"
        >
          {showAll ? 'Show only the latest reply' : `Show ${olderReplies.length} older repl${olderReplies.length === 1 ? 'y' : 'ies'}`}
        </button>
      )}
    </div>
  );
}
