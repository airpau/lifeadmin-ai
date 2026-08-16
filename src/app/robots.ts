import { MetadataRoute } from 'next'
import { DISALLOWED_PREFIXES } from '@/lib/site-routes'

/**
 * Single source of truth for robots.txt.
 *
 * There is deliberately no public/robots.txt. Next serves this route at
 * /robots.txt, and a static file of the same name in public/ would be a
 * second, silently competing definition.
 *
 * DISALLOWED_PREFIXES is shared with src/lib/site-routes.ts so the
 * sitemap generator can assert it never lists a blocked URL.
 *
 * ---------------------------------------------------------------------
 * AI crawlers
 * ---------------------------------------------------------------------
 * Paybacker wants to be citeable in ChatGPT, Claude, Perplexity and
 * Google AI Overviews answers to UK consumer-rights questions. That
 * means letting the AI crawlers reach the public surface. They are
 * listed explicitly rather than relying on the `*` group, because an
 * explicit user-agent group is unambiguous and because several of these
 * agents do two different jobs.
 *
 * Two of them are NOT crawl controls and it matters that this is
 * understood before anyone "tightens" them:
 *
 *   - Google-Extended does not crawl anything. Googlebot does the
 *     crawling. Google-Extended is purely an opt-out token for whether
 *     already-crawled content may be used to ground Gemini and AI
 *     Overviews. Disallowing it removes Paybacker from AI Overviews
 *     without improving privacy or reducing load one bit.
 *   - Applebot-Extended is the same idea for Apple Intelligence. Applebot
 *     does the crawling; Applebot-Extended only governs training and
 *     generative use.
 *
 * So the trade-off is real but one-directional: allowing them is how we
 * become eligible to be cited. The cost is that public marketing and
 * guide content may be used in model training. Nothing behind
 * /dashboard, /auth or /api is exposed either way, and no user data is
 * on the public surface at all.
 *
 * CCBot (Common Crawl) and Bytespider (ByteDance) are the two with the
 * least direct citation upside. They are allowed because Common Crawl is
 * an input to a large number of downstream answer engines, which is
 * exactly the distribution we are after at launch.
 */

// Agents that read the public web to answer or ground user questions.
const AI_SEARCH_AND_ANSWER_AGENTS = [
  'GPTBot',          // OpenAI crawler
  'OAI-SearchBot',   // OpenAI, powers ChatGPT search results
  'ChatGPT-User',    // OpenAI, live fetch when a user asks
  'ClaudeBot',       // Anthropic crawler
  'Claude-Web',      // Anthropic, live fetch
  'anthropic-ai',    // Anthropic, legacy token
  'Claude-SearchBot',// Anthropic, search indexing
  'PerplexityBot',   // Perplexity crawler
  'Perplexity-User', // Perplexity, live fetch when a user asks
  'Google-Extended', // Gemini / AI Overviews grounding opt-in (not a crawler)
  'Applebot-Extended', // Apple Intelligence opt-in (not a crawler)
  'CCBot',           // Common Crawl, upstream of many answer engines
  'Bytespider',      // ByteDance
  'Amazonbot',       // Amazon / Alexa
  'meta-externalagent', // Meta AI
  'cohere-ai',       // Cohere
  'Diffbot',
  'Timpibot',
  'YouBot',          // You.com
]

// Everything an unauthenticated crawler has no business fetching:
// authenticated app surfaces, API routes, transactional one-time pages,
// and internal previews. Kept in src/lib/site-routes.ts so the sitemap
// generator can assert it never lists one of these.
const DISALLOW = DISALLOWED_PREFIXES

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
      {
        // Googlebot gets the same list. /status is intentionally NOT
        // blocked any more: it is a public API status page with no
        // personal data, it is a trust signal for the B2B buyer, and
        // blocking it only made the page invisible without protecting
        // anything.
        userAgent: 'Googlebot',
        allow: '/',
        disallow: DISALLOW,
      },
      ...AI_SEARCH_AND_ANSWER_AGENTS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW,
      })),
    ],
    sitemap: 'https://paybacker.co.uk/sitemap.xml',
    host: 'https://paybacker.co.uk',
  }
}
