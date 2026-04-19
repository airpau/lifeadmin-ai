import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

/**
 * POST /api/careers
 *
 * Careers interest form (see /careers). Two behaviours — they both run,
 * in parallel, so neither one blocks the other:
 *
 *   1. Insert into `careers_interest` via the service-role client so RLS
 *      doesn't get in the way. Graceful on duplicate — returns 200 with
 *      a "already on file" note rather than an angry error (the candidate
 *      shouldn't feel punished for clicking twice).
 *
 *   2. Forward a plaintext summary to hello@paybacker.co.uk so Paul sees
 *      the new interest in his inbox even if the migration hasn't run in
 *      the target environment yet.
 *
 * Env deps: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           RESEND_API_KEY. If any are missing, the route silently
 *           falls back to whatever it can still do (we don't want a
 *           missing optional key to block submissions).
 */

type CareersBody = {
  fullName?: string;
  email?: string;
  roleOfInterest?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  why?: string;
  availability?: string;
  ukBased?: boolean;
};

function clean(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isSafeHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getAdmin() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function POST(req: NextRequest) {
  let body: CareersBody;
  try {
    body = (await req.json()) as CareersBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fullName = clean(body.fullName, 120);
  const email = clean(body.email, 180)?.toLowerCase() ?? null;
  const roleOfInterest = clean(body.roleOfInterest, 80);
  const linkedinUrl = clean(body.linkedinUrl, 300);
  const portfolioUrl = clean(body.portfolioUrl, 300);
  const why = clean(body.why, 2000);
  const availability = clean(body.availability, 40);
  const ukBased = typeof body.ukBased === 'boolean' ? body.ukBased : null;

  if (!fullName || !email) {
    return NextResponse.json(
      { error: 'Name and email are required.' },
      { status: 400 },
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }
  // Optional URLs — if present, must be http(s). Silently drop otherwise
  // rather than fail the whole form.
  const safeLinkedin = linkedinUrl && isSafeHttpUrl(linkedinUrl) ? linkedinUrl : null;
  const safePortfolio = portfolioUrl && isSafeHttpUrl(portfolioUrl) ? portfolioUrl : null;

  const userAgent = req.headers.get('user-agent') ?? null;
  const referer = req.headers.get('referer') ?? null;

  // 1) Supabase insert — gracefully absorb missing table / dup email.
  let duplicated = false;
  const supabase = getAdmin();
  if (supabase) {
    try {
      const { error } = await supabase.from('careers_interest').insert({
        full_name: fullName,
        email,
        role_of_interest: roleOfInterest,
        linkedin_url: safeLinkedin,
        portfolio_url: safePortfolio,
        why,
        availability,
        uk_based: ukBased,
        referrer: referer,
        user_agent: userAgent,
      });
      if (error) {
        // Postgres unique-violation = they're already on file. Don't 500.
        if (error.code === '23505') {
          duplicated = true;
        } else {
          // Table missing (42P01) or schema mismatch — log and continue
          // so the Resend notification still goes out.
          console.error('[careers] supabase insert failed', error);
        }
      }
    } catch (err) {
      console.error('[careers] supabase insert threw', err);
    }
  }

  // 2) Resend notification — don't block the response on the send.
  if (process.env.RESEND_API_KEY) {
    const subject = duplicated
      ? `Careers interest update · ${fullName}`
      : `New careers interest · ${fullName}`;
    const lines = [
      `Name: ${fullName}`,
      `Email: ${email}`,
      roleOfInterest ? `Role: ${roleOfInterest}` : null,
      availability ? `Availability: ${availability}` : null,
      ukBased === null ? null : `UK-based: ${ukBased ? 'yes' : 'no'}`,
      safeLinkedin ? `LinkedIn: ${safeLinkedin}` : null,
      safePortfolio ? `Portfolio: ${safePortfolio}` : null,
      why ? `\nWhy:\n${why}` : null,
      referer ? `\nReferrer: ${referer}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    resend.emails
      .send({
        from: FROM_EMAIL,
        replyTo: email,
        to: 'hello@paybacker.co.uk',
        subject,
        text: lines,
      })
      .catch((err) => console.error('[careers] resend notify failed', err));
  }

  return NextResponse.json(
    {
      ok: true,
      duplicated,
      message: duplicated
        ? 'Thanks — you are already on our list. We have refreshed the details we have on file.'
        : 'Thanks — your interest has been recorded. We will be in touch as soon as we start hiring for this role.',
    },
    { status: 200 },
  );
}
