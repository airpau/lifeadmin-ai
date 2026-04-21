// src/app/api/mcp/tokens/route.ts
// Paybacker MCP — personal access token management for the logged-in user.
//
// GET    list my tokens (no hash, no plaintext — just metadata)
// POST   mint a new token (Pro users only; plaintext returned ONCE)
//
// Plaintext is never stored. Only sha256(plaintext) is kept.
//
// Route is additive. See DELETE in /api/mcp/tokens/[id]/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getUserPlan } from '@/lib/get-user-plan';
import { mintToken } from '@/lib/mcp-tokens';

export const runtime = 'nodejs';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Shape we send back to the browser. Never includes token_hash.
type TokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scope: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  use_count: number;
};

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await admin()
    .from('mcp_tokens')
    .select(
      'id, name, token_prefix, scope, created_at, expires_at, last_used_at, revoked_at, use_count',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[mcp/tokens] list failed:', error.message);
    return NextResponse.json({ error: 'Failed to load tokens' }, { status: 500 });
  }

  return NextResponse.json({ tokens: (data ?? []) as TokenRow[] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pro-only feature
  const plan = await getUserPlan(user.id);
  if (plan.tier !== 'pro' || !plan.isActive) {
    return NextResponse.json(
      { error: 'The Paybacker MCP is available on the Pro plan.' },
      { status: 403 },
    );
  }

  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body — we'll default the name
  }

  const name = (body.name ?? '').toString().trim().slice(0, 80) || 'Claude Desktop';

  // Soft cap — no user needs more than 10 live tokens
  const { count } = await admin()
    .from('mcp_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'You already have 10 active tokens. Revoke an old one first.' },
      { status: 429 },
    );
  }

  const { plaintext, tokenHash, tokenPrefix } = mintToken();

  const { data, error } = await admin()
    .from('mcp_tokens')
    .insert({
      user_id: user.id,
      name,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      scope: 'read',
    })
    .select(
      'id, name, token_prefix, scope, created_at, expires_at, last_used_at, revoked_at, use_count',
    )
    .single();

  if (error || !data) {
    console.error('[mcp/tokens] mint failed:', error?.message);
    return NextResponse.json({ error: 'Failed to mint token' }, { status: 500 });
  }

  // Best-effort audit trail — don't block on failure
  try {
    await admin().from('business_log').insert({
      category: 'progress',
      title: `MCP token generated: ${name}`,
      content: `User ${user.id} minted MCP token ${tokenPrefix}… (id ${data.id}).`,
      created_by: 'mcp',
    });
  } catch {}

  return NextResponse.json(
    {
      token: plaintext, // shown ONCE — client must copy now
      record: data as TokenRow,
    },
    { status: 201 },
  );
}
