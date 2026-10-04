// GET /api/documents/packs/types: the pack types (name, what it is for,
// its checklist) and what the user's plan allows: checklist previews on
// every plan, builds (Free: 1 a month), sharing (Pro and above).

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getDocumentEntitlements, packBuildQuota } from '@/lib/documents/plan';
import { packTypeSummaries } from '@/lib/documents/packs/registry';
import { packAvailability } from '@/lib/documents/packs/rows';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const ent = await getDocumentEntitlements(user.id);
  const quota = await packBuildQuota(documentsAdmin(), user.id, ent);
  return NextResponse.json(
    { types: packTypeSummaries(), availability: packAvailability(ent, quota), tier: ent.tier },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
