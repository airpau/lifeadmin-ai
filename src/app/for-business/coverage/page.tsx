/**
 * /for-business/coverage — public reference of every UK statute the
 * /v1/disputes engine cites, grouped by sector + use case.
 *
 * Server-rendered from the legal_references table at request time so
 * the published list always tracks what the engine actually grounds
 * against. We render law name + section + a short summary; we do NOT
 * expose source URLs (those are an engineering surface, not a sales
 * surface) or how the engine reasons.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Coverage — Paybacker UK Consumer Rights API',
  description:
    'Every UK statute, regulation, and regulator code the Paybacker /v1/disputes API can cite — by sector and use case.',
  alternates: { canonical: 'https://paybacker.co.uk/for-business/coverage' },
};

interface Ref {
  law_name: string;
  section: string | null;
  summary: string | null;
  category: string;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const TEXT = '#0f172a';
const MUTED = '#475569';
const BORDER = '#e2e8f0';

const SECTOR_LABELS: Record<string, { label: string; useCases: string[] }> = {
  finance: {
    label: 'Finance & credit',
    useCases: [
      'Section 75 chargebacks',
      'Disputed transactions',
      'Late fees & interest reversals',
      'Debt-collection responses',
      'Credit-file corrections',
    ],
  },
  energy: {
    label: 'Energy',
    useCases: [
      'Back-billing disputes',
      'Price-cap breaches',
      'Smart-meter failures',
      'Switching block disputes',
      'Final-bill inaccuracies',
    ],
  },
  broadband: {
    label: 'Broadband, mobile & TV',
    useCases: [
      'Speed below contract minimum',
      'Mid-contract price rises',
      'Penalty-free exit claims',
      'Service credits',
      'Cancellation disputes',
    ],
  },
  travel: {
    label: 'Air travel',
    useCases: [
      'Flight cancellation compensation (UK261)',
      'Long delays',
      'Denied boarding',
      'Lost / damaged baggage',
      'Package travel rights',
    ],
  },
  rail: {
    label: 'Rail',
    useCases: [
      'Delay Repay claims',
      'Strike-related refunds',
      'Cancelled-service refunds',
      'Season-ticket disputes',
    ],
  },
  insurance: {
    label: 'Insurance',
    useCases: [
      'Wrongful claim declines',
      'Underwriting errors',
      'Renewal price-walking',
      'Treating-customers-fairly breaches',
    ],
  },
  council_tax: {
    label: 'Council tax',
    useCases: [
      'Band challenges',
      'Discount / exemption disputes',
      'Liability disputes',
    ],
  },
  parking: {
    label: 'Parking',
    useCases: [
      'Private-land charge appeals',
      'Council PCN appeals',
      'Signage adequacy challenges',
    ],
  },
  hmrc: {
    label: 'HMRC',
    useCases: [
      'Tax-rebate claims',
      'PAYE corrections',
      'Penalty appeals',
    ],
  },
  dvla: {
    label: 'DVLA',
    useCases: [
      'Late-licensing penalty appeals',
      'Wrong vehicle keeper records',
    ],
  },
  nhs: {
    label: 'NHS',
    useCases: [
      'Formal complaint escalation',
      'Continuing-healthcare reviews',
    ],
  },
  gym: {
    label: 'Gym memberships',
    useCases: [
      'Cancellation disputes',
      'Fee-after-cancellation claims',
    ],
  },
  debt: {
    label: 'Debt & enforcement',
    useCases: [
      'Statute-barred debt challenges',
      'Bailiff conduct',
    ],
  },
  general: {
    label: 'Cross-sector consumer rights',
    useCases: [
      'Faulty / not-as-described goods (Consumer Rights Act 2015)',
      'Distance-selling cancellation rights',
      'Unfair contract terms',
      'Misrepresentation',
    ],
  },
};

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  );
}

async function fetchCoverage(): Promise<Ref[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const supabase = getClient();
    const { data } = await supabase
      .from('legal_references')
      .select('law_name, section, summary, category')
      .order('law_name');
    return (data ?? []) as Ref[];
  } catch {
    return [];
  }
}

export default async function CoveragePage() {
  const refs = await fetchCoverage();
  const byCategory = new Map<string, Ref[]>();
  for (const r of refs) {
    const k = r.category || 'general';
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k)!.push(r);
  }

  const orderedCats = Object.keys(SECTOR_LABELS).filter((k) => byCategory.has(k));

  return (
    <main style={{ background: '#fff', minHeight: '100vh', color: TEXT, fontFamily: FONT }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '64px 24px', lineHeight: 1.65 }}>
        <nav style={{ marginBottom: 40, fontSize: 14, color: '#64748b' }}>
          <Link href="/for-business" style={{ color: '#64748b', textDecoration: 'none' }}>← Back to /for-business</Link>
          {' · '}
          <Link href="/for-business/docs" style={{ color: '#64748b', textDecoration: 'none' }}>Read the full API docs</Link>
        </nav>

        <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
          What the API covers
        </h1>
        <p style={{ marginTop: 12, fontSize: 18, color: MUTED }}>
          Every UK statute, regulation, and regulator code the engine can cite —
          grouped by sector and the use cases they unlock.
        </p>
        <p style={{ marginTop: 8, fontSize: 14, color: MUTED }}>
          {refs.length} grounded references · updated daily by an automated legal-monitoring cron.
        </p>

        <p style={{ marginTop: 32, fontSize: 14, color: MUTED }}>
          A request is grounded against this index. The engine cannot fabricate
          an act or section number — it can only cite from what is listed here.
          Below is the public surface of that index.
        </p>

        {orderedCats.map((cat) => {
          const meta = SECTOR_LABELS[cat];
          const list = byCategory.get(cat) ?? [];
          return (
            <section key={cat} id={cat} style={{ marginTop: 56, scrollMarginTop: 80 }}>
              <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
                {meta.label} <span style={{ fontSize: 14, color: MUTED, fontWeight: 500 }}>· {list.length} references</span>
              </h2>

              <h3 style={{ marginTop: 16, fontSize: 14, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Use cases this unlocks
              </h3>
              <ul style={{ marginTop: 6, paddingLeft: 20, color: '#334155' }}>
                {meta.useCases.map((u) => <li key={u}>{u}</li>)}
              </ul>

              <h3 style={{ marginTop: 20, fontSize: 14, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Statutes the API can cite for this sector
              </h3>
              <table style={{ marginTop: 8, width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', borderBottom: `1px solid ${BORDER}`, color: MUTED, fontWeight: 600 }}>Law / Regulation</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px 8px 0', borderBottom: `1px solid ${BORDER}`, color: MUTED, fontWeight: 600 }}>Section / Article</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={`${cat}-${i}`}>
                      <td style={{ padding: '10px 12px 10px 0', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{r.law_name}</div>
                        {r.summary && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{truncate(r.summary, 180)}</div>}
                      </td>
                      <td style={{ padding: '10px 12px 10px 0', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top', color: MUTED, whiteSpace: 'nowrap' }}>
                        {r.section || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        <section style={{ marginTop: 72, padding: '24px 28px', background: '#f8fafc', borderRadius: 12 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>What you can build with this</h2>
          <p style={{ marginTop: 8, color: '#334155' }}>
            One endpoint, every sector above. Some example integration patterns:
          </p>
          <ul style={{ paddingLeft: 20, color: '#334155' }}>
            <li><strong>CX agent assist.</strong> On every inbound complaint ticket, surface the cited statute + draft response inside the agent UI.</li>
            <li><strong>Self-serve dispute portal.</strong> Customer describes the problem; you render the entitlement summary and let them download a draft letter.</li>
            <li><strong>Refund triage.</strong> Score every refund request by which statute applies + estimated success — automate the easy ones, route the hard ones.</li>
            <li><strong>Compliance copilot.</strong> Embed in your ops console so first-line agents always have the right citation a click away.</li>
            <li><strong>Statute-grounded chatbot.</strong> Wrap your LLM in this API so it cannot cite a repealed act.</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            <Link href="/for-business" style={{ background: '#0f172a', color: '#fff', padding: '10px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>
              Get a free 1,000-call key
            </Link>
            {' '}
            <Link href="/for-business/docs" style={{ background: 'transparent', color: '#475569', padding: '10px 18px', borderRadius: 8, textDecoration: 'none', border: `1px solid ${BORDER}`, fontWeight: 600, display: 'inline-block' }}>
              Read the docs
            </Link>
          </p>
        </section>

        <footer style={{ marginTop: 64, borderTop: `1px solid ${BORDER}`, paddingTop: 24, fontSize: 14, color: '#64748b' }}>
          <p>
            Paybacker LTD · Registered in the UK ·{' '}
            <Link href="/for-business" style={{ color: '#64748b' }}>/for-business</Link>
          </p>
          <p style={{ marginTop: 8, fontSize: 12 }}>
            This page lists statutes the engine grounds against — it is not legal advice.
            The engine&rsquo;s reasoning, ranking heuristics, and retrieval pipeline are
            proprietary and not described here.
          </p>
        </footer>
      </div>
    </main>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
