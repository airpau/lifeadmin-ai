/**
 * Builder Verify Cron
 *
 * Every 5 minutes, polls Builder PRs through their post-approval lifecycle:
 *
 *   STAGE A (status='applied' AND pr_merged_at IS NULL):
 *     Check the PR via GitHub API. If merged → set pr_merged_at.
 *     If closed without merging → mark proposal status='rejected' with reason.
 *
 *   STAGE B (pr_merged_at IS NOT NULL AND deploy_verified_at IS NULL):
 *     Check Vercel for the master deployment of the merge commit. If READY →
 *     set deploy_verified_at.
 *
 *   STAGE C (deploy_verified_at IS NOT NULL AND ticket_resolved_at IS NULL):
 *     Update originating support_ticket → status='resolved', insert a
 *     ticket_message confirming the fix shipped, post-emit founder Telegram +
 *     comment in business_log.
 *
 * Self-throttling: each proposal has verify_check_count incremented per pass.
 * After 100 checks (~8 hours of failed-to-merge polling) we stop hammering the
 * GitHub/Vercel APIs and surface the proposal as stalled in business_log.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GITHUB_REPO = process.env.GITHUB_REPO || 'airpau/lifeadmin-ai';
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_BXE0Vi66KEwNqisNRnGjRtl35yXT';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_SJyVnrkwVgA4RigQCvYWDOua';

interface ProposalRow {
  id: string;
  ticket_id: string | null;
  ticket_number: string | null;
  summary: string;
  pr_number: number | null;
  pr_url: string | null;
  status: string;
  pr_merged_at: string | null;
  deploy_verified_at: string | null;
  ticket_resolved_at: string | null;
  verify_check_count: number;
  fix_type: string;
}

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function ghFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error('GITHUB_TOKEN not configured');
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: 'application/vnd.github+json',
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
}

async function vercelFetch(path: string): Promise<Response> {
  const t = process.env.VERCEL_TOKEN;
  if (!t) throw new Error('VERCEL_TOKEN not configured');
  return fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
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
    // best-effort
  }
}

async function notifyTicketUser(
  supabase: ReturnType<typeof getAdmin>,
  ticketId: string,
  ticketRef: string,
  prUrl: string,
  summary: string,
): Promise<void> {
  // Look up ticket source + user contact details to message via the right channel.
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, user_id, source, metadata, subject')
    .eq('id', ticketId)
    .single();
  if (!ticket) return;
  const source = (ticket as { source: string }).source;
  const meta = (ticket as { metadata: Record<string, unknown> | null }).metadata || {};

  // Always insert a ticket_messages row so the conversation has a record.
  await supabase.from('ticket_messages').insert({
    ticket_id: ticketId,
    sender_type: 'system',
    sender_name: 'Builder',
    message: `🛠️ Fix shipped! The code change for "${(ticket as { subject: string }).subject}" has been merged to master and deployed. PR: ${prUrl}\n\nIf you're still seeing the issue, just reply and we'll re-open the ticket.`,
  });

  // Channel-specific notification.
  if (source === 'telegram') {
    const tgChatId = (meta as Record<string, unknown>).telegram_chat_id as number | string | null | undefined;
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    if (tgChatId && tgToken) {
      try {
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: Number(tgChatId),
            text: `🛠️ <b>Fix shipped — ${ticketRef}</b>\n\n${summary}\n\nThe code change has been merged and deployed. If you're still seeing the issue, just reply here and we'll re-open the ticket.`,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
      } catch {
        /* best-effort */
      }
    }
  } else if (source === 'email') {
    // Email path — look up the user's email and send a plain confirmation.
    const userId = (ticket as { user_id: string | null }).user_id;
    let email: string | null = null;
    if (userId) {
      const { data: prof } = await supabase.from('profiles').select('email').eq('id', userId).single();
      email = (prof as { email: string | null } | null)?.email ?? null;
    }
    if (!email && typeof (meta as Record<string, unknown>).from === 'string') {
      const m = ((meta as Record<string, unknown>).from as string).match(/<([^>]+)>/);
      email = m ? m[1] : ((meta as Record<string, unknown>).from as string);
    }
    if (email && process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>',
            replyTo: process.env.RESEND_REPLY_TO || 'support@mail.paybacker.co.uk',
            to: [email],
            subject: `Fixed: ${(ticket as { subject: string }).subject} (${ticketRef})`,
            html: `<p>Hi there,</p><p>Quick update on your support ticket <strong>${ticketRef}</strong>.</p><p>The code fix for <em>"${(ticket as { subject: string }).subject}"</em> has been merged to master and deployed. You should see the issue resolved on your next visit / sync.</p><p>If you're still seeing the problem, just reply to this email and we'll re-open the ticket.</p><p>Best,<br/>Riley<br/><em>Paybacker Support</em></p>`,
          }),
        });
      } catch {
        /* best-effort */
      }
    }
  }
  // For chatbot source — no proactive push channel, the user will see the message
  // in their conversation history next time they open the chat widget.
}

