import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSequenceEmail } from '@/lib/email/waitlist-sequence';

// Service role — no RLS, safe for server-only route
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const supabase = getAdmin();

    // Check for duplicate
    const { data: existing } = await supabase
      .from('waitlist_signups')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    // Insert into DB
    const { error: insertError } = await supabase
      .from('waitlist_signups')
      .insert({ email: email.toLowerCase(), full_name: name, emails_sent: ['welcome'] });

    if (insertError) throw insertError;

    // Send Day 0 welcome email (non-blocking)
    sendSequenceEmail(email, name, 'welcome').catch((err) =>
      console.error('Welcome email failed (non-fatal):', err)
    );

    // Get total count
    const { count } = await supabase
      .from('waitlist_signups')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({ success: true, message: 'Successfully joined waitlist', count }, { status: 201 });
  } catch (error: any) {
    console.error('Waitlist API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = getAdmin();
    const { count } = await supabase
      .from('waitlist_signups')
      .select('*', { count: 'exact', head: true });
    return NextResponse.json({ count: count ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
