// GET /api/documents/register: CSV register of the user's documents for
// their accountant. Pro and above (PlanLimits.accountantRegister).
// Columns: Date, Type, Supplier, Description, Amount, VAT, Due or expiry,
// File link. Optional filters: type, from, to (YYYY-MM-DD).
//
// File links: the Drive copy when the document was filed to Drive (it
// never expires); otherwise a Paybacker link that needs the user to be
// logged in. Short-lived storage URLs are deliberately NOT written into
// a file that will be kept and forwarded.

import { NextRequest, NextResponse } from 'next/server';
import { appBaseUrl, documentsAdmin, isResponse, requireUser, upgradeRequired } from '@/lib/documents/route-helpers';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { filtersFromSearchParams, listDocuments } from '@/lib/documents/query';
import { buildRegisterCsv } from '@/lib/documents/register';
import type { DocumentRow } from '@/lib/documents/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const ent = await getDocumentEntitlements(user.id);
  if (!ent.accountantRegister) return upgradeRequired(UPGRADE_COPY.register, 'pro');

  const admin = documentsAdmin();
  const base = filtersFromSearchParams(req.nextUrl.searchParams);
  const rows: DocumentRow[] = [];
  // Page through everything (the list helper caps a page at 200).
  for (let offset = 0; offset < 5000; offset += 200) {
    const page = await listDocuments(admin, user.id, { ...base, q: null, supplier: null, limit: 200, offset });
    if (page.error) return NextResponse.json({ error: 'Could not build the register. Please try again.' }, { status: 500 });
    rows.push(...page.rows);
    if (page.rows.length < 200) break;
  }

  const app = appBaseUrl();
  const csv = buildRegisterCsv(rows, (d) => d.drive_link || `${app}/dashboard/documents?doc=${d.id}`);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="paybacker-documents-register-${today}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
