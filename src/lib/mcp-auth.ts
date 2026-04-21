// src/lib/mcp-auth.ts
// Bearer-token auth for the Paybacker MCP HTTP layer.
//
// Every /api/mcp/* endpoint (except the token-management ones, which use the
// browser session) calls `authenticateMcp(req)` first. It:
//   1. Pulls the Bearer token from Authorization or ?token=…
//   2. Hashes it (SHA-256) and looks up a non-revoked, non-expired row
//   3. Verifies the owning user still has an active Pro plan
//   4. Bumps last_used_at / use_count on the token (best-effort)
//   5. Returns { userId, tokenId } or a NextResponse error
//
// Rate limiting is deliberately simple for v1: 10 active tokens per user +
// Pro gate + revocable. We can layer a token-bucket on top later.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getUserPlan } from '@/lib/get-user-plan';
import { hashToken, looksLikeToken } from '@/lib/mcp-tokens';

export interface McpAuthSuccess {
  authenticated: true;
  userId: string;
  tokenId: string;
}

export function isAuthSuccess(
  r: McpAuthSuccess | NextResponse,
): r is McpAuthSuccess {
  return (r as McpAuthSuccess).authenticated === true;
}

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (auth) {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  // Fallback — query param lets curl users test without headers
  const q = req.nextUrl.searchParams.get('token');
  if (q) return q.trim();
  return null;
}

/**
 * Guard helper for MCP data endpoints. Returns either the authenticated
 * user context or a ready-to-return NextResponse with a 401/403/404.
 */
export async function authenticateMcp(
  req: NextRequest,
): Promise<McpAuthSuccess | NextResponse> {
  const plaintext = extractToken(req);
  if (!plaintext || !looksLikeToken(plaintext)) {
    return NextResponse.json(
      { error: 'Missing or malformed MCP token. Pass a Bearer token.' },
      { status: 401 },
    );
  }

  const tokenHash = hashToken(plaintext);
  const a = admin();
  const { data: row, error } = await a
    .from('mcp_tokens')
    .select('id, user_id, expires_at, revoked_at, scope')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error('[mcp-auth] lookup failed:', error.message);
    return NextResponse.json({ error: 'Auth lookup failed' }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  if (row.revoked_at) {
    return NextResponse.json({ error: 'Token revoked' }, { status: 401 });
  }
  if (new Date(row.expires_at) <= new Date()) {
    return NextResponse.json(
      { error: 'Token expired. Generate a new one at /dashboard/settings/mcp.' },
      { status: 401 },
    );
  }

  // Pro gate — re-checked on every call, so downgrades cut off access immediately
  const plan = await getUserPlan(row.user_id);
  if (plan.tier !== 'pro' || !plan.isActive) {
    return NextResponse.json(
      { error: 'MCP access requires an active Pro plan.' },
      { status: 403 },
    );
  }

  // Best-effort usage bump. Read-modify-write is fine here — this counter is
  // audit-only, not billing, so racing two requests to the same token and
  // dropping a count is acceptable. Fire-and-forget to keep the hot path fast.
  (async () => {
    try {
      const { data: cur } = await a
        .from('mcp_tokens')
        .select('use_count')
        .eq('id', row.id)
        .maybeSingle();
      await a
        .from('mcp_tokens')
        .update({
          last_used_at: new Date().toISOString(),
          use_count: (cur?.use_count ?? 0) + 1,
        })
        .eq('id', row.id);
    } catch {
      /* non-fatal */
    }
  })();

  return { authenticated: true, userId: row.user_id, tokenId: row.id };
}

/**
 * Tiny helper used by every MCP data route — keeps the CORS/JSON boilerplate
 * in one place so the routes stay easy to scan.
 */
export function mcpJson(body: unknown, init?: ResponseInit) {
  return new NextResponse(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      ...(init?.headers ?? {}),
    },
  });
}
