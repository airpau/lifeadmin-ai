import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyAgents } from '@/lib/agent-notify';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Auto-executable categories — these can be applied without code changes
const AUTO_EXECUTABLE = ['config', 'prompt', 'schedule', 'data'];

// Send feedback to Railway agent server for self-learning loop
async function sendAgentFeedback(agentRole: string, eventType: string, sourceId: string, feedbackContent: string) {
  const railwayUrl = process.env.RAILWAY_URL;
  if (!railwayUrl) return;

  try {
    await fetch(`${railwayUrl}/api/feedback`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_role: agentRole,
        event_type: eventType,
        source_id: sourceId,
        feedback_content: feedbackContent,
      }),
    });
  } catch (e) {
    // Feedback failure should never block the approval flow
    console.error('[Feedback] Failed to send to Railway:', e);
  }
}

async function executeProposal(supabase: any, proposal: any): Promise<string> {
  // Execute based on category
  switch (proposal.category) {
    case 'prompt': {
      // Update an agent's system prompt
      // Implementation field should contain: role=cfo;prompt=new prompt text
      const match = proposal.implementation.match(/role=(\w+);/);
      if (match) {
        const role = match[1];
        const newPrompt = proposal.implementation.replace(/role=\w+;/, '').trim();
        if (newPrompt) {
          await supabase.from('ai_executives').update({ system_prompt: newPrompt }).eq('role', role);
          return `Updated system prompt for ${role}`;
        }
      }
      return 'Prompt update queued — review in next Claude Code session';
    }

    case 'schedule': {
      // Update an agent's schedule
      const match = proposal.implementation.match(/role=(\w+);schedule=(.+)/);
      if (match) {
        const [, role, schedule] = match;
        await supabase.from('ai_executives').update({ schedule: schedule.trim() }).eq('role', role);
        return `Updated schedule for ${role} to ${schedule.trim()}`;
      }
      return 'Schedule update format not recognised — review manually';
    }

    case 'config':
    case 'data': {
      // Generic — log for manual review. In future, could execute SQL
      return 'Config/data change logged — will be applied in next Claude Code session';
    }

    default:
      return 'Queued for implementation';
  }
}

