/**
 * Builder Pickup Cron
 *
 * Every 30 minutes, scans for support tickets that Riley escalated with a
 * fix_type Builder can handle (code_fix, database_fix, config_fix), AND that
 * don't already have a pending or applied builder_proposal.
 *
 * For each match, fires a Builder managed-agent session with a task message
 * containing the ticket details. Builder reads the relevant code, drafts a
 * fix, and calls the propose_code_fix MCP tool — which gates everything
 * behind founder approval before any file is written.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AGENTS, createSession, sendTaskMessage } from '@/lib/managed-agents/config';

export const runtime = 'nodejs';
export const maxDuration = 90;

const PICK_FIX_TYPES = ['code_fix', 'database_fix', 'config_fix'];
const MAX_PER_RUN = 3; // never fire more than 3 Builder sessions per cycle (cost guard)
const MAX_ITERATIONS = 3; // never iterate more than 3 times on the same ticket (loop guard)
const REJECTION_COOLDOWN_HOURS = 4; // wait this long after a rejection before re-firing

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

interface EscalatedTicket {
  id: string;
  ticket_number: string | null;
  subject: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  status: string;
  priority: string;
  created_at: string;
}

function buildBuilderTask(
  ticket: EscalatedTicket,
  fixType: string,
  summary: string,
  iteration: number,
  priorRejections: Array<{ summary: string; reason: string | null; created_at: string }>,
): string {
  const ref = ticket.ticket_number || ticket.id.slice(0, 8).toUpperCase();
  const priorBlock =
    iteration > 1 && priorRejections.length > 0
      ? `\n\nPRIOR REJECTIONS ON THIS TICKET (do NOT propose the same approach):\n` +
        priorRejections
          .map(
            (r, i) =>
              `${i + 1}. (${r.created_at.slice(0, 16)}) "${r.summary}" — rejected because: ${r.reason || '(no reason given)'}`,
          )
          .join('\n') +
        `\n\nThis is iteration ${iteration} of ${MAX_ITERATIONS}. Take a different approach. If you genuinely cannot find a different valid fix, append_business_log with category='recommendation' explaining what's blocking and stop.`
      : '';

  return `BUILDER ESCALATION TASK — ${ref}${iteration > 1 ? ` (iteration ${iteration}/${MAX_ITERATIONS})` : ''}

Riley has escalated this support ticket as needing a ${fixType}. Your job:
1. Read the ticket details below.
2. Use read_repo_dir / read_repo_file MCP tools to inspect the relevant source.
3. Draft a fix as one or more file replacements.
4. Call propose_code_fix MCP tool with:
   - ticket_id: "${ticket.id}"
   - ticket_number: "${ref}"
   - fix_type: "${fixType}"
   - summary: <single-line PR title>
   - rationale: <why this fix is correct + reference the ticket>
   - proposed_files: [{ path, new_content }, ...] (full file contents, not diffs)

That's it. NO CODE IS WRITTEN until the founder approves. Your job ends after
calling propose_code_fix successfully.

HARD RULES:
- NEVER include src/lib/agents/complaints-agent.ts or
  src/app/api/complaints/generate/route.ts or src/app/api/cron/support-agent/route.ts
  in proposed_files (per CLAUDE.md). The propose_code_fix tool will refuse those
  paths anyway.
- Migrations must be additive only (no DROP TABLE / ALTER TABLE DROP COLUMN).
- No banned-integration imports (see paybacker_core/03-tech-stack.md).
- If you can't draft a confident fix, write a recommendation to business_log
  via append_business_log instead — don't propose a half-fix.

TICKET DETAILS:
- Reference: ${ref}
- Priority: ${ticket.priority}
- Subject: ${ticket.subject}
- Description: ${(ticket.description ?? '').slice(0, 2000)}
- Riley's escalation summary: ${summary}
- Created: ${ticket.created_at}${priorBlock}

Begin.`;
}

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Find escalated tickets where Riley set metadata.fix_type, status is in_progress,
  // assigned to "Human Required" (Riley's escalation marker), and there's no existing
  // pending/applied builder_proposal for the ticket.
  const { data: tickets, error } = await supabase
    .from('support_tickets')
    .select('id, ticket_number, subject, description, metadata, status, priority, created_at')
    .eq('status', 'in_progress')
    .eq('assigned_to', 'Human Required')
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const candidates = (tickets || []) as EscalatedTicket[];
  const builderConfig = AGENTS['builder'];
  if (!builderConfig) {
    return NextResponse.json({ ok: false, error: 'builder agent not configured' }, { status: 500 });
  }

  let fired = 0;
  const results: Array<{
    ticket_number: string | null;
    status: 'fired' | 'skipped';
    reason?: string;
    session_id?: string;
  }> = [];

  for (const ticket of candidates) {
    if (fired >= MAX_PER_RUN) {
      results.push({ ticket_number: ticket.ticket_number, status: 'skipped', reason: 'rate-cap (3/run)' });
      continue;
    }
    const meta = (ticket.metadata || {}) as Record<string, unknown>;
    const fixType = String(meta.fix_type || meta.escalation_fix_type || '').toLowerCase();
    if (!PICK_FIX_TYPES.includes(fixType)) {
      results.push({ ticket_number: ticket.ticket_number, status: 'skipped', reason: `fix_type='${fixType}' not actionable by Builder` });
      continue;
    }

    // Look at all prior proposals for this ticket. We need:
    //  - skip if any 'pending_review' / 'approved' / 'applied' (in flight)
    //  - skip if iteration count already >= MAX_ITERATIONS
    //  - skip if most recent rejection is younger than the cooldown window
    //  - otherwise re-fire with rejection feedback as iteration N+1
    const { data: priorRows } = await supabase
      .from('builder_proposals')
      .select('id, status, summary, rejection_reason, created_at, iteration')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: false })
      .limit(20);
    const priors = (priorRows || []) as Array<{
      id: string;
      status: string;
      summary: string;
      rejection_reason: string | null;
      created_at: string;
      iteration: number;
    }>;

    const inFlight = priors.find((p) =>
      ['pending_review', 'approved', 'applied'].includes(p.status),
    );
    if (inFlight) {
      results.push({
        ticket_number: ticket.ticket_number,
        status: 'skipped',
        reason: `existing proposal ${inFlight.id} in flight (${inFlight.status})`,
      });
      continue;
    }

    const lastIteration = priors[0]?.iteration ?? 0;
    if (lastIteration >= MAX_ITERATIONS) {
      results.push({
        ticket_number: ticket.ticket_number,
        status: 'skipped',
        reason: `max iterations reached (${MAX_ITERATIONS}) — escalating to founder via business_log only`,
      });
      // One-time audit so the digest surfaces it.
      await supabase.from('business_log').insert({
        category: 'escalation',
        title: `Builder gave up on ${ticket.ticket_number ?? ticket.id.slice(0, 8)} after ${MAX_ITERATIONS} attempts`,
        content: `Ticket needs manual handling. Subject: ${ticket.subject}. Riley's escalation_summary: ${meta.escalation_summary ?? '(none)'}.`,
        created_by: 'builder-pickup',
      });
      continue;
    }

    const lastRejection = priors.find((p) => p.status === 'rejected' || p.status === 'failed' || p.status === 'expired');
    if (lastRejection) {
      const ageMs = Date.now() - new Date(lastRejection.created_at).getTime();
      if (ageMs < REJECTION_COOLDOWN_HOURS * 3600_000) {
        results.push({
          ticket_number: ticket.ticket_number,
          status: 'skipped',
          reason: `cooldown after ${lastRejection.status}: re-fire eligible in ${Math.ceil((REJECTION_COOLDOWN_HOURS * 3600_000 - ageMs) / 60000)} min`,
        });
        continue;
      }
    }

    const priorRejections = priors
      .filter((p) => p.status === 'rejected' || p.status === 'failed')
      .map((p) => ({ summary: p.summary, reason: p.rejection_reason, created_at: p.created_at }));

    const iteration = lastIteration + 1;

    try {
      const session = await createSession(
        builderConfig,
        `Builder pickup — ${ticket.ticket_number ?? ticket.id.slice(0, 8)} (iter ${iteration})`,
      );
      const summary = String(meta.escalation_summary || ticket.subject);
      await sendTaskMessage(session.id, buildBuilderTask(ticket, fixType, summary, iteration, priorRejections));
      fired += 1;
      results.push({
        ticket_number: ticket.ticket_number,
        status: 'fired',
        session_id: session.id,
        ...(iteration > 1 ? { reason: `iteration ${iteration} after ${priorRejections.length} prior rejection(s)` } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ ticket_number: ticket.ticket_number, status: 'skipped', reason: `session error: ${msg.slice(0, 200)}` });
    }
  }

  // Audit
  await supabase.from('business_log').insert({
    category: fired > 0 ? 'info' : 'clean',
    title: `Builder pickup cycle — ${fired} session${fired === 1 ? '' : 's'} fired`,
    content: `Scanned ${candidates.length} escalated tickets. Results: ${results.map((r) => `${r.ticket_number}=${r.status}${r.reason ? ` (${r.reason})` : ''}`).join('; ')}`,
    created_by: 'builder-pickup',
  });

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    fired,
    results,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
