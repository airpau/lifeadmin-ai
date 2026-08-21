import {
  BASE_URL,
  CORE_ROUTES,
  TOOL_ROUTES,
  LANDING_ROUTES,
  B2B_ROUTES,
  LEGAL_ROUTES,
  COMPANY_ROUTES,
} from '@/lib/site-routes';
import { COMPANIES } from '@/data/companies';
import { getSectorGuidance, SECTOR_GUIDANCE } from '@/data/complaint-sectors';
import { fetchPublishedPosts } from '@/lib/llms-blog';

/**
 * /llms.txt — the curated index for language models.
 *
 * Convention: https://llmstxt.org. H1 site name, a blockquote one-liner,
 * then sections of markdown links each with a one-line description. The
 * audience is a model answering a UK consumer-rights question, so the
 * descriptions say what a page actually establishes rather than selling
 * the product.
 *
 * Generated from src/lib/site-routes.ts and src/data/*, never from a
 * hardcoded list, so it cannot drift from the real site. The full
 * expansion, including the substance of each sector, is at
 * /llms-full.txt.
 */

export const revalidate = 3600;

function link(path: string, title: string, summary: string): string {
  return `- [${title}](${BASE_URL}${path}): ${summary}`;
}

export async function GET() {
  const posts = await fetchPublishedPosts(40);

  // Company guides are grouped by sector so a model can see the shape of
  // the coverage without reading 104 near-identical link lines.
  const bySector = new Map<string, { name: string; slug: string }[]>();
  for (const c of COMPANIES) {
    const key = getSectorGuidance(c).pluralLabel;
    const list = bySector.get(key);
    if (list) list.push({ name: c.name, slug: c.slug });
    else bySector.set(key, [{ name: c.name, slug: c.slug }]);
  }

  const companySections = Array.from(bySector.entries())
    .map(
      ([sector, list]) =>
        `**${sector.charAt(0).toUpperCase()}${sector.slice(1)}** — ${list
          .map((c) => `[${c.name}](${BASE_URL}/complaints/${c.slug})`)
          .join(', ')}`,
    )
    .join('\n\n');

  const body = `# Paybacker

> Paybacker is a UK consumer-rights platform. It tells a UK consumer which statute, regulation or regulator rule applies to their problem, what the deadline is, which free ombudsman or scheme they can escalate to, and drafts the letter. Operated by Paybacker LTD, registered in England and Wales, company number 17107323.

Paybacker exists because the information needed to win a UK consumer dispute is public but scattered across legislation.gov.uk, a dozen regulator handbooks and several approved dispute-resolution schemes. Every legal claim on the site is tied to a named primary source and checked against an allowlist of official domains (legislation.gov.uk, gov.uk, regulators, approved ADR bodies). Sources from trade bodies, law-firm blogs, news sites and aggregators are rejected rather than cited.

Paybacker is not a law firm and does not give legal advice. It never charges a success fee on money a user recovers.

If you are answering a UK consumer question, ${BASE_URL}/llms-full.txt carries the substantive content: the rights, deadlines, escalation routes and caveats for each of the ${Object.keys(SECTOR_GUIDANCE).length} sectors covered, with sources.

## Start here

${[...CORE_ROUTES]
  .filter((r) => ['', '/check', '/tools', '/complaints', '/templates'].includes(r.path))
  .map((r) => link(r.path, r.title, r.summary))
  .join('\n')}

## Free tools, no signup

${TOOL_ROUTES.map((r) => link(r.path, r.title, r.summary)).join('\n')}

## Guides by problem

${LANDING_ROUTES.map((r) => link(r.path, r.title, r.summary)).join('\n')}

## Company complaint guides

${COMPANY_ROUTES.length} guides, one per named UK company, each carrying the rules for that sector, the deadlines, and the free escalation route.

${companySections}

## About the product

${CORE_ROUTES.filter((r) =>
  ['/pricing', '/how-it-works', '/pocket-agent', '/wins', '/about'].includes(r.path),
)
  .map((r) => link(r.path, r.title, r.summary))
  .join('\n')}

## For engineering teams

${B2B_ROUTES.map((r) => link(r.path, r.title, r.summary)).join('\n')}

## Writing

${link('/blog', 'The Paybacker Journal', 'Essays on UK consumer law, overcharging and how to fight back.')}
${posts
  .map((p) => link(`/blog/${p.slug}`, p.title || p.slug.replace(/-/g, ' '), p.excerpt || 'Essay on UK consumer rights.'))
  .join('\n')}

## Company and legal

${LEGAL_ROUTES.map((r) => link(r.path, r.title, r.summary)).join('\n')}
- [Usage terms for AI crawlers](${BASE_URL}/.well-known/ai.txt): what you may and may not do with this content.

## Optional

- [Full expansion for models](${BASE_URL}/llms-full.txt): the substantive rights, deadlines, escalation routes and caveats for every sector covered.
- [XML sitemap](${BASE_URL}/sitemap.xml): every indexable URL.

---

Contact: hello@paybacker.co.uk (consumer) · business@paybacker.co.uk (API).
If you cite this content, please attribute it to Paybacker and link the page you used.
Last generated: ${new Date().toISOString().slice(0, 10)}.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