async function createGitHubIssue(proposal: any): Promise<string | null> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) return null;

  try {
    const res = await fetch('https://api.github.com/repos/airpau/lifeadmin-ai/issues', {
      method: 'POST',
      headers: {
        Authorization: `token ${githubToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        title: `[AI Proposal] ${proposal.title}`,
        body: `## Proposed by: ${proposal.proposed_by}\n**Priority:** ${proposal.priority}\n**Category:** ${proposal.category}\n\n## Description\n${proposal.description}\n\n## Implementation\n${proposal.implementation}\n\n${proposal.estimated_impact ? `## Expected Impact\n${proposal.estimated_impact}\n\n` : ''}---\n*Auto-created from approved AI improvement proposal*`,
        labels: ['ai-proposal', proposal.priority, proposal.category],
      }),
    });

    if (res.ok) {
      const issue = await res.json();
      return issue.html_url;
    }
  } catch (err) {
    console.error('Failed to create GitHub issue:', err);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  if (!token || !action || !['approve', 'reject'].includes(action)) {
    return new NextResponse(renderHtml('Invalid Link', 'This approval link is invalid or has expired.', 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const supabase = getAdmin();

  // Find proposal by token
  const { data: proposal, error } = await supabase
    .from('improvement_proposals')
    .select('*')
    .eq('approval_token', token)
    .single();

  if (error || !proposal) {
    return new NextResponse(renderHtml('Not Found', 'This proposal was not found or has already been processed.', 'error'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (proposal.status !== 'pending') {
    return new NextResponse(renderHtml('Already Processed', `This proposal was already ${proposal.status}.`, 'info'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (action === 'reject') {
    await supabase.from('improvement_proposals').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
    }).eq('id', proposal.id);

    // Send feedback to Railway agent server for self-learning
    await sendAgentFeedback(proposal.proposed_by, 'proposal_rejected', proposal.id, `Rejected: "${proposal.title}"`);

    return new NextResponse(renderHtml('Rejected', `"${proposal.title}" has been rejected.`, 'rejected'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Approve
  let implementationResult = '';
  let githubUrl: string | null = null;

  if (AUTO_EXECUTABLE.includes(proposal.category)) {
    // Auto-execute
    try {
      implementationResult = await executeProposal(supabase, proposal);
    } catch (err: any) {
      implementationResult = `Execution failed: ${err.message}`;
    }
  } else {
    // Trigger developer agent to create a PR for code changes
    try {
      const devRes = await fetch(`https://paybacker.co.uk/api/developer/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: `${proposal.title}: ${proposal.description}`,
          context: proposal.implementation,
          proposalId: proposal.id,
        }),
      });
      const devResult = await devRes.json();
      if (devResult.ok && devResult.pr) {
        githubUrl = devResult.pr;
        implementationResult = `PR created by developer agent: ${devResult.pr}`;
      } else {
        // Fall back to GitHub issue
        githubUrl = await createGitHubIssue(proposal);
        implementationResult = githubUrl
          ? `GitHub issue created: ${githubUrl}`
          : 'Queued for next Claude Code session';
      }
    } catch {
      githubUrl = await createGitHubIssue(proposal);
      implementationResult = githubUrl
        ? `GitHub issue created: ${githubUrl}`
        : 'Queued for next Claude Code session';
    }
  }

  await supabase.from('improvement_proposals').update({
    status: AUTO_EXECUTABLE.includes(proposal.category) ? 'implemented' : 'approved',
    approved_at: new Date().toISOString(),
    implemented_at: AUTO_EXECUTABLE.includes(proposal.category) ? new Date().toISOString() : null,
    implementation_result: implementationResult,
    github_issue_url: githubUrl,
  }).eq('id', proposal.id);

  // Send feedback to Railway agent server for self-learning
  await sendAgentFeedback(proposal.proposed_by, 'proposal_approved', proposal.id, `Approved: "${proposal.title}"`);

  // Notify all relevant agents about the approval
  await notifyAgents('proposal_approved', `Approved: ${proposal.title}`, `Proposal by ${proposal.proposed_by} was approved. Category: ${proposal.category}. ${implementationResult}`, 'founder', [proposal.proposed_by]);

  const message = AUTO_EXECUTABLE.includes(proposal.category)
    ? `"${proposal.title}" has been approved and implemented.\n\n${implementationResult}`
    : `"${proposal.title}" has been approved.\n\n${implementationResult}`;

  return new NextResponse(renderHtml('Approved', message, 'approved'), {
    headers: { 'Content-Type': 'text/html' },
  });
}

function renderHtml(title: string, message: string, status: 'approved' | 'rejected' | 'error' | 'info'): string {
  const colors = {
    approved: { bg: '#22c55e', text: '#4ade80', icon: '&#10003;' },
    rejected: { bg: '#ef4444', text: '#f87171', icon: '&#10007;' },
    error: { bg: '#ef4444', text: '#f87171', icon: '!' },
    info: { bg: '#3b82f6', text: '#60a5fa', icon: 'i' },
  };
  const c = colors[status];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} — Paybacker</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
<div style="max-width:500px;margin:0 auto;padding:32px;text-align:center;">
  <div style="font-size:24px;font-weight:800;color:#fff;margin-bottom:32px;">Pay<span style="color:#f59e0b;">backer</span></div>
  <div style="width:64px;height:64px;border-radius:50%;background:${c.bg}20;border:2px solid ${c.bg};display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:28px;color:${c.text};">${c.icon}</div>
  <h1 style="color:#fff;font-size:24px;margin:0 0 12px;">${title}</h1>
  <p style="color:#94a3b8;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
  <a href="/dashboard/admin" style="display:inline-block;margin-top:24px;color:#f59e0b;font-size:14px;text-decoration:none;">Go to Admin Dashboard &rarr;</a>
</div></body></html>`;
}
