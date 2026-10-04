/**
 * Supplier names, normalised and fuzzily matched. Pure.
 *
 * Used by the dispute evidence bundle (which vault documents belong to
 * this dispute's company) and by the price-rise watch (which bills are
 * from the same supplier). Classifier output varies ("British Gas",
 * "British Gas Services Ltd", "britishgas.co.uk"), so names are reduced
 * to their distinctive words first and then compared three ways:
 *
 *  1. identical after normalising, or identical with spaces removed
 *     ("Talk Talk" and "TalkTalk")
 *  2. every word of the shorter name appears in the longer one, and they
 *     start with the same word or the shorter has two or more words
 *     ("British Gas" and "British Gas Services")
 *  3. character bigram similarity (Dice) of at least 0.75, for small
 *     spelling differences ("Octopus Energy" and "Octopus Energey")
 *
 * The user can always add or remove documents by hand, so this leans
 * towards finding the obvious matches rather than every possible one.
 */

const STOP_WORDS = new Set([
  'ltd', 'limited', 'plc', 'llp', 'inc', 'llc', 'group', 'holdings', 'the', 'uk', 'gb',
  'services', 'service', 'company', 'co', 'and', 'www', 'com', 'net', 'org', 'customer',
  'customers', 'team', 'billing', 'bills', 'noreply', 'no', 'reply', 'mail', 'email', 'info',
]);

export const SUPPLIER_MATCH_THRESHOLD = 0.75;

/** Lower case, no accents, no punctuation, no legal suffixes or filler words. */
export function normaliseSupplierName(raw: string | null | undefined): string {
  if (!raw) return '';
  const words = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/\.(co\.uk|com|net|org|uk|io)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w));
  return words.join(' ');
}

function compact(s: string): string {
  return s.replace(/\s+/g, '');
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Dice coefficient over character bigrams, 0 to 1. */
export function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const n of A.values()) sizeA += n;
  for (const n of B.values()) sizeB += n;
  for (const [g, n] of A) overlap += Math.min(n, B.get(g) ?? 0);
  return (2 * overlap) / (sizeA + sizeB);
}

/** 0 to 1: how sure we are that two supplier names are the same company. */
export function supplierMatchScore(a: string | null | undefined, b: string | null | undefined): number {
  const na = normaliseSupplierName(a);
  const nb = normaliseSupplierName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ca = compact(na);
  const cb = compact(nb);
  if (ca === cb) return 0.95;

  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [shortT, longT] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(longT);
  if (shortT.every((t) => longSet.has(t)) && (shortT[0] === longT[0] || shortT.length >= 2)) return 0.9;

  // One name written as a single word inside the other ("britishgas" in a domain).
  if (Math.min(ca.length, cb.length) >= 5 && (ca.startsWith(cb) || cb.startsWith(ca))) return 0.85;

  return diceSimilarity(ca, cb);
}

export function supplierMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  return supplierMatchScore(a, b) >= SUPPLIER_MATCH_THRESHOLD;
}

/** The company part of a sender address: "bills@britishgas.co.uk" gives "britishgas". */
export function senderDomainName(emailFrom: string | null | undefined): string | null {
  if (!emailFrom) return null;
  const m = /@([a-z0-9.-]+)/i.exec(emailFrom);
  if (!m) return null;
  const parts = m[1].toLowerCase().split('.').filter(Boolean);
  const generic = new Set(['co', 'uk', 'com', 'net', 'org', 'io', 'mail', 'email', 'e', 'em', 'info', 'news', 'notifications', 'gov']);
  const meaningful = parts.filter((p) => !generic.has(p));
  // The registrable name is usually the last meaningful label (mail.britishgas.co.uk).
  const name = meaningful[meaningful.length - 1];
  return name && name.length >= 2 ? name : null;
}

/**
 * Does a document belong to any of the target supplier names? Checks the
 * classified supplier and the sender's domain.
 */
export function documentMatchesSupplier(
  doc: { supplier: string | null; email_from?: string | null },
  targets: Array<string | null | undefined>,
): boolean {
  const own = [doc.supplier, senderDomainName(doc.email_from ?? null)].filter((x): x is string => !!x);
  for (const t of targets) {
    if (!t) continue;
    for (const o of own) if (supplierMatches(o, t)) return true;
  }
  return false;
}
