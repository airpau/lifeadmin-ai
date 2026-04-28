/**
 * Multi-seat membership management.
 *
 * GET  ?token=&email=     — list members of the email's owner account
 * POST { action: 'invite' | 'remove' | 'role', token, email, member_email, role? }
 *
 * Inviter must be an admin of the owner account. The owner's own email
 * is always treated as admin (implicit row).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { resend } from '@/lib/resend';
import { audit, extractClientMeta } from '@/lib/b2b/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyToken(supabase: any, token: string, email: string, burn: boolean): Promise<boolean> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await supabase.from('b2b_portal_tokens').select('id, expires_at, used_at').eq('token_hash', tokenHash).eq('email', email).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return false;
  if (burn) await supabase.from('b2b_portal_tokens').update({ used_at: new Date().toISOString() }).eq('id', data.id);
  return true;
}

/**
 * Resolve which "owner email" account the signed-in `email` should
 * see — themselves if they own keys, otherwise their first owner
 * relationship via b2b_members. Returns owner_email + role.
 */
export async function resolveOwner(supabase: any, email: string): Promise<{ owner: string; role: 'admin' | 'viewer' }> {
  // Direct ownership: the email has at least one (active or revoked) key on it.
  const { data: ownerKey } = await supabase.from('b2b_api_keys').select('id').eq('owner_email', email).limit(1).maybeSingle();
  if (ownerKey) return { owner: email, role: 'admin' };

  // Member relationship.
  const { data: m } = await supabase
    .from('b2b_members')
    .select('owner_email, role')
    .eq('member_email', email)
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (m) return { owner: m.owner_email, role: (m.role as 'admin' | 'viewer') };

  // Fallback: treat them as their own owner (no keys yet — would happen
  // on first sign-in if a member's invite hasn't been accepted yet).
  return { owner: email, role: 'admin' };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const email = (url.searchParams.get('email') ?? '').toLowerCase();
  if (!token || !email) return NextResponse.json({ error: 'token + email required' }, { status: 400 });

  const supabase = getAdmin();
  if (!(await verifyToken(supabase, token, email, false))) return NextResponse.json({ error: 'Link expired.' }, { status: 401 });

  const { owner, role } = await resolveOwner(supabase, email);
  const { data: members } = await supabase
    .from('b2b_members')
    .select('id, member_email, role, invited_at, accepted_at, invited_by')
    .eq('owner_email', owner)
    .order('invited_at', { ascending: false });

  return NextResponse.json({ owner, your_role: role, members: members ?? [] });
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const token = String(body?.token || '');
  const email = String(body?.email || '').toLowerCase();
  const action = String(body?.action || '');
  const memberEmail = String(body?.member_email || '').toLowerCase();
  const role: 'admin' | 'viewer' = body?.role === 'admin' ? 'admin' : 'viewer';
  if (!token || !email) return NextResponse.json({ error: 'token + email required' }, { status: 400 });

  const supabase = getAdmin();
  if (!(await verifyToken(supabase, token, email, true))) return NextResponse.json({ error: 'Link expired.' }, { status: 401 });

  const { owner, role: yourRole } = await resolveOwner(supabase, email);
  if (yourRole !== 'admin') return NextResponse.json({ error: 'Only admins can manage team members.' }, { status: 403 });

  const meta = extractClientMeta(request);

  if (action === 'invite') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail)) return NextResponse.json({ error: 'Invalid member_email' }, { status: 400 });
    const { error } = await supabase.from('b2b_members').upsert({
      owner_email: owner, member_email: memberEmail, role, invited_by: email,
    }, { onConflict: 'owner_email,member_email' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    audit({ email, action: 'plan_changed', ...meta, metadata: { op: 'member_invited', member: memberEmail, role } });

    if (process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>',
          to: memberEmail,
          replyTo: email,
          subject: `${email} invited you to the Paybacker API portal`,
          html: `<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f172a;">
            <p><strong>${email}</strong> has invited you to view the Paybacker UK Consumer Rights API portal as a <strong>${role}</strong>.</p>
            <p>Sign in with your work email at the link below — we'll email you a one-time portal access link.</p>
            <p style="margin:20px 0;"><a href="https://paybacker.co.uk/dashboard/api-keys" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Sign in to portal</a></p>
            <p style="color:#64748b;font-size:13px;">If you weren't expecting this, you can ignore the email — no action is required.</p>
          </div>`,
        });
      } catch {}
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'remove') {
    if (memberEmail === owner) return NextResponse.json({ error: 'Cannot remove the owner.' }, { status: 400 });
    await supabase.from('b2b_members').delete().eq('owner_email', owner).eq('member_email', memberEmail);
    audit({ email, action: 'plan_changed', ...meta, metadata: { op: 'member_removed', member: memberEmail } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'role') {
    await supabase.from('b2b_members').update({ role }).eq('owner_email', owner).eq('member_email', memberEmail);
    audit({ email, action: 'plan_changed', ...meta, metadata: { op: 'member_role_changed', member: memberEmail, role } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
