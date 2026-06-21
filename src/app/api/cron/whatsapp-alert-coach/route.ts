/**
 * WhatsApp alert coach — the "research how to improve" leg of the loop.
 *
 * Weekly. Reads the EXISTING intelligence_stats (scope_kind='alert_template'),
 * finds templates that are being sent enough but earning little engagement,
 * and asks Claude (Sonnet 4.6 by default — see COACH_MODEL) WHY + how to
 * improve (copy / timing / frequency / targeting). Each proposal is written to
 * intelligence_events
 * (action_kind='alert_improvement_proposed') so it's auditable in the existing
 * admin intelligence view, and the founder gets an email digest.
 *
 * Human-in-the-loop: this NEVER edits a template or changes a send. WhatsApp
 * template copy must be re-submitted to Meta anyway — the coach proposes, the
 * founder decides. Suppression of low-value sends is handled separately and
 * conservatively by consultLedger in the live send path.
 *
 * Auth: authorizeAdminOrCron (Bearer CRON_SECRET or founder session).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { recordAction } from '@/lib/intelligence';
import { EVENT_CATALOG } from '@/lib/notifications/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Sonnet analysis x up to 6 templates, sequential — give it headroom.
export const maxDuration = 300;

const MIN_SAMPLE = Number(process.env.WHATSAPP_COACH_MIN_SAMPLE ?? 20);
const PRECISION_CEILING = Number(process.env.WHATSAPP_COACH_PRECISION_PCT ?? 40);
const MAX_TEMPLATES = Number(process.env.WHATSAPP_COACH_MAX ?? 6);
const COACH_EMAIL = process.env.WHATSAPP_COACH_EMAIL || 'hello@paybacker.co.uk';
// Model for the weekly improvement analysis. Sonnet 4.6 by default — strong
// reasoning + copywriting for this low-volume weekly task. Override via env:
//   claude-opus-4-8           → maximum quality
//   claude-haiku-4-5-20251001 → cheapest
const COACH_MODEL = process.env.WHATSAPP_COACH_MODEL || 'claude-sonnet-4-6';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface UnderperformerRow {
  scope_value: string;
  emitted: number | null;
  acted_on: number | null;
  dismissed: number | null;
  precision_pct: number | null;
}

/** Describe what an alert template is for, from the event catalogue, so the
 *  model has context. Template names mostly mirror their event names. */
function describeTemplate(template: string): string {
  const ev = EVENT_CATALOG.find(
    (e) => template.includes(e.event) || e.event.includes(template.replace(/^paybacker_alert_/, '')),
  );
  return ev ? `${ev.label} — ${ev.description}` : template;
}

async function proposeImprovement(row: UnderperformerRow): Promise<string | null> {
  const key = process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt =
    `You are a senior lifecycle/CRM strategist optimising a UK consumer fintech's ` +
    `WhatsApp alerts (Paybacker — helps people fight unfair bills and track spending).\n\n` +
    `Template: ${row.scope_value}\n` +
    `Purpose: ${describeTemplate(row.scope_value)}\n` +
    `Last period: sent ${row.emitted ?? 0}, engaged ${row.acted_on ?? 0}, ` +
    `dismissed/opted-out ${row.dismissed ?? 0}, engagement rate ${row.precision_pct ?? 0}%.\n\n` +
    `Engagement is low. First weigh whether the root problem is relevance, copy, timing or ` +
    `frequency — a high dismissal/opt-out count points to fatigue or the wrong audience, not ` +
    `just weak wording. Then, in under 150 words, give: (1) the single most likely root cause, ` +
    `and (2) the two or three highest-impact, testable changes ordered by expected lift, across ` +
    `copy, time-of-day, frequency or targeting. Be specific — propose actual wording when copy ` +
    `is the issue. UK English. WhatsApp template copy needs Meta re-approval, so flag clearly ` +
    `when a change requires resubmission.`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: COACH_MODEL,
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      console.warn('[whatsapp-coach] anthropic non-200', res.status);
      return null;
    }
    const j = (await res.json()) as { content?: Array<{ text?: string }> };
    return j.content?.[0]?.text?.trim() ?? null;
  } catch (e) {
    console.warn('[whatsapp-coach] anthropic call failed', (e as Error)?.message ?? e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await authorizeAdminOrCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const sb = admin();

  // Underperformers: enough volume, low engagement. all_time window.
  const { data, error } = await sb
    .from('intelligence_stats')
    .select('scope_value, emitted, acted_on, dismissed, precision_pct')
    .eq('scope_kind', 'alert_template')
    .eq('window_kind', 'all_time')
    .gte('emitted', MIN_SAMPLE)
    .order('precision_pct', { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const underperformers = (data ?? [])
    .filter((r) => r.precision_pct != null && Number(r.precision_pct) < PRECISION_CEILING)
    .slice(0, MAX_TEMPLATES) as UnderperformerRow[];

  if (underperformers.length === 0) {
    return NextResponse.json({ ok: true, analysed: 0, note: 'no underperformers above sample floor' });
  }

  const proposals: Array<{ template: string; precision: number | null; proposal: string }> = [];

  for (const row of underperformers) {
    const proposal = await proposeImprovement(row);
    if (!proposal) continue;
    proposals.push({ template: row.scope_value, precision: row.precision_pct, proposal });

    // Record the proposal in the ledger — auditable + visible in the admin
    // intelligence view. Never auto-applied.
    await recordAction({
      actor: 'ai',
      actionKind: 'alert_improvement_proposed',
      subjectKind: 'alert_template',
      subjectId: row.scope_value,
      metadata: {
        precision_pct: row.precision_pct,
        emitted: row.emitted,
        acted_on: row.acted_on,
        dismissed: row.dismissed,
        proposal,
        channel: 'whatsapp',
      },
    });
  }

  // Email the founder a digest (best-effort).
  if (proposals.length > 0) {
    try {
      const { resend, FROM_EMAIL } = await import('@/lib/resend');
      const html =
        `<h2>WhatsApp alert coach — ${proposals.length} template(s) to review</h2>` +
        `<p>These alerts are being sent but earning low engagement. Proposals are ` +
        `suggestions only — nothing has been changed.</p>` +
        proposals
          .map(
            (p) =>
              `<div style="margin:16px 0;padding:12px;border-left:3px solid #f59e0b;background:#0f172a;color:#e2e8f0">` +
              `<strong>${p.template}</strong> — engagement ${p.precision ?? 0}%<br/>` +
              `<div style="margin-top:8px;white-space:pre-wrap">${p.proposal}</div></div>`,
          )
          .join('') +
        `<p style="color:#64748b;font-size:12px">Suppression of repeatedly-ignored non-critical ` +
        `alerts is handled automatically by the intelligence ledger; this digest is for copy/timing changes you control.</p>`;
      await resend.emails.send({
        from: FROM_EMAIL,
        to: COACH_EMAIL,
        subject: `📊 WhatsApp alert coach — ${proposals.length} to review`,
        html,
      });
    } catch (e) {
      console.warn('[whatsapp-coach] founder email failed', (e as Error)?.message ?? e);
    }
  }

  return NextResponse.json({ ok: true, analysed: underperformers.length, proposed: proposals.length });
}
