/**
 * GitHub Webhook
 *
 * Subscribes to:
 *   - pull_request (opened, closed, ready_for_review, etc)
 *   - deployment_status (success, failure)
 *
 * Updates builder_proposals immediately when a PR merges, closes, or a
 * deployment status flips. The 5-min builder-verify cron remains as a safety
 * net for any events the webhook misses (delivery retries, etc).
 *
 * Auth: HMAC-SHA256 signature in X-Hub-Signature-256, verified against
 * GITHUB_WEBHOOK_SECRET. We refuse on missing/invalid signature unless
 * the request also has a valid CRON_SECRET bearer (for manual replay).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function verifyGithubSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  if (!header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex'));
}

async function notifyFounderTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(chatId),
        text: text.slice(0, 3800),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch {
    /* best-effort */
  }
}

interface PullRequestEvent {
  action: string;
  pull_request: {
    number: number;
    state: string;
    merged: boolean;
    merged_at: string | null;
    closed_at: string | null;
    merge_commit_sha: string | null;
    draft: boolean;
    title: string;
    html_url: string;
  };
  repository: { full_name: string };
}

interface DeploymentStatusEvent {
  action: string;
  deployment_status: { state: string; environment: string; description: string | null };
  deployment: { sha: string; environment: string };
  repository: { full_name: string };
}

async function handlePullRequest(supabase: ReturnType<typeof getAdmin>, payload: PullRequestEvent): Promise<{ handled: boolean; note: string }> {
  const pr = payload.pull_request;
  // Look up the proposal by pr_number.
  const { data: proposal } = await supabase
    .from('builder_proposals')
    .select('id, ticket_id, ticket_number, summary, status, pr_url')
    .eq('pr_number', pr.number)
    .single();
  if (!proposal) {
    return { handled: false, note: `no proposal for PR #${pr.number}` };
  }
  type Prop = { id: string; ticket_id: string | null; ticket_number: string | null; summary: string; status: string; pr_url: string | null };
  const p = proposal as Prop;

  if (payload.action === 'closed' && pr.merged && pr.merged_at) {
    await supabase
      .from('builder_proposals')
      .update({ pr_merged_at: pr.merged_at, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    await notifyFounderTelegram(
      `✅ <b>Builder PR merged</b>\n#${pr.number}: ${p.summary}\nWaiting for production deploy → ticket auto-resolve.`,
    );
    return { handled: true, note: `PR #${pr.number} merged → pr_merged_at set` };
  }

  if (payload.action === 'closed' && !pr.merged) {
    await supabase
      .from('builder_proposals')
      .update({
        status: 'rejected',
        rejected_at: pr.closed_at || new Date().toISOString(),
        rejection_reason: 'PR closed without merging',
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id);
    await supabase.from('business_log').insert({
      category: 'agent_governance',
      title: `Builder PR #${pr.number} closed without merge`,
      content: `Proposal ${p.id} (${p.summary}). Builder may re-iterate after the 4h cooldown.`,
      created_by: 'github-webhook',
    });
    return { handled: true, note: `PR #${pr.number} closed → proposal rejected` };
  }

  if (payload.action === 'ready_for_review') {
    // PR was promoted from draft → ready_for_review. Already handled by builder-verify
    // but we log so the timeline is clear.
    return { handled: true, note: `PR #${pr.number} marked ready_for_review` };
  }

  return { handled: false, note: `pull_request action='${payload.action}' not actioned` };
}

async function handleDeploymentStatus(
  supabase: ReturnType<typeof getAdmin>,
  payload: DeploymentStatusEvent,
): Promise<{ handled: boolean; note: string }> {
  const sha = payload.deployment.sha;
  const env = payload.deployment_status.environment || payload.deployment.environment;
  const state = payload.deployment_status.state;

  // Find any proposal whose merge commit matches this SHA. We track merge_commit_sha
  // on the GitHub side, not directly in the proposal — so look up the proposal by
  // pr_number whose merge SHA matches.
  // For efficiency, we just trigger the builder-verify cron path by NOT trying to
  // resolve to proposal here — instead log + let next cron pick it up.
  // (GitHub deployment webhooks come from Vercel's GitHub Deployments integration.)
  if (state === 'success' && env === 'production') {
    await supabase.from('business_log').insert({
      category: 'info',
      title: `Production deploy succeeded (sha=${sha.slice(0, 7)})`,
      content: `GitHub deployment_status webhook for ${env} → ${state}. builder-verify will pick this up on next 5-min poll for matching merged proposals.`,
      created_by: 'github-webhook',
    });
    return { handled: true, note: `prod deploy success for ${sha.slice(0, 7)} — verify cron will resolve tickets` };
  }
  if (state === 'failure' || state === 'error') {
    await notifyFounderTelegram(
      `🔴 <b>Production deploy ${state}</b>\nsha=<code>${sha.slice(0, 7)}</code> env=${env}\n${payload.deployment_status.description ?? ''}`,
    );
    return { handled: true, note: `prod deploy ${state} for ${sha.slice(0, 7)}` };
  }
  return { handled: false, note: `state='${state}' env='${env}' not actioned` };
}

async function handle(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  const auth = req.headers.get('authorization');
  const event = req.headers.get('x-github-event') || 'unknown';

  // Auth: prefer GitHub HMAC; fall back to CRON_SECRET for manual replay.
  const isGithub = verifyGithubSignature(rawBody, sig);
  const isCron = auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isGithub && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = getAdmin();

  let result: { handled: boolean; note: string } = { handled: false, note: `event='${event}' ignored` };
  try {
    if (event === 'pull_request') {
      result = await handlePullRequest(supabase, payload as PullRequestEvent);
    } else if (event === 'deployment_status') {
      result = await handleDeploymentStatus(supabase, payload as DeploymentStatusEvent);
    } else if (event === 'ping') {
      // GitHub sends a 'ping' on initial webhook setup — just ack.
      result = { handled: true, note: 'ping ack' };
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, event, ...result });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'github-webhook',
    events: ['pull_request', 'deployment_status', 'ping'],
    note: 'POST GitHub webhook deliveries here. HMAC signature required.',
  });
}
