/**
 * Agent Workflow Engine
 *
 * Enables agents to:
 * 1. Create tasks for other agents
 * 2. Pick up and work on assigned tasks
 * 3. Add notes and collaborate on tasks
 * 4. Report completed work back to the founder
 *
 * This runs as part of the cron cycle. Each time an agent runs,
 * it also checks for pending tasks assigned to it and works on them.
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { resend, FROM_EMAIL } from '@/lib/resend';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY,
});

interface AgentTask {
  id: string;
  created_by: string;
  assigned_to: string;
  title: string;
  description: string;
  priority: string;
  category: string;
  status: string;
  notes: Array<{ agent_role: string; note: string; timestamp: string }>;
}

/**
 * Create a task for another agent. Called by any agent during their run.
 */
export async function createAgentTask(params: {
  createdBy: string;
  assignedTo: string;
  title: string;
  description: string;
  priority?: string;
  category?: string;
  sourceMeetingId?: string;
  sourceReportId?: string;
  dueBy?: string;
}): Promise<string | null> {
  const supabase = getAdmin();

  const { data, error } = await supabase.from('agent_tasks').insert({
    created_by: params.createdBy,
    assigned_to: params.assignedTo,
    title: params.title,
    description: params.description,
    priority: params.priority || 'medium',
    category: params.category || 'operations',
    source_meeting_id: params.sourceMeetingId || null,
    source_report_id: params.sourceReportId || null,
    due_by: params.dueBy || null,
  }).select('id').single();

  if (error) {
    console.error(`[agent-workflow] Failed to create task: ${error.message}`);
    return null;
  }

  console.log(`[agent-workflow] ${params.createdBy} assigned task to ${params.assignedTo}: ${params.title}`);
  return data.id;
}

/**
 * Add a note to an existing task. Used for collaboration between agents.
 */
export async function addTaskNote(taskId: string, agentRole: string, note: string): Promise<void> {
  const supabase = getAdmin();

  const { data: task } = await supabase.from('agent_tasks')
    .select('notes').eq('id', taskId).single();

  const existingNotes = task?.notes || [];
  existingNotes.push({
    agent_role: agentRole,
    note,
    timestamp: new Date().toISOString(),
  });

  await supabase.from('agent_tasks').update({ notes: existingNotes }).eq('id', taskId);
}

/**
 * Process pending tasks for a specific agent. Called during the agent's cron run.
 * The agent uses Claude to decide how to handle each task.
 */
export async function processAgentTasks(
  agentRole: string,
  agentName: string,
  systemPrompt: string
): Promise<{ processed: number; results: string[] }> {
  const supabase = getAdmin();

  // Get pending tasks for this agent
  const { data: tasks } = await supabase.from('agent_tasks')
    .select('*')
    .eq('assigned_to', agentRole)
    .in('status', ['pending', 'in_progress'])
    .order('priority', { ascending: true })  // urgent first
    .limit(3);  // max 3 tasks per run to control costs

  if (!tasks || tasks.length === 0) {
    return { processed: 0, results: [] };
  }

  const results: string[] = [];

  for (const task of tasks) {
    // Mark as in progress
    await supabase.from('agent_tasks').update({
      status: 'in_progress',
      started_at: task.started_at || new Date().toISOString(),
    }).eq('id', task.id);

    // Load agent's relevant memories
    const { data: memories } = await supabase.from('agent_memory')
      .select('title, content')
      .eq('agent_role', agentRole)
      .order('importance', { ascending: false })
      .limit(3);

    const memoryContext = memories && memories.length > 0
      ? `\nYour relevant memories:\n${memories.map(m => `- ${m.title}: ${m.content}`).join('\n')}`
      : '';

    // Previous notes on this task
    const notesContext = (task.notes || []).length > 0
      ? `\nPrevious notes on this task:\n${(task.notes as any[]).map(n => `- ${n.agent_role} (${n.timestamp}): ${n.note}`).join('\n')}`
      : '';

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `You have been assigned a task by ${task.created_by}:

Title: ${task.title}
Description: ${task.description}
Priority: ${task.priority}
Category: ${task.category}
${notesContext}${memoryContext}

Work on this task. Return a JSON object:
{
  "status": "completed" or "blocked",
  "result": "what you did and the outcome",
  "follow_up_tasks": [{"assigned_to": "agent_role", "title": "task", "description": "details"}],
  "memory": "key learning to remember from this task (or null)"
}

If you need another agent to do something, include it in follow_up_tasks. If the task requires human approval or code changes, set status to "blocked" and explain why.`,
        }],
      });

      const text = response.content[0];
      if (text.type !== 'text') continue;

      let raw = text.text.trim();
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const match = raw.match(/\{[\s\S]*\}/);

      if (match) {
        const parsed = JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));

        // Update task status
        await supabase.from('agent_tasks').update({
          status: parsed.status === 'completed' ? 'completed' : parsed.status === 'blocked' ? 'blocked' : 'in_progress',
          result: parsed.result || '',
          completed_at: parsed.status === 'completed' ? new Date().toISOString() : null,
        }).eq('id', task.id);

        // Create follow-up tasks for other agents
        if (parsed.follow_up_tasks && Array.isArray(parsed.follow_up_tasks)) {
          for (const ft of parsed.follow_up_tasks) {
            await createAgentTask({
              createdBy: agentRole,
              assignedTo: ft.assigned_to,
              title: ft.title,
              description: ft.description,
              priority: task.priority,
              category: task.category,
            });
          }
        }

        // Save learning to memory
        if (parsed.memory) {
          await supabase.from('agent_memory').insert({
            agent_role: agentRole,
            memory_type: 'action_result',
            title: `Task result: ${task.title.substring(0, 60)}`,
            content: parsed.memory,
            importance: 6,
          });
        }

        results.push(`${task.title}: ${parsed.status} - ${(parsed.result || '').substring(0, 100)}`);
      }
    } catch (err: any) {
      console.error(`[agent-workflow] ${agentRole} failed on task ${task.id}: ${err.message}`);
      await addTaskNote(task.id, agentRole, `Failed to process: ${err.message}`);
      results.push(`${task.title}: failed - ${err.message}`);
    }
  }

  return { processed: results.length, results };
}

