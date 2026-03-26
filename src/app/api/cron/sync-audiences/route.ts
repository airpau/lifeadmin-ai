import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCustomAudience,
  listCustomAudiences,
  uploadToAudience,
} from '@/lib/meta-audiences';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Audience definitions: name -> query logic
const AUDIENCE_DEFS = [
  {
    name: 'Paybacker - All Leads',
    description: 'All social media leads captured from Facebook/Instagram engagement',
    source: 'leads' as const,
  },
  {
    name: 'Paybacker - All Users',
    description: 'All registered Paybacker users',
    source: 'users' as const,
  },
  {
    name: 'Paybacker - Free Users',
    description: 'Registered users on the free plan (upgrade targets)',
    source: 'free_users' as const,
  },
  {
    name: 'Paybacker - Paid Users',
    description: 'Essential and Pro subscribers',
    source: 'paid_users' as const,
  },
];

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.META_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 503 });
  }

  const admin = getAdmin();
  const results: Record<string, any> = {};

  // Get existing audiences
  const existing = await listCustomAudiences();
  const existingMap = new Map(existing.map(a => [a.name, a.id]));

  for (const def of AUDIENCE_DEFS) {
    let audienceId = existingMap.get(def.name);

    // Create audience if it doesn't exist
    if (!audienceId) {
      const created = await createCustomAudience(def.name, def.description);
      if (created) {
        audienceId = created.id;
      } else {
        results[def.name] = { error: 'Failed to create audience' };
        continue;
      }
    }

    // Fetch users for this segment
    let users: { email?: string; phone?: string; firstName?: string; lastName?: string }[] = [];

    if (def.source === 'leads') {
      const { data } = await admin
        .from('leads')
        .select('name, email')
        .not('email', 'is', null);

      users = (data || []).map(l => {
        const parts = (l.name || '').split(' ');
        return {
          email: l.email || undefined,
          firstName: parts[0] || undefined,
          lastName: parts.slice(1).join(' ') || undefined,
        };
      });
    } else if (def.source === 'users') {
      const { data } = await admin
        .from('profiles')
        .select('email, first_name, last_name, phone')
        .not('email', 'is', null);

      users = (data || []).map(p => ({
        email: p.email || undefined,
        phone: p.phone || undefined,
        firstName: p.first_name || undefined,
        lastName: p.last_name || undefined,
      }));
    } else if (def.source === 'free_users') {
      const { data } = await admin
        .from('profiles')
        .select('email, first_name, last_name, phone')
        .not('email', 'is', null)
        .or('subscription_tier.is.null,subscription_tier.eq.free');

      users = (data || []).map(p => ({
        email: p.email || undefined,
        phone: p.phone || undefined,
        firstName: p.first_name || undefined,
        lastName: p.last_name || undefined,
      }));
    } else if (def.source === 'paid_users') {
      const { data } = await admin
        .from('profiles')
        .select('email, first_name, last_name, phone')
        .not('email', 'is', null)
        .in('subscription_tier', ['essential', 'pro']);

      users = (data || []).map(p => ({
        email: p.email || undefined,
        phone: p.phone || undefined,
        firstName: p.first_name || undefined,
        lastName: p.last_name || undefined,
      }));
    }

    // Filter out users without email
    users = users.filter(u => u.email);

    if (users.length === 0) {
      results[def.name] = { audience_id: audienceId, uploaded: 0, reason: 'No users with email' };
      continue;
    }

    // Upload in batches of 500
    let totalReceived = 0;
    let totalInvalid = 0;

    for (let i = 0; i < users.length; i += 500) {
      const batch = users.slice(i, i + 500);
      const result = await uploadToAudience(audienceId, batch);
      if (result) {
        totalReceived += result.num_received;
        totalInvalid += result.num_invalid;
      }
    }

    results[def.name] = {
      audience_id: audienceId,
      uploaded: totalReceived,
      invalid: totalInvalid,
      total_users: users.length,
    };
  }

  return NextResponse.json({ success: true, audiences: results });
}
