import { NextResponse } from 'next/server';
import { getInstitutions } from '@/lib/yapily';

/**
 * In-memory cache for UK institution list.
 * Refreshes every 24 hours to avoid hammering the Yapily API.
 */
let cachedInstitutions: { id: string; name: string; logoUrl: string | null }[] | null = null;
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

    cachedInstitutions = institutions.map((inst) => {
      // Find the logo URL from the media array (prefer 'icon' type, fall back to first)
      const icon = inst.media?.find((m) => m.type === 'icon');
      const logoUrl = icon?.source || inst.media?.[0]?.source || null;

      return {
        id: inst.id,
        name: inst.fullName || inst.name,
        logoUrl,
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