// Mark a draft PR as ready-for-review via GraphQL (works on plans where the
// REST PATCH `{draft:false}` returns 422). Returns true on success.
async function markPullRequestReadyForReview(nodeId: string): Promise<boolean> {
  const t = process.env.GITHUB_TOKEN;
  if (!t || !nodeId) return false;
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { number isDraft } } }`,
        variables: { id: nodeId },
      }),
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as {
      data?: { markPullRequestReadyForReview?: { pullRequest?: { isDraft?: boolean } } };
      errors?: unknown;
    };
    if (body.errors) return false;
    return body.data?.markPullRequestReadyForReview?.pullRequest?.isDraft === false;
  } catch {
    return false;
  }
}

// Squash-merge a PR. Returns the merge_commit_sha on success or a reason on failure.
async function squashMergePr(
  prNumber: number,
  ticketRef: string,
  summary: string,
): Promise<{ ok: true; sha: string } | { ok: false; reason: string }> {
  const title = `fix(${ticketRef}): ${summary}`.slice(0, 70);
  const body = `Auto-merged by Builder after founder approval + green Vercel preview.\n\nProposal ticket ref: ${ticketRef}.`;
  try {
    const res = await ghFetch(`/repos/${GITHUB_REPO}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      body: JSON.stringify({ commit_title: title, commit_message: body, merge_method: 'squash' }),
    });
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { sha?: string; merged?: boolean };
      if (j.merged && j.sha) return { ok: true, sha: j.sha };
      return { ok: false, reason: `merge endpoint returned ok but merged=false` };
    }
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, reason: `github ${res.status}: ${errBody.message ?? '(no message)'}` };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function processStageDraftCi(
  supabase: ReturnType<typeof getAdmin>,
  proposals: ProposalRow[],
): Promise<{ promoted: number; ci_failed: number; still_pending: number; errors: string[] }> {
  let promoted = 0;
  let ciFailed = 0;
  let stillPending = 0;
  const errors: string[] = [];

  for (const p of proposals) {
    if (!p.pr_number) continue;
    try {
      const prRes = await ghFetch(`/repos/${GITHUB_REPO}/pulls/${p.pr_number}`);
      if (!prRes.ok) {
        errors.push(`PR #${p.pr_number}: github ${prRes.status}`);
        continue;
      }
      const pr = (await prRes.json()) as {
        draft: boolean;
        state: string;
        merged: boolean;
        node_id: string;
        head: { sha: string; ref: string };
      };
      if (pr.merged) {
        // Already merged (founder beat us to it, or previous run). Stage A picks up.
        continue;
      }
      if (!pr.draft) {
        // Already ready_for_review but not yet merged. Founder un-drafted manually,
        // or our previous pass un-drafted but the merge step failed. Stage A handles
        // it next pass; we don't auto-merge from here to respect any manual intent.
        continue;
      }
      if (pr.state === 'closed') {
        await supabase
          .from('builder_proposals')
          .update({
            status: 'rejected',
            rejected_at: new Date().toISOString(),
            rejection_reason: 'Draft PR was closed without merging',
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        ciFailed += 1;
        continue;
      }
      // Find the Vercel preview deployment for this PR's HEAD commit.
      const depRes = await vercelFetch(
        `/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&target=preview&limit=20`,
      );
      if (!depRes.ok) {
        errors.push(`Vercel ${depRes.status}`);
        continue;
      }
      const dep = (await depRes.json()) as {
        deployments: Array<{ uid: string; state: string; url: string; meta?: { githubCommitSha?: string } }>;
      };
      const match = dep.deployments.find((d) => d.meta?.githubCommitSha === pr.head.sha);
      if (!match) {
        // Vercel hasn't started building yet (or just queued). Wait.
        stillPending += 1;
        await supabase
          .from('builder_proposals')
          .update({
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        continue;
      }
      if (match.state === 'READY') {
        // === AUTO-MERGE PATH ===
        // Founder approval already happened (status='applied' = approved). Now
        // that the preview is green, complete the loop without asking again:
        //   (1) un-draft via GraphQL (REST PATCH 422s on this repo)
        //   (2) squash-merge to master
        //   (3) set pr_merged_at, single Telegram, hand off to Stage B for prod-deploy verify.
        const ticketRef = p.ticket_number ?? p.id.slice(0, 8);
        const undrafted = await markPullRequestReadyForReview(pr.node_id);
        if (!undrafted) {
          // Couldn't un-draft. Telegram once (gated by verify_check_count==0)
          // and let the next pass retry.
          if (p.verify_check_count === 0) {
            await notifyFounderTelegram(
              `🟡 <b>Builder PR un-draft failed</b>\n#${p.pr_number}: ${p.summary}\nVercel preview READY but couldn't promote draft → ready_for_review via GraphQL. Will retry next pass.\nReview &amp; merge manually if persistent: ${p.pr_url}`,
            );
          }
          await supabase
            .from('builder_proposals')
            .update({
              verify_check_count: p.verify_check_count + 1,
              verify_last_at: new Date().toISOString(),
              last_error: 'GraphQL markPullRequestReadyForReview failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', p.id);
          stillPending += 1;
          continue;
        }
        // Un-draft succeeded — try the squash-merge.
        const merged = await squashMergePr(p.pr_number, ticketRef, p.summary);
        if (!merged.ok) {
          // Merge couldn't complete (conflicts, branch protection, mergeable=false).
          // Telegram founder ONCE so they can intervene; subsequent passes stay quiet.
          if (p.verify_check_count === 0) {
            await notifyFounderTelegram(
              `🟡 <b>Builder PR auto-merge blocked</b>\n#${p.pr_number}: ${p.summary}\nPR is now ready-for-review and Vercel preview is green, but auto-merge failed: <code>${merged.reason}</code>\nReview &amp; merge manually: ${p.pr_url}`,
            );
          }
          await supabase
            .from('builder_proposals')
            .update({
              verify_check_count: p.verify_check_count + 1,
              verify_last_at: new Date().toISOString(),
              last_error: `auto-merge: ${merged.reason}`.slice(0, 500),
              updated_at: new Date().toISOString(),
            })
            .eq('id', p.id);
          stillPending += 1;
          continue;
        }
        // ✅ MERGED. Set pr_merged_at locally so Stage B picks it up next pass
        // for the production-deploy verification.
        const mergedAt = new Date().toISOString();
        await supabase
          .from('builder_proposals')
          .update({
            pr_merged_at: mergedAt,
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: mergedAt,
            updated_at: mergedAt,
          })
          .eq('id', p.id);
        await notifyFounderTelegram(
          `🟢 <b>Builder fix auto-merged</b>\n#${p.pr_number}: ${p.summary}\nSquash-merged to master. Production deploy starting now.\nWill verify deploy + auto-resolve ticket ${ticketRef} once live.\nMerge sha: <code>${merged.sha.slice(0, 7)}</code>`,
        );
        promoted += 1;
      } else if (match.state === 'ERROR' || match.state === 'CANCELED') {
        // Close the draft PR + mark proposal failed.
        await ghFetch(`/repos/${GITHUB_REPO}/pulls/${p.pr_number}`, {
          method: 'PATCH',
          body: JSON.stringify({ state: 'closed' }),
        });
        await supabase
          .from('builder_proposals')
          .update({
            status: 'failed',
            last_error: `Vercel preview deploy state=${match.state} (uid=${match.uid})`,
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        await notifyFounderTelegram(
          `🔴 <b>Builder PR auto-closed: CI failed</b>\n#${p.pr_number}: ${p.summary}\nVercel preview state=<b>${match.state}</b>.\nDraft PR has been closed automatically. Builder will re-iterate after the 4h cooldown with a different approach.\n\nDeployment uid: <code>${match.uid}</code>`,
        );
        ciFailed += 1;
      } else {
        // BUILDING / QUEUED — wait next pass.
        stillPending += 1;
        await supabase
          .from('builder_proposals')
          .update({
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
          })
          .eq('id', p.id);
      }
    } catch (e) {
      errors.push(`PR #${p.pr_number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { promoted, ci_failed: ciFailed, still_pending: stillPending, errors };
}

async function processStageA(
  supabase: ReturnType<typeof getAdmin>,
  proposals: ProposalRow[],
): Promise<{ merged: number; closed_without_merge: number; still_open: number; errors: string[] }> {
  let merged = 0;
  let closedWithoutMerge = 0;
  let stillOpen = 0;
  const errors: string[] = [];

  for (const p of proposals) {
    if (!p.pr_number) continue;
    try {
      const r = await ghFetch(`/repos/${GITHUB_REPO}/pulls/${p.pr_number}`);
      if (!r.ok) {
        errors.push(`PR #${p.pr_number}: github ${r.status}`);
        continue;
      }
      const pr = (await r.json()) as {
        merged: boolean;
        merged_at: string | null;
        merge_commit_sha: string | null;
        state: string;
        closed_at: string | null;
      };
      if (pr.merged && pr.merged_at) {
        await supabase
          .from('builder_proposals')
          .update({
            pr_merged_at: pr.merged_at,
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        merged += 1;
      } else if (pr.state === 'closed' && pr.closed_at) {
        // Closed without merging — treat as rejection.
        await supabase
          .from('builder_proposals')
          .update({
            status: 'rejected',
            rejected_at: pr.closed_at,
            rejection_reason: 'PR was closed on GitHub without merging',
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        await supabase.from('business_log').insert({
          category: 'agent_governance',
          title: `Builder PR #${p.pr_number} closed without merge`,
          content: `Proposal ${p.id} (${p.summary}) PR was closed on GitHub. Builder will not auto-retry; founder action required.`,
          created_by: 'builder-verify',
        });
        closedWithoutMerge += 1;
      } else {
        await supabase
          .from('builder_proposals')
          .update({
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        stillOpen += 1;
      }
    } catch (e) {
      errors.push(`PR #${p.pr_number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { merged, closed_without_merge: closedWithoutMerge, still_open: stillOpen, errors };
}

async function processStageB(
  supabase: ReturnType<typeof getAdmin>,
  proposals: ProposalRow[],
): Promise<{ verified: number; pending: number; errors: string[] }> {
  let verified = 0;
  let pending = 0;
  const errors: string[] = [];

  for (const p of proposals) {
    if (!p.pr_number || !p.pr_merged_at) continue;
    try {
      // Get the merge commit SHA via GitHub
      const prRes = await ghFetch(`/repos/${GITHUB_REPO}/pulls/${p.pr_number}`);
      if (!prRes.ok) {
        errors.push(`PR #${p.pr_number}: github ${prRes.status}`);
        continue;
      }
      const pr = (await prRes.json()) as { merge_commit_sha: string | null };
      if (!pr.merge_commit_sha) {
        errors.push(`PR #${p.pr_number}: no merge_commit_sha`);
        continue;
      }
      // Find the production deployment for this SHA.
      const depRes = await vercelFetch(
        `/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&target=production&limit=20`,
      );
      if (!depRes.ok) {
        errors.push(`Vercel ${depRes.status}`);
        continue;
      }
      const dep = (await depRes.json()) as {
        deployments: Array<{ uid: string; state: string; meta?: { githubCommitSha?: string } }>;
      };
      const match = dep.deployments.find(
        (d) => d.meta?.githubCommitSha === pr.merge_commit_sha,
      );
      if (!match) {
        // Not yet built; will retry next pass.
        pending += 1;
        await supabase
          .from('builder_proposals')
          .update({
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        continue;
      }
      if (match.state === 'READY') {
        await supabase
          .from('builder_proposals')
          .update({
            deploy_verified_at: new Date().toISOString(),
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        verified += 1;
      } else if (match.state === 'ERROR' || match.state === 'CANCELED') {
        await supabase
          .from('builder_proposals')
          .update({
            status: 'failed',
            last_error: `Vercel deploy state=${match.state} (uid=${match.uid})`,
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id);
        await notifyFounderTelegram(
          `🔴 <b>Builder fix verification failed</b>\nPR #${p.pr_number} merged but production deploy <b>${match.state}</b>.\n\n${p.summary}\n\nManual investigation needed.`,
        );
        errors.push(`PR #${p.pr_number}: deploy ${match.state}`);
      } else {
        // BUILDING/QUEUED — wait next pass.
        pending += 1;
        await supabase
          .from('builder_proposals')
          .update({
            verify_check_count: p.verify_check_count + 1,
            verify_last_at: new Date().toISOString(),
          })
          .eq('id', p.id);
      }
    } catch (e) {
      errors.push(`PR #${p.pr_number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { verified, pending, errors };
}

async function processStageC(
  supabase: ReturnType<typeof getAdmin>,
  proposals: ProposalRow[],
): Promise<{ resolved: number; errors: string[] }> {
  let resolved = 0;
  const errors: string[] = [];

  for (const p of proposals) {
    if (!p.ticket_id) {
      // Proactive proposals without a ticket — just mark resolved on the proposal itself.
      await supabase
        .from('builder_proposals')
        .update({
          ticket_resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id);
      resolved += 1;
      continue;
    }
    try {
      // Update the ticket → resolved with metadata mention.
      const { data: ticketRow } = await supabase
        .from('support_tickets')
        .select('metadata, status')
        .eq('id', p.ticket_id)
        .single();
      const existingMeta = ((ticketRow as { metadata: Record<string, unknown> | null } | null)?.metadata || {}) as Record<string, unknown>;
      await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          metadata: {
            ...existingMeta,
            resolved_by: 'builder-fix',
            resolved_via_pr: p.pr_url,
            resolved_proposal_id: p.id,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.ticket_id);

      // User-facing notification on the original channel.
      await notifyTicketUser(
        supabase,
        p.ticket_id,
        p.ticket_number ?? p.ticket_id.slice(0, 8).toUpperCase(),
        p.pr_url ?? '',
        p.summary,
      );

      // Founder Telegram + business_log.
      await notifyFounderTelegram(
        `✅ <b>Ticket auto-resolved</b>\n${p.ticket_number ?? p.ticket_id.slice(0, 8)}: ${p.summary}\nPR: ${p.pr_url ?? '(none)'}\nUser notified via their original channel.`,
      );
      await supabase.from('business_log').insert({
        category: 'recommendation',
        title: `Ticket ${p.ticket_number ?? p.ticket_id.slice(0, 8)} auto-resolved by Builder fix`,
        content: `Proposal ${p.id} merged + deployed. Ticket marked resolved with link to PR ${p.pr_url ?? '(none)'}. User notified on original channel.`,
        created_by: 'builder-verify',
      });

      await supabase
        .from('builder_proposals')
        .update({
          ticket_resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id);
      resolved += 1;
    } catch (e) {
      errors.push(`proposal ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { resolved, errors };
}

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getAdmin();

  // Stage A.5 (DRAFT_CI): proposal is applied AND PR is still a draft (waiting for CI).
  // Same query as Stage A — we differentiate by PR state inside processStageDraftCi
  // (it skips non-draft PRs and lets Stage A pick them up).
  const { data: stageDraftRows } = await supabase
    .from('builder_proposals')
    .select('id, ticket_id, ticket_number, summary, pr_number, pr_url, status, pr_merged_at, deploy_verified_at, ticket_resolved_at, verify_check_count, fix_type')
    .eq('status', 'applied')
    .is('pr_merged_at', null)
    .lt('verify_check_count', 100)
    .order('updated_at', { ascending: true })
    .limit(20);

  // Stage A: applied + not yet merged. Cap at 100 checks per proposal so we don't poll forever.
  const { data: stageARows } = await supabase
    .from('builder_proposals')
    .select('id, ticket_id, ticket_number, summary, pr_number, pr_url, status, pr_merged_at, deploy_verified_at, ticket_resolved_at, verify_check_count, fix_type')
    .eq('status', 'applied')
    .is('pr_merged_at', null)
    .lt('verify_check_count', 100)
    .order('updated_at', { ascending: true })
    .limit(20);

  // Stage B: merged but deploy not yet verified.
  const { data: stageBRows } = await supabase
    .from('builder_proposals')
    .select('id, ticket_id, ticket_number, summary, pr_number, pr_url, status, pr_merged_at, deploy_verified_at, ticket_resolved_at, verify_check_count, fix_type')
    .eq('status', 'applied')
    .not('pr_merged_at', 'is', null)
    .is('deploy_verified_at', null)
    .lt('verify_check_count', 100)
    .order('pr_merged_at', { ascending: true })
    .limit(20);

  // Stage C: deploy verified but ticket not yet resolved.
  const { data: stageCRows } = await supabase
    .from('builder_proposals')
    .select('id, ticket_id, ticket_number, summary, pr_number, pr_url, status, pr_merged_at, deploy_verified_at, ticket_resolved_at, verify_check_count, fix_type')
    .eq('status', 'applied')
    .not('deploy_verified_at', 'is', null)
    .is('ticket_resolved_at', null)
    .order('deploy_verified_at', { ascending: true })
    .limit(20);

  const draft = await processStageDraftCi(supabase, (stageDraftRows || []) as ProposalRow[]);
  const a = await processStageA(supabase, (stageARows || []) as ProposalRow[]);
  const b = await processStageB(supabase, (stageBRows || []) as ProposalRow[]);
  const c = await processStageC(supabase, (stageCRows || []) as ProposalRow[]);

  // Audit row only when something actually happened — avoid noisy clean-cycle rows.
  const totalActions =
    draft.promoted + draft.ci_failed + a.merged + a.closed_without_merge + b.verified + c.resolved;
  if (totalActions > 0) {
    await supabase.from('business_log').insert({
      category: 'info',
      title: `Builder verify — promoted=${draft.promoted} ci_failed=${draft.ci_failed} merged=${a.merged} verified=${b.verified} resolved=${c.resolved}`,
      content: `Stage A.5 (draft→ready): ${draft.promoted} promoted, ${draft.ci_failed} CI-failed (auto-closed), ${draft.still_pending} still pending. Stage A (applied→merged): ${a.merged} merged, ${a.closed_without_merge} closed-w/o-merge, ${a.still_open} still open. Stage B (merged→deploy): ${b.verified} verified, ${b.pending} pending. Stage C (deploy→ticket): ${c.resolved} ticket(s) resolved. Errors: ${[...draft.errors, ...a.errors, ...b.errors, ...c.errors].join('; ') || 'none'}.`,
      created_by: 'builder-verify',
    });
  }

  return NextResponse.json({
    ok: true,
    stage_draft_ci: draft,
    stage_a: a,
    stage_b: b,
    stage_c: c,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
