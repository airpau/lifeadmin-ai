/**
 * Unverifiable-claims guard for outbound social copy.
 *
 * On 21 August 2026 Meta restricted link sharing on paybacker.co.uk under the
 * Community Standards on Fraud, Scams and Deceptive Practices. The single
 * largest contributor was a back catalogue of Instagram and Facebook posts
 * carrying invented performance statistics ("£438,000 clawed back in the last
 * 30 days", "87% get a response, 79% end in a refund"), fabricated named
 * testimonials (Priya, Liam, Hannah, "Paul R., Bristol") and a claim that
 * Paybacker is FCA-backed, which it is not. Yapily is.
 *
 * The system prompt already forbids all of this. It forbade most of it while
 * those posts were going out, because the same prompt also hard-coded a hero
 * line containing a specific recovery figure, and the hero line won. A prompt
 * rule that contradicts itself is not a control. This is the control: it runs
 * after generation and before any Graph API call, so a rejected caption costs
 * one model call and nothing else.
 *
 * The rule this encodes: Paybacker may describe what the product does, and may
 * cite statutory entitlements that exist in law. It may not claim a result it
 * cannot evidence, and it may not imply a regulatory authorisation it does not
 * hold.
 */

export type ClaimViolation = {
  /** Which rule fired. */
  kind:
    | 'success_rate'
    | 'aggregate_recovery'
    | 'average_user_outcome'
    | 'user_base_statistic'
    | 'testimonial'
    | 'regulatory_claim'
    | 'competitor_comparison';
  /** The offending text, trimmed for the alert. */
  match: string;
};

/**
 * Statutory maxima and regulator-published rates are facts about UK law, not
 * claims about Paybacker's results, so copy is allowed to state them. "up to
 * £520 per passenger under UK261" is true whether or not anyone has ever used
 * the product. These patterns whitelist the surrounding phrasing so the
 * money-figure rules below do not reject a legally accurate post.
 */
const STATUTORY_CONTEXT =
  /\b(?:UK ?261|EU ?261|Section 75|s\.?\s?75|Consumer Rights Act|Consumer Credit Act|Ofcom|Ofgem|CMA|VOA|FCA)\b/i;

