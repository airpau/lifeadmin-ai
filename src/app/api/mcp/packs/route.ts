// src/app/api/mcp/packs/route.ts
// MCP: list the user's document packs (dispute evidence bundles,
// mortgage packs, tax year packs, insurance claim packs) with their
// checklist status. Read-only. Auth via Bearer pbk_ token, Pro gated in
// authenticateMcp. Query: type (pack type), limit (default 20, max 50).

import { NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { authenticateMcp, isAuthSuccess, mcpJson } from '@/lib/mcp-auth';
import { PACK_COLUMNS, publicPack, type PackRow } from '@/lib/documents/packs/rows';
import { isPackType } from '@/lib/documents/packs/types';
import { getPackDefinition } from '@/lib/documents/packs/registry';

export const runtime = 'nodejs';

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const type = sp.get('type');
  const limitRaw = Number(sp.get('limit') || 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 20;

  let q = admin().from('document_packs').select(PACK_COLUMNS).eq('user_id', auth.userId).is('deleted_at', null);
  if (isPackType(type)) q = q.eq('pack_type', type);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) return mcpJson({ error: 'Could not load packs' }, { status: 500 });

  return mcpJson({
    count: (data ?? []).length,
    packs: ((data as PackRow[] | null) ?? []).map((row) => {
      const p = publicPack(row);
      const missing = Array.isArray(p.missing) ? (p.missing as Array<{ label?: string; required?: boolean }>) : [];
      return {
        id: p.id,
        type: p.pack_type,
        type_name: getPackDefinition(p.pack_type)?.name ?? null,
        title: p.title,
        status: p.status,
        document_count: p.document_count,
        missing_required: missing.filter((m) => m.required).map((m) => m.label),
        missing_optional: missing.filter((m) => !m.required).map((m) => m.label),
        built_at: p.generated_at,
        downloadable: p.downloadable,
        size_bytes: p.size_bytes,
        created_at: p.created_at,
      };
    }),
    note: 'Use get_pack with an id for the full checklist and a short-lived download link.',
  });
}
