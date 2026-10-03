// GET /api/documents: list and search the logged-in user's documents
// vault. Filters: type, from, to (YYYY-MM-DD on the document date),
// supplier, q (free text), limit, offset. Every plan.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { filtersFromSearchParams, listDocuments } from '@/lib/documents/query';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const filters = filtersFromSearchParams(req.nextUrl.searchParams);
  const { rows, total, error } = await listDocuments(documentsAdmin(), user.id, filters);
  if (error) {
    console.error('[documents] list failed:', error);
    return NextResponse.json({ error: 'Could not load your documents. Please try again.' }, { status: 500 });
  }
  return NextResponse.json(
    { documents: rows, total, limit: filters.limit, offset: filters.offset },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
