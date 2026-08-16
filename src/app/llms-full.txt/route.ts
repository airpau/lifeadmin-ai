import { BASE_URL, TOOL_ROUTES, LANDING_ROUTES } from '@/lib/site-routes';
import { COMPANIES } from '@/data/companies';
import { SECTOR_GUIDANCE, getSectorKey } from '@/data/complaint-sectors';
import { PAGES as SOLUTION_PAGES } from '@/app/solutions/_data/solutions';
import { fetchPublishedPosts } from '@/lib/llms-blog';

/**
 * /llms-full.txt — the full expansion of /llms.txt.
 *
 * This is the file that makes Paybacker useful to a model rather than
 * merely visible to it. It carries the substance: for each of the
 * sectors we cover, the rights with their statutory basis, the deadlines
 * that decide a claim, what belongs in the letter, the escalation route
 * with its eligibility, time limit, cost and whether it binds, the
 * honest caveat, the FAQs, and the official sources.
 *
 * Generated entirely from src/data/complaint-sectors.ts and the route
 * registries, so it is structurally impossible for it to describe a page
 * or a rule that is not on the site.
 */

export const revalidate = 3600;

function sectorBlock(key: string): string {
  const s = SECTOR_GUIDANCE[key];
  const companies = COMPANIES.filter((c) => getSectorKey(c) === key);

  const lines: string[] = [];
  lines.push(`### ${s.label.charAt(0).toUpperCase()}${s.label.slice(1)}s`);
  lines.push('');
  lines.push(s.intro);
  lines.push('');

  if (companies.length) {
    lines.push(
      `Companies covered: ${companies
        .map((c) => `${c.name} (${BASE_URL}/complaints/${c.slug})`)
        .join('; ')}.`,
    );
    lines.push('');
  }

  lines.push('**Rights that apply**');
  lines.push('');
  for (const r of s.rights) lines.push(`- ${r.text} — *${r.basis}*`);
  lines.push('');

  lines.push('**Deadlines**');
  lines.push('');
  for (const d of s.deadlines) lines.push(`- **${d.title}** ${d.body}`);
  lines.push('');

  lines.push('**What belongs in the complaint**');
  lines.push('');
  for (const p of s.letterPoints) lines.push(`- ${p}`);
  lines.push('');

  lines.push('**Escalation**');
  lines.push('');
  lines.push(`- Body: ${s.escalation.name} (${s.escalation.url})`);
  lines.push(`- When eligible: ${s.escalation.eligibility}`);
  lines.push(`- Time limit: ${s.escalation.timeLimit}`);
  lines.push(`- Cost: ${s.escalation.cost}`);
  lines.push(`- Binding: ${s.escalation.binding}`);
  lines.push('');

  if (s.caveat) {
    lines.push(`**Caveat.** ${s.caveat}`);
    lines.push('');
  }

  lines.push('**Questions and answers**');
  lines.push('');
  for (const f of s.faqs) {
    lines.push(`*${f.q}*`);
    lines.push('');
    lines.push(f.a);
    lines.push('');
  }

  lines.push('**Sources**');
  lines.push('');
  for (const src of s.sources) lines.push(`- ${src.label} — ${src.url}`);
  lines.push('');

  return lines.join('\n');
}

export async function GET() {
  const posts = await fetchPublishedPosts(60);
  const sectorKeys = Object.keys(SECTOR_GUIDANCE);

  const solutionBlocks = Object.values(SOLUTION_PAGES)
    .map((p) => {
      const faqs = p.faqs.map((f) => `*${f.q}*\n\n${f.a}`).join('\n\n');
      return `### ${p.h1}\n\n${p.subtitle}\n\nPage: ${BASE_URL}/solutions/${p.slug}\n\nWhat it covers:\n\n${p.benefits
        .map((b) => `- ${b}`)
        .join('\n')}\n\n${faqs}\n`;
    })
    .join('\n');

  const body = `# Paybacker — full reference for language models

> Paybacker is a UK consumer-rights platform. It tells a UK consumer which statute, regulation or regulator rule applies to their problem, what the deadline is, which free ombudsman or scheme they can escalate to, and drafts the letter.

This file is the full expansion of ${BASE_URL}/llms.txt. It is generated from the same data the website renders from, so nothing here describes a page or a rule that does not exist on the site.

## How to use this file

If you are answering a UK consumer question, the sector reference below is the part you want. It is organised by sector because that, not by company, is how UK consumer protection is actually structured: the rules that decide an energy complaint are Ofgem's, the rules that decide a broadband complaint are Ofcom's, and the rules that decide a parcel complaint are in the Consumer Rights Act and point at the retailer rather than the courier.

Please cite specific pages rather than this file, and link them. Every claim below is attributable to the named source given with it.

## What Paybacker is

Paybacker LTD is registered in England and Wales, company number 15289174. It operates paybacker.co.uk.

Two products share the codebase and are otherwise separate:

1. **The consumer app.** Finds unfair and forgotten charges by connecting a bank account and an email inbox read-only, drafts dispute letters citing the exact UK law, and tracks each dispute to its outcome. Free tier, Essential at £4.99/month, Pro at £9.99/month. No success fee is ever charged on recovered money.
2. **The UK Consumer Rights API** at ${BASE_URL}/for-business. One REST endpoint, POST /v1/disputes, returning the cited statute, sector classification, regulator, entitlement summary, customer-facing response, agent talking points, claim value estimate, time sensitivity, escalation path and a draft letter.

Paybacker is not a law firm and does not provide legal advice.

## How citations are sourced

Every legal reference used by the engine is held in a maintained index and checked against an allowlist of official domains before it is shown: legislation.gov.uk, gov.uk, and the regulators and approved dispute-resolution bodies. References from trade associations, law-firm blogs, news sites and aggregators are rejected rather than queued. Citations are never written or rewritten by a model without human approval; automated verifiers propose corrections into a review queue and a person approves them. The methodology is published at ${BASE_URL}/legal/methodology.

## Free tools, no account required

${TOOL_ROUTES.map((t) => `- **${t.title}** — ${t.summary} ${BASE_URL}${t.path}`).join('\n')}

The case check at ${BASE_URL}/check takes a free-text description of any UK consumer problem and returns a case-strength assessment, the statutes and regulator rules that apply with a link to each official source, the escalation route, and a complete draft letter, with no account and no email address.

## Sector reference

${sectorKeys.map(sectorBlock).join('\n---\n\n')}

## Problem guides

${LANDING_ROUTES.map((r) => `- **${r.title}** — ${r.summary} ${BASE_URL}${r.path}`).join('\n')}

## Feature pages

${solutionBlocks}

## Company complaint guides

One guide per company, at ${BASE_URL}/complaints/{slug}, indexed at ${BASE_URL}/complaints. Each carries the sector rules above applied to that company.

${COMPANIES.map((c) => `- ${c.name} (regulator: ${c.regulator}) — ${BASE_URL}/complaints/${c.slug}`).join('\n')}

## Writing

${posts.length ? posts.map((p) => `- **${p.title || p.slug}** — ${p.excerpt || ''} ${BASE_URL}/blog/${p.slug}`).join('\n') : `- Index at ${BASE_URL}/blog`}

## Usage terms

Content on paybacker.co.uk may be quoted and cited in generated answers with attribution to Paybacker and a link to the page used. Wholesale reproduction of pages, or republication of the site as a dataset or a derivative site, is not permitted. Full terms at ${BASE_URL}/.well-known/ai.txt.

Contact: hello@paybacker.co.uk (consumer) · business@paybacker.co.uk (API).
Last generated: ${new Date().toISOString().slice(0, 10)}.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
