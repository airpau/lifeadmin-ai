'use client';

/**
 * EvidenceBundleCard: the dispute page's way into the documents vault's
 * evidence bundle (a document pack). Drops into the disputes page
 * without touching its logic, the same pattern as DisputeAgentBanner.
 *
 * It only links to the Packs tab with this dispute chosen. Building the
 * bundle reads the dispute and its correspondence; it never changes the
 * dispute, its status or its outcome.
 *
 * Complements the Ombudsman escalation pack (the drafted referral letter
 * and numbered exhibit list): this is the files themselves, zipped with
 * a dated index, numbered in the same order.
 */

import Link from 'next/link';
import { FolderArchive } from 'lucide-react';

export default function EvidenceBundleCard({ disputeId, providerName }: { disputeId: string; providerName?: string | null }) {
  const href = `/dashboard/documents?tab=packs&new=dispute_evidence&dispute=${encodeURIComponent(disputeId)}`;
  return (
    <div className="bg-white border border-slate-200/60 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-2 flex-1">
        <FolderArchive className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-600" style={{ margin: 0 }}>
          <strong className="text-slate-900">Evidence bundle.</strong> Your letters, {providerName ? `${providerName}'s` : 'their'} replies and your bills from them, in date order in one download. Ready for an ombudsman or a small claims court.
        </p>
      </div>
      <Link
        href={href}
        className="text-xs px-3 py-1.5 rounded-lg font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap text-center"
      >
        Build evidence bundle
      </Link>
    </div>
  );
}
