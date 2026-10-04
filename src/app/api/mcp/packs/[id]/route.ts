// src/app/api/mcp/packs/[id]/route.ts
// MCP: one document pack with its checklist, the documents in it and,
// when it is built, a 10 minute signed download URL for the ZIP.
// Read-only: it never builds, changes or shares a pack. Auth via Bearer
// pbk_ token, Pro gated in authenticateMcp.

import { NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { authenticateMcp, isAuthSuccess, mcpJson } from '@/lib/mcp-auth';
import { getOwnedPack, publicPack } from '@/lib/documents/packs/rows';
import { getPackDefinition } from '@/lib/documents/packs/registry';
import { signedDocumentUrl } from '@/lib/documents/store';
import { packZipName } from '@/lib/documents/packs/build';

export const runtime = 'nodejs';

const URL_TTL_SECONDS = 600;

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;
  const { id } = await params;

  const a = admin();
  const row = await getOwnedPack(a, auth.userId, id);
  if (!row) return mcpJson({ error: 'Pack not found' }, { status: 404 });
  const p = publicPack(row);

  const ids = (row.document_ids ?? []).slice(0, 300);
  const { data: docs } = ids.length
    ? await a
        .from('documents')
        .select('id, doc_type, supplier, amount, currency, doc_date, summary, filename')
        .eq('user_id', auth.userId)
        .eq('status', 'active')
        .in('id', ids)
    : { data: [] };

  const url = p.downloadable && row.storage_path
    ? await signedDocumentUrl(a, row.storage_path, { expiresIn: URL_TTL_SECONDS, downloadName: packZipName(row.title) })
    : null;

  return mcpJson({
    pack: {
      id: p.id,
      type: p.pack_type,
      type_name: getPackDefinition(p.pack_type)?.name ?? null,
      title: p.title,
      status: p.status,
      built_at: p.generated_at,
      file_count: p.file_count,
      size_bytes: p.size_bytes,
      checklist: p.checklist,
      missing: p.missing,
      error: p.error,
    },
    documents: docs ?? [],
    download_url: url,
    download_url_expires_in_seconds: url ? URL_TTL_SECONDS : null,
    note: url ? null : 'This pack has not been built yet. The user can build it on the Documents page in Paybacker.',
  });
}
