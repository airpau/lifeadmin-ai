// Public, read-only documents register for the holder of an accountant
// share link (/shared/register/<token>). Not indexed, no referrer sent,
// rate limited per IP. Each download goes through a route that re-checks
// the token and hands out a 60 second signed URL.

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { documentsAdmin } from '@/lib/documents/route-helpers';
import { clientIp, resolveShareToken, touchShareLink } from '@/lib/documents/share-links';
import { checkIpRateLimit } from '@/lib/rate-limit';
import { DOC_TYPE_SINGULAR, type DocType } from '@/lib/documents/types';
import { dueOrExpiry, registerDate } from '@/lib/documents/register';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Documents register | Paybacker',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

interface Row {
  id: string;
  doc_type: DocType;
  supplier: string | null;
  summary: string | null;
  filename: string;
  amount: number | null;
  currency: string | null;
  vat_amount: number | null;
  doc_date: string | null;
  due_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  email_date: string | null;
  created_at: string;
}

function money(n: number | null, currency: string | null): string {
  if (n === null || n === undefined) return '';
  const v = Number(n).toFixed(2);
  return !currency || currency === 'GBP' ? `£${v}` : `${v} ${currency}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <p className="text-sm font-semibold text-emerald-700 mb-1">Paybacker</p>
        {children}
      </div>
    </main>
  );
}

export default async function SharedRegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();

  const rl = await checkIpRateLimit(clientIp(h), 'shared-register-page', 30);
  if (!rl.allowed) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-2">Please wait a moment</h1>
        <p className="text-slate-600">This page has been opened a lot in the last minute. Try again shortly.</p>
      </Shell>
    );
  }

  const admin = documentsAdmin();
  const r = await resolveShareToken(admin, token);
  if (!r.ok) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-2">This link is no longer available</h1>
        <p className="text-slate-600">It has expired or been switched off by the person who shared it. Ask them to send you a new link.</p>
      </Shell>
    );
  }
  void touchShareLink(admin, r.link.linkId);

  const { data } = await admin
    .from('documents')
    .select('id, doc_type, supplier, summary, filename, amount, currency, vat_amount, doc_date, due_date, expiry_date, renewal_date, email_date, created_at')
    .eq('user_id', r.link.userId)
    .eq('status', 'active')
    .order('doc_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  const rows = (data as Row[] | null) ?? [];
  const expires = new Date(r.link.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

  return (
    <Shell>
      <h1 className="text-2xl font-bold mb-1">Documents register{r.link.label ? `: ${r.link.label}` : ''}</h1>
      <p className="text-slate-600 text-sm mb-6">
        Read-only. Shared through Paybacker. This link works until {expires}. Downloads open for one minute each.
      </p>

      {rows.length === 0 ? (
        <p className="text-slate-600">There are no documents in this register yet.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2">Due or expiry</th>
                <th className="px-3 py-2">File</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{registerDate(d)}</td>
                  <td className="px-3 py-2">{DOC_TYPE_SINGULAR[d.doc_type] ?? 'Document'}</td>
                  <td className="px-3 py-2">{d.supplier ?? ''}</td>
                  <td className="px-3 py-2 text-slate-600">{d.summary || d.filename}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{money(d.amount, d.currency)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{money(d.vat_amount, d.currency)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{dueOrExpiry(d)}</td>
                  <td className="px-3 py-2">
                    <a
                      className="text-emerald-700 font-medium hover:underline"
                      href={`/api/shared/register/${encodeURIComponent(token)}/download/${d.id}`}
                      rel="noreferrer noopener"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
