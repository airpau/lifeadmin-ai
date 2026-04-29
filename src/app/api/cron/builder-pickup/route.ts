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

function buildBuilderTask(ticket: EscalatedTicket, fixType: string, summary: string): string {
  const ref = ticket.ticket_number || ticket.id.slice(0, 8).toUpperCase();
  return `BUILDER ESCALATION TASK — ${ref}

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
- Created: ${ticket.created_at}

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
  const results: Array<{ ticket_number: string | null; status: 'fired' | 'skipped'; reason?: string; session_id?: string }> = [];

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

    // Skip if there's already a non-terminal proposal for this ticket.
    const { data: existing } = await supabase
      .from('builder_proposals')
      .select('id, status')
      .eq('ticket_id', ticket.id)
      .in('status', ['pending_review', 'approved', 'applied'])
      .limit(1)
      .maybeSingle();
    if (existing) {
      results.push({ ticket_number: ticket.ticket_number, status: 'skipped', reason: `existing proposal ${existing.id} (${existing.status})` });
      continue;
    }

    try {
      const session = await createSession(builderConfig, `Builder pickup — ${ticket.ticket_number ?? ticket.id.slice(0, 8)}`);
      const summary = String(meta.escalation_summary || ticket.subject);
      await sendTaskMessage(session.id, buildBuilderTask(ticket, fixType, summary));
      fired += 1;
      results.push({ ticket_number: ticket.ticket_number, status: 'fired', session_id: session.id });
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
