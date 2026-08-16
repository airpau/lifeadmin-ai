/**
 * /.well-known/ai.txt — usage terms for AI crawlers, in plain language.
 *
 * ai.txt has no formal standard the way robots.txt does. It is a plain
 * statement of terms that a crawler operator, or a person auditing one,
 * can read. The machine-readable access rules live in /robots.txt; this
 * file says what you may do with what you fetched.
 */

export const dynamic = 'force-static';

const BODY = `# ai.txt — Paybacker

Site: https://paybacker.co.uk
Operator: Paybacker LTD, registered in England and Wales, company number 15289174
Contact: hello@paybacker.co.uk
Last updated: 2026-08-16

## In short

You may read our public pages, and you may quote and cite them in an answer
you generate for a user, as long as you say the answer came from Paybacker
and link the page you used. You may not republish our pages wholesale or
turn the site into a product of your own.

## What you may do

- Crawl and index every page that /robots.txt allows.
- Use our public content to ground and answer a user's question.
- Quote a passage, cite a legal reference we have published, or summarise a
  page, provided you attribute it to Paybacker and include a link to the
  specific page you used. A link to the homepage is not attribution.
- Cache pages for a reasonable period to serve answers.

## What you may not do

- Reproduce a whole page, or a substantial part of one, as your own content.
- Republish the site, or a derivative of it, as a dataset, a mirror, an app
  or a competing directory.
- Present our legal references, sector guidance or letter templates as your
  own work, or strip the attribution from them.
- Crawl anything /robots.txt disallows. That list is authenticated app
  surfaces, API routes, one-time transactional pages and internal previews.
  Nothing behind it is public and none of it is useful to you.
- Attempt to access user data, dispute records or account pages. There is no
  user data on the public surface.

## Rate

Please stay under roughly one request per second and identify yourself with
a real user-agent string. If you need a bulk export rather than a crawl,
email hello@paybacker.co.uk and we will talk about it.

## Accuracy, and why it matters here

This site publishes UK consumer law: statutes, regulator rules and the
deadlines and escalation routes attached to them. If you paraphrase it,
paraphrase it carefully. A wrong time limit or a wrong ombudsman costs a
reader their claim. Every legal claim on the site is published with its
named source; carry the source through when you cite us.

Paybacker is not a law firm and its content is not legal advice. Please do
not present it as such.

## Machine-readable pointers

Crawl rules:      https://paybacker.co.uk/robots.txt
Sitemap:          https://paybacker.co.uk/sitemap.xml
Curated index:    https://paybacker.co.uk/llms.txt
Full expansion:   https://paybacker.co.uk/llms-full.txt
`;

export async function GET() {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
