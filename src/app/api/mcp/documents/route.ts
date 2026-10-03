// src/app/api/mcp/documents/route.ts
// MCP: search the user's documents vault (receipts, invoices, bills,
// statements, certificates, policies, contracts, letters).
// Read-only. Auth via Bearer pbk_ token, Pro gated in authenticateMcp.
// Query: type, from, to (YYYY-MM-DD on the document date), supplier,
// q (free text), limit (default 50, max 200), offset.

import { NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { authenticateMcp, isAuthSuccess, mcpJson } from '@/lib/mcp-auth';
import { filtersFromSearchParams, listDocuments } from '@/lib/documents/query';

export const runtime = 'nodejs';

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const filters = filtersFromSearchParams(req.nextUrl.searchParams);
  const { rows, total, error } = await listDocuments(admin(), auth.userId, filters);
  if (error) return mcpJson({ error: error }, { status: 500 });

  return mcpJson({
    count: rows.length,
    total,
    offset: filters.offset,
    documents: rows.map((d) => ({
      id: d.id,
      doc_type: d.doc_type,
      supplier: d.supplier,
      summary: d.summary,
      filename: d.filename,
      amount: d.amount,
      currency: d.currency,
      vat_amount: d.vat_amount,
      doc_date: d.doc_date,
      due_date: d.due_date,
      renewal_date: d.renewal_date,
      expiry_date: d.expiry_date,
      source: d.source,
      email_subject: d.email_subject,
      email_from: d.email_from,
      in_google_drive: !!d.drive_link,
      added_at: d.created_at,
    })),
    note: 'Use get_document with an id for a short-lived download link.',
  });
}