/**
 * Send a daily workflow digest to the founder showing all task activity.
 */
export async function sendWorkflowDigest(): Promise<void> {
  const supabase = getAdmin();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [completed, inProgress, blocked] = await Promise.all([
    supabase.from('agent_tasks').select('title, created_by, assigned_to, result')
      .eq('status', 'completed').gte('completed_at', yesterday).limit(20),
    supabase.from('agent_tasks').select('title, created_by, assigned_to')
      .eq('status', 'in_progress').limit(10),
    supabase.from('agent_tasks').select('title, created_by, assigned_to, result')
      .eq('status', 'blocked').limit(10),
  ]);

  const completedCount = completed.data?.length || 0;
  const inProgressCount = inProgress.data?.length || 0;
  const blockedCount = blocked.data?.length || 0;

  if (completedCount === 0 && inProgressCount === 0 && blockedCount === 0) return;

  const completedHtml = (completed.data || []).map(t =>
    `<li style="color:#94a3b8;margin-bottom:4px;"><strong style="color:#22c55e;">${t.assigned_to}</strong> completed "${t.title}" (assigned by ${t.created_by})</li>`
  ).join('');

  const blockedHtml = (blocked.data || []).map(t =>
    `<li style="color:#94a3b8;margin-bottom:4px;"><strong style="color:#ef4444;">${t.assigned_to}</strong> blocked on "${t.title}": ${(t.result || '').substring(0, 100)}</li>`
  ).join('');

  const inProgressHtml = (inProgress.data || []).map(t =>
    `<li style="color:#94a3b8;margin-bottom:4px;"><strong style="color:#f59e0b;">${t.assigned_to}</strong> working on "${t.title}" (from ${t.created_by})</li>`
  ).join('');

  await resend.emails.send({
    from: FROM_EMAIL,
    to: 'hello@paybacker.co.uk',
    subject: `[Agent Workflow] ${completedCount} completed, ${inProgressCount} in progress, ${blockedCount} blocked`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
      <h1 style="color:#f59e0b;font-size:20px;margin:0 0 16px;">Agent Workflow Update</h1>
      ${completedCount > 0 ? `<h3 style="color:#22c55e;font-size:14px;">Completed (${completedCount})</h3><ul style="padding-left:20px;">${completedHtml}</ul>` : ''}
      ${inProgressCount > 0 ? `<h3 style="color:#f59e0b;font-size:14px;">In Progress (${inProgressCount})</h3><ul style="padding-left:20px;">${inProgressHtml}</ul>` : ''}
      ${blockedCount > 0 ? `<h3 style="color:#ef4444;font-size:14px;">Blocked - Needs Human (${blockedCount})</h3><ul style="padding-left:20px;">${blockedHtml}</ul>` : ''}
      <p style="color:#475569;font-size:11px;margin-top:24px;">Paybacker AI Workflow Engine</p>
    </div>`,
  }).catch(() => {});
}
