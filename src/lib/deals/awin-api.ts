// src/lib/deals/awin-api.ts
//
// A client for the Awin publisher API.
//
// Until 2026-08-21 nothing in this codebase called Awin at all. The
// token existed in the environment and was never consumed; every Awin
// touchpoint was a hand-built `awin1.com/cread.php?...` URL string.
//
// That mattered more than it sounds. Because cread.php happily 302s for
// ANY merchant id and sets a tracking cookie, a link to a programme we
// have never joined looks identical to a working one: the user lands on
// the advertiser, the URL carries an `awc` parameter, everything seems
// fine. It just cannot pay, because a sale only tracks for a programme
// where we are an approved publisher.
//
// The first call to this API found the deals page was advertising 30
// merchant ids, not one of which belonged to a programme we had joined,
// and several of which are not GB programmes on Awin at all (BT's real
// one is 3042, not 3041; O2's is 3242, not 3235; SMARTY, Plusnet,
// Hyperoptic, Tesco Mobile, iD Mobile, Compare the Market and
// MoneySuperMarket have no Awin programme visible to this account).
//
// So this module exists to make "are we actually partnered with them"
// a question the code can answer, rather than an assumption.

const AWIN_API_BASE = 'https://api.awin.com';

/** Our Awin publisher account id. */
export const AWIN_PUBLISHER_ID = 2825812;

export interface AwinProgramme {
  id: number;
  name: string;
  displayUrl?: string;
  logoUrl?: string;
  currencyCode?: string;
  status?: string;
  primarySector?: string;
  primaryRegion?: { name?: string; countryCode?: string };
  validDomains?: Array<{ domain: string }>;
}

function token(): string {
  const t = process.env.AWIN_API_TOKEN?.trim();
  if (!t) {
    throw new Error(
      'AWIN_API_TOKEN is not set. Without it we cannot tell which advertisers we are actually joined to, and an unverified catalogue is how we ended up advertising 30 merchants we had no relationship with.',
    );
  }
  return t;
}

async function awinGet<T>(path: string): Promise<T> {
  const res = await fetch(`${AWIN_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(
      `Awin API ${res.status} ${res.statusText} on ${path}${body ? `: ${body.slice(0, 200)}` : ''}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

/**
 * Programmes this publisher account has JOINED.
 *
 * This is the authority on which advertisers may appear in the
 * catalogue. Joining is an approval, not a checkbox: an advertiser can
 * decline, and a programme can later suspend us. Re-reading it on a
 * schedule is the only way to notice either.
 */
export async function getJoinedProgrammes(): Promise<AwinProgramme[]> {
  return awinGet<AwinProgramme[]>(
    `/publishers/${AWIN_PUBLISHER_ID}/programmes?relationship=joined`,
  );
}

/**
 * Programmes we could apply to.
 *
 * Large (20k+), so callers should filter. Used by the admin report that
 * tells the founder which advertisers are worth applying for, replacing
 * the previous approach of inventing a merchant id and hoping.
 */
export async function getAvailableProgrammes(): Promise<AwinProgramme[]> {
  return awinGet<AwinProgramme[]>(
    `/publishers/${AWIN_PUBLISHER_ID}/programmes?relationship=notjoined`,
  );
}

/**
 * Build a tracking link.
 *
 * Takes the whole programme rather than a bare id, because a caller
 * holding a programme object has necessarily got it from the joined
 * list. Passing a loose number is exactly how 30 unjoined merchant ids
 * ended up in the catalogue.
 */
export function buildTrackingUrl(
  programme: Pick<AwinProgramme, 'id'>,
  destinationUrl: string,
): string {
  return (
    `https://www.awin1.com/cread.php` +
    `?awinmid=${programme.id}` +
    `&awinaffid=${AWIN_PUBLISHER_ID}` +
    `&ued=${encodeURIComponent(destinationUrl)}`
  );
}

/**
 * Does the destination actually belong to this advertiser?
 *
 * Awin attributes on domain. A tracking link pointing somewhere outside
 * the programme's validDomains will not attribute, and is a sign the
 * catalogue row is wrong.
 */
export function destinationMatchesProgramme(
  programme: AwinProgramme,
  destinationUrl: string,
): boolean {
  const domains = (programme.validDomains ?? []).map((d) => d.domain.toLowerCase());
  if (domains.length === 0) return true; // nothing to check against
  let host: string;
  try {
    host = new URL(destinationUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => {
    if (d.startsWith('*.')) {
      const suffix = d.slice(1); // ".example.com"
      return host === d.slice(2) || host.endsWith(suffix);
    }
    return host === d;
  });
}
