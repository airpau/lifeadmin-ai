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
      'Auto-triage Section 75 chargeback claims at the agent UI level',
      'Score disputed-transaction tickets by entitlement before assigning',
      'Generate FCA-CONC compliant late-fee reversal responses',
      'Debt-collection inbound triage (statute-barred detection)',
      'Credit-file correction workflows grounded in CCA 1974',
    ],
  },
  energy: {
    label: 'Energy',
    useCases: [
      'Back-billing eligibility scoring inside CX agent UI',
      'Ofgem price-cap breach detection in billing-anomaly pipelines',
      'Smart-meter failure complaint drafts ready for agent review',
      'Switching-block dispute resolution at first contact',
      'Auto-flag final-bill inaccuracies for a customer service review queue',
    ],
  },
  broadband: {
    label: 'Broadband, mobile & TV',
    useCases: [
      'Real-time speed-vs-contract checks against Ofcom minimum-speed code',
      'Mid-contract CPI price rise dispute detection',
      'Penalty-free-exit eligibility scoring on cancellation flows',
      'Auto-generate service-credit calculations grounded in GC C1',
      'Cancellation-dispute response copy for retention agents',
    ],
  },
  travel: {
    label: 'Air travel',
    useCases: [
      'UK261 cancellation/delay compensation eligibility at the agent UI',
      'Long-delay scoring with extraordinary-circumstances test',
      'Denied-boarding entitlement narrative for claims assessors',
      'Lost-baggage Montreal-Convention liability calculation',
      'Package-travel-regs route handling in OTA self-serve',
    ],
  },
  rail: {
    label: 'Rail',
    useCases: [
      'Delay Repay eligibility automation in passenger apps',
      'Strike-related refund triage with NRCoT grounding',
      'Cancelled-service refund response copy for first-line agents',
      'Season-ticket dispute resolution against TOC conditions of carriage',
    ],
  },
  insurance: {
    label: 'Insurance',
    useCases: [
      'Wrongful claim-decline detection in FOS-bound complaint pipelines',
      'Underwriting-error response generation at point of complaint',
      'Renewal price-walking compliance checks against FCA general insurance pricing rules',
      'Treating-Customers-Fairly breach scoring for compliance dashboards',
    ],
  },
  council_tax: {
    label: 'Council tax',
    useCases: [
      'Band-challenge eligibility scoring inside council CX tools',
      'Discount/exemption dispute response generation',
      'Liability dispute resolution drafts for revenue teams',
    ],
  },
  parking: {
    label: 'Parking',
    useCases: [
      'POPLA-grade appeal generation at point of charge',
      'Council PCN appeal triage by ground of appeal',
      'Signage-adequacy compliance checks against BPA Code of Practice',
    ],
  },
  hmrc: {
    label: 'HMRC',
    useCases: [
      'Tax-rebate claim eligibility for HR/payroll platforms',
      'PAYE-correction response copy for employer support teams',
      'Penalty-appeal grounds detection',
    ],
  },
  dvla: {
    label: 'DVLA',
    useCases: [
      'Late-licensing penalty appeal generation',
      'Vehicle keeper record correction workflows',
    ],
  },
  nhs: {
    label: 'NHS',
    useCases: [
      'Formal-complaint escalation drafts grounded in NHS complaint procedure',
      'Continuing-healthcare review eligibility scoring',
    ],
  },
  gym: {
    label: 'Gym memberships',
    useCases: [
      'Cancellation-dispute resolution under the unfair contract terms regime',
      'Post-cancellation-fee dispute drafts for member support teams',
    ],
  },
  debt: {
    label: 'Debt & enforcement',
    useCases: [
      'Statute-barred detection in Limitation Act 1980 grounded responses',
      'Bailiff conduct complaint generation for debt-advice platforms',
    ],
  },
  general: {
    label: 'Cross-sector consumer rights',
    useCases: [
      'Faulty / not-as-described handling for D2C retail CX (CRA 2015)',
      'Distance-selling cancellation flows (Consumer Contracts Regulations 2013)',
      'Unfair contract terms detection in product compliance reviews',
      'Misrepresentation response automation at marketplace scale',
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
    // Only show statutes the engine actually grounds against today —
    // those marked current/updated by the verification cron. Filtering
    // here keeps the published count honest as the index drifts.
    const { data } = await supabase
      .from('legal_references')
      .select('law_name, section, summary, category')
      .in('verification_status', ['current', 'updated'])
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
          Statute coverage for your CX, claims, and product teams
        </h1>
        <p style={{ marginTop: 12, fontSize: 18, color: MUTED }}>
          Every UK statute, regulation, and regulator code your team can ground
          a customer-facing response in — grouped by sector with the workflows each unlocks.
        </p>
        <p style={{ marginTop: 8, fontSize: 14, color: MUTED }}>
          {refs.length} grounded references · refreshed daily by an automated legal-monitoring cron.
          Your team gets the same index any UK consumer-law lawyer would consult, exposed as a single API call.
        </p>

        <p style={{ marginTop: 32, fontSize: 14, color: MUTED }}>
          Anti-hallucination is structural: a /v1/disputes call can only return citations from this index.
          Your CX agents, product copilots, and self-serve dispute portals never receive a fabricated act
          or section number, regardless of which model sits behind the call.
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
                What your team can build
              </h3>
              <ul style={{ marginTop: 6, paddingLeft: 20, color: '#334155' }}>
                {meta.useCases.map((u) => <li key={u}>{u}</li>)}
              </ul>

              <h3 style={{ marginTop: 20, fontSize: 14, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Statutes the API will ground responses in
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
