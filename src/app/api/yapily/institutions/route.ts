import { NextResponse } from 'next/server';
import { getInstitutions, isSandboxInstitution } from '@/lib/yapily';

/**
 * In-memory cache for UK institution list.
 * Refreshes every 24 hours to avoid hammering the Yapily API.
 */
let cachedInstitutions:
  | { id: string; name: string; logoUrl: string | null; features: string[] }[]
  | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/yapily/institutions
 *
 * Returns a list of UK-supported banks from Yapily.
 * Cached in-memory for 24 hours with Cache-Control headers.
 */
export async function GET() {
  const now = Date.now();

  // Serve from in-memory cache if fresh
  if (cachedInstitutions && now - cacheTimestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      { institutions: cachedInstitutions },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      }
    );
  }

  try {
    const institutions = await getInstitutions();

    // Yapily's test institutions come back with GB in their countries
    // array, so the UK filter upstream does not remove them and the
    // picker was offering mock-sandbox and natwest-sandbox alongside the
    // real banks. Hide them in production only: locally and in preview
    // they are how the connection flow gets exercised without a real
    // bank login.
    //
    // Gating display, not connection. /api/auth/yapily still accepts a
    // sandbox institutionId, which is what keeps existing sandbox
    // connections (and manual QA against them) working.
    const selectable =
      process.env.NODE_ENV === 'production'
        ? institutions.filter((inst) => !isSandboxInstitution(inst))
        : institutions;

    // If that filter emptied the list, the application has no live UK
    // institutions at all. Serving the sandboxes anyway would not let a
    // real user connect a real bank, so surface it loudly instead of
    // quietly rendering an empty picker.
    if (
      process.env.NODE_ENV === 'production' &&
      selectable.length === 0 &&
      institutions.length > 0
    ) {
      console.error(
        `[yapily.institutions] all ${institutions.length} UK institutions are sandboxes — bank picker will be empty`,
      );
    }

    cachedInstitutions = selectable.map((inst) => {
      // Find the logo URL from the media array (prefer 'icon' type, fall back to first)
      const icon = inst.media?.find((m) => m.type === 'icon');
      const logoUrl = icon?.source || inst.media?.[0]?.source || null;

      return {
        id: inst.id,
        name: inst.fullName || inst.name,
        logoUrl,
        // Yapily build review step 10: the institution's advertised
        // capability list. Surfaced so the bank picker can tell the user
        // what a given bank supports BEFORE they consent, and so the
        // capability gating in the sync crons is visible in the product
        // rather than only in server logs.
        features: inst.features ?? [],
      };
    });

    // Sort alphabetically by name
    cachedInstitutions.sort((a, b) => a.name.localeCompare(b.name));

    cacheTimestamp = now;

    return NextResponse.json(
      { institutions: cachedInstitutions },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      }
    );
  } catch (err) {
    console.error('Failed to fetch Yapily institutions:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to fetch institutions',
      },
      { status: 500 }
    );
  }
}