const RULES: { kind: ClaimViolation['kind']; pattern: RegExp; statutoryExempt?: boolean }[] = [
  // "87% of letters get a response", "79% end in a refund", "four in ten get a reset"
  {
    kind: 'success_rate',
    pattern:
      /\b\d{1,3}\s?%\s+(?:of\s+\w+\s+)?(?:letters|disputes|complaints|claims|users|cases|customers|end|get|result|are\s+upheld|succeed)/gi,
  },
  {
    kind: 'success_rate',
    pattern: /\b(?:success rate|win rate|[a-z]+ in ten\s+(?:get|end|see|receive))/gi,
  },
  // "£438,000. That's what Paybacker users clawed back", "£8,835 back. One
  // user.", "Users are clawing back £80-£300 per energy dispute".
  //
  // The recovery verb and the figure often sit in different sentences, so the
  // window spans full stops. It stops at a newline, which is what actually
  // separates one claim from the next in a caption.
  {
    kind: 'aggregate_recovery',
    pattern:
      /(?:claw(?:ed|ing)? back|recovered|reclaimed|won back|got back|clawback)\b[^\n]{0,60}£[\d,]+|£[\d,]+[^\n]{0,60}\b(?:claw(?:ed|ing)? back|recovered|reclaimed|back from providers)/gi,
  },
  // A bare money figure presented as a result: "£847 refund", "£162 in
  // overcharges", "£610 refunded in ten days".
  {
    kind: 'aggregate_recovery',
    pattern:
      /£[\d,]+\s*(?:refund(?:ed)?|back|recovered|reclaimed|in overcharges|in savings|waived|credited)\b|(?:found|spotted|identified)\s+£[\d,]+/gi,
    statutoryExempt: true,
  },
  // "for one user", "for a single user" — a result attributed to a real person.
  {
    kind: 'average_user_outcome',
    pattern: /\bfor (?:one|a single|our first|this) (?:user|customer|member|household)\b/gi,
  },
  // "Average first-month reclaim: £164", "Average annual saving ... £168",
  // "Average response: 14 days", "Most users have made that back"
  {
    kind: 'average_user_outcome',
    pattern:
      /\b(?:average|typical|median|mean)\b[^.\n]{0,50}(?:reclaim|recovery|saving|refund|response|payout|per (?:user|dispute|household|member))/gi,
    statutoryExempt: true,
  },
  {
    kind: 'average_user_outcome',
    pattern: /\bmost (?:users|customers|people who|members)\b[^.\n]{0,60}(?:made|make|recover|save|get)\b/gi,
  },
  // "The median Paybacker user had 11", "the worst we've seen was 41",
  // "patterns we find in almost every account we scan"
  {
    kind: 'user_base_statistic',
    pattern:
      /\b(?:median|average|typical)\s+Paybacker\s+user|\bthe worst (?:we(?:'ve| have) seen|offender|had)\b|\bin almost every account we scan\b|\bour users\b[^.\n]{0,40}£/gi,
  },
  // Named case studies and pull-quotes presented as real customers.
  {
    kind: 'testimonial',
    pattern: /^[ \t]*[A-Z][a-z]+(?:'s)?\s+(?:contract|flight|energy|bill|direct debit|broadband|mortgage|subscription)\b/gm,
  },
  {
    kind: 'testimonial',
    pattern: /["“][^"”\n]{15,}["”]\s*[—-]\s*[A-Z][a-z]+/g,
  },
  // Paybacker is not FCA-authorised. Yapily is, and Open Banking as a system
  // is FCA-regulated. Copy may say either of those. What it may not do is
  // predicate the authorisation of Paybacker itself, or wear it as a bare
  // badge with no subject, which is how a reader infers it applies to us.
  //
  // Deliberately narrow: it requires a copula binding the regulator term to
  // us. "Paybacker connects through Open Banking, the FCA-regulated system"
  // is accurate copy and must pass.
  {
    kind: 'regulatory_claim',
    pattern:
      /#FCARegulated\b|\bFCA[- ]backed\b|\b(?:Paybacker|we|our (?:service|platform|app))\s+(?:is|are|'re|are now)\s+(?:an?\s+)?FCA[- ](?:regulated|authorised|authorized|approved)\b/gi,
  },
  // The prompt has forbidden this since July; it kept happening.
  {
    kind: 'competitor_comparison',
    pattern: /\b(?:a )?solicitors?\b[^.\n]{0,40}(?:charges?|costs?|£\d)|\bclaims (?:management )?(?:firm|company)\b[^.\n]{0,30}(?:charge|take|cut)/gi,
  },
];

/**
 * Scan a generated caption for claims Paybacker cannot evidence.
 *
 * Returns every distinct violation found, or an empty array when the copy is
 * publishable. The caller should regenerate once and then skip the post rather
 * than publish, the same escalation the brand-spelling guard uses.
 */
export function findUnverifiableClaims(caption: string): ClaimViolation[] {
  const found: ClaimViolation[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    for (const m of caption.matchAll(rule.pattern)) {
      const match = m[0].trim();

      // A statutory entitlement is a fact about the law, not a claimed result.
      if (rule.statutoryExempt) {
        const from = Math.max(0, (m.index ?? 0) - 90);
        const window = caption.slice(from, (m.index ?? 0) + match.length + 90);
        if (STATUTORY_CONTEXT.test(window)) continue;
      }

      const key = `${rule.kind}:${match.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ kind: rule.kind, match: match.length > 120 ? `${match.slice(0, 117)}...` : match });
    }
  }

  return found;
}

/** One-line summary for logs and the founder Telegram alert. */
export function describeClaims(violations: ClaimViolation[]): string {
  return violations.map((v) => `${v.kind}: "${v.match}"`).join(' | ');
}
