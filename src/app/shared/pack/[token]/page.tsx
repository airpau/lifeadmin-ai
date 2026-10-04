// Public, read-only page for the holder of a document pack share link
// (/shared/pack/<token>): what the pack is, its checklist and the list of
// documents in it, with one download button for the ZIP. Not indexed, no
// referrer sent, rate limited per IP. A pack link opens this pack only,
// never the owner's register or any other document.

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { documentsAdmin } from '@/lib/documents/route-helpers';
import { clientIp, resolveShareToken, touchShareLink } from '@/lib/documents/share-links';
import { checkIpRateLimit } from '@/lib/rate-limit';
import { getPackDefinition } from '@/lib/documents/packs/registry';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Document pack | Paybacker',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  found: boolean;
  count: number;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-sm font-semibold text-emerald-700 mb-1">Paybacker</p>
        {children}
      </div>
    </main>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

export default async function SharedPackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();

  const rl = await checkIpRateLimit(clientIp(h), 'shared-pack-page', 30);
  if (!rl.allowed) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-2">Please wait a moment</h1>
        <p className="text-slate-600">This page has been opened a lot in the last minute. Try again shortly.</p>
      </Shell>
    );
  }

  const admin = documentsAdmin();
  const r = await resolveShareToken(admin, token, 'pack');
  const gone = (
    <Shell>
      <h1 className="text-2xl font-bold mb-2">This link is no longer available</h1>
      <p className="text-slate-600">It has expired or been switched off by the person who shared it. Ask them to send you a new link.</p>
    </Shell>
  );
  if (!r.ok || !r.link.packId) return gone;

  const { data: pack } = await admin
    .from('document_packs')
    .select('pack_type, title, status, checklist, document_ids, file_count, size_bytes, generated_at')
    .eq('id', r.link.packId)
    .eq('user_id', r.link.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!pack || pack.status !== 'ready') return gone;
  void touchShareLink(admin, r.link.linkId);

  const def = getPackDefinition(pack.pack_type);
  const checklist = (Array.isArray(pack.checklist) ? pack.checklist : []) as ChecklistItem[];
  const expires = fmtDate(r.link.expiresAt);
  const sizeMb = pack.size_bytes ? Math.max(0.1, Math.round((Number(pack.size_bytes) / 1048576) * 10) / 10) : null;

  return (
    <Shell>
      <h1 className="text-2xl font-bold mb-1">{pack.title as string}</h1>
      <p className="text-slate-600 text-sm mb-1">{def ? def.name : 'Document pack'}{r.link.label ? `, shared as "${r.link.label}"` : ''}</p>
      <p className="text-slate-600 text-sm mb-6">
        Read-only. Shared through Paybacker. Prepared on {fmtDate(pack.generated_at as string | null)}. This link works until {expires}.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <p className="text-sm text-slate-700 mb-4">
          The pack is one ZIP file{pack.file_count ? ` with ${pack.file_count} files` : ''}{sizeMb ? ` (${sizeMb} MB)` : ''}. Open 00 Index.pdf first: it lists every document with its date, supplier and amount.
        </p>
        <a
          href={`/api/shared/pack/${encodeURIComponent(token)}/download`}
          rel="noreferrer noopener"
          className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2 rounded-lg"
        >
          Download the pack
        </a>
      </div>

      {checklist.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700 mb-3">What is in it</h2>
          <ul className="space-y-2 text-sm">
            {checklist.map((c) => (
              <li key={c.key} className="flex gap-2">
                <span className={c.found ? 'text-emerald-700 font-semibold' : c.required ? 'text-red-700 font-semibold' : 'text-slate-500 font-semibold'}>
                  {c.found ? 'Included' : c.required ? 'Missing' : 'Not included'}
                </span>
                <span className="text-slate-700">
                  {c.label}
                  {c.count > 0 ? ` (${c.count})` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}
