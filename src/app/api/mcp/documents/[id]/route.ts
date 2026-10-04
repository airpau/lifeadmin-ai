// src/app/api/mcp/documents/[id]/route.ts
// MCP: one document's details plus a short-lived (10 minute) signed
// download URL. Read-only. Auth via Bearer pbk_ token, Pro gated.

import { NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { authenticateMcp, isAuthSuccess, mcpJson } from '@/lib/mcp-auth';
import { getOwnedDocument } from '@/lib/documents/query';
import { signedDocumentUrl } from '@/lib/documents/store';

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
  const doc = await getOwnedDocument(a, auth.userId, id);
  if (!doc) return mcpJson({ error: 'Document not found' }, { status: 404 });

  const url = doc.storage_path
    ? await signedDocumentUrl(a, doc.storage_path, { expiresIn: URL_TTL_SECONDS, downloadName: doc.filename })
    : null;

  // storage_path is internal; never returned.
  const { storage_path: _omit, ...rest } = doc;
  void _omit;
  return mcpJson({
    document: rest,
    download_url: url,
    download_url_expires_in_seconds: url ? URL_TTL_SECONDS : null,
  });
}
