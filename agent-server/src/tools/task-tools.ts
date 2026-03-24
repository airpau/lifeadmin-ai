import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

export const createTaskForAgent = tool(
  'create_task_for_agent',
  'Create a task and assign it to another agent. The assigned agent will pick it up on their next scheduled run. Use this for cross-functional collaboration.',
  {
    assigned_to: z.string().describe('Agent role to assign to (e.g. "cto", "cmo", "support_lead")'),
    title: z.string().describe('Task title'),
    description: z.string().describe('Detailed task description with context'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    category: z.enum(['finance', 'technical', 'operations', 'marketing', 'content', 'support', 'compliance', 'growth', 'retention', 'intelligence', 'experience', 'fraud']).default('operations'),
    due_in_hours: z.number().optional().describe('Hours from now until due'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    const record: Record<string, any> = {
      created_by: agentRole,
      assigned_to: args.assigned_to,
      title: args.title,
      description: args.description,
      priority: args.priority,
      category: args.category,
      notes: [{ agent_role: agentRole, note: `Task created: ${args.description}`, timestamp: new Date().toISOString() }],
    };

    if (args.due_in_hours) {
      const due = new Date();
      due.setHours(due.getHours() + args.due_in_hours);
      record.due_by = due.toISOString();
    }

    const { data, error } = await sb.from('agent_tasks').insert(record).select('id').single();
    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to create task: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Task created for ${args.assigned_to} (id: ${data.id}): "${args.title}"` }] };
  }
);

export const getMyTasks = tool(
  'get_my_tasks',
  'Get tasks assigned to you. Check this at the start of each run to see what other agents need from you.',
  {
    status: z.enum(['pending', 'in_progress', 'all']).default('pending').describe('Filter by status'),
    limit: z.number().max(10).default(5),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    let query = sb.from('agent_tasks')
      .select('id, created_by, title, description, priority, category, status, notes, due_by, created_at')
      .eq('assigned_to', agentRole)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(args.limit);

    if (args.status !== 'all') {
      query = query.eq('status', args.status);
    } else {
      query = query.in('status', ['pending', 'in_progress']);
    }

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to get tasks: ${error.message}` }], isError: true };
    }

    if (!data || data.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No pending tasks assigned to you.' }] };
    }

    const formatted = data.map(t => {
      const notes = (t.notes || []).map((n: any) => `    - ${n.agent_role}: ${n.note}`).join('\n');
      return `[${t.priority}] ${t.title} (from: ${t.created_by}, status: ${t.status})\n  ${t.description}\n  Due: ${t.due_by || 'no deadline'}\n  Notes:\n${notes || '    (none)'}`;
    }).join('\n\n');

    return { content: [{ type: 'text' as const, text: `${data.length} tasks:\n\n${formatted}` }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const completeTask = tool(
  'complete_task',
  'Mark a task as completed with a result description. The creating agent will see your result.',
  {
    task_id: z.string().uuid().describe('Task ID to complete'),
    result: z.string().describe('What you did and what the outcome was'),
    create_follow_up: z.boolean().default(false).describe('Should a follow-up task be created?'),
    follow_up_for: z.string().optional().describe('Agent role for follow-up task'),
    follow_up_title: z.string().optional().describe('Follow-up task title'),
    follow_up_description: z.string().optional().describe('Follow-up task description'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    // Get current task to append note
    const { data: task } = await sb.from('agent_tasks').select('notes').eq('id', args.task_id).single();
    const notes = task?.notes || [];
    notes.push({ agent_role: agentRole, note: `Completed: ${args.result}`, timestamp: new Date().toISOString() });

    const { error } = await sb.from('agent_tasks').update({
      status: 'completed',
      result: args.result,
      notes,
      completed_at: new Date().toISOString(),
    }).eq('id', args.task_id);

    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to complete task: ${error.message}` }], isError: true };
    }

    // Create follow-up if requested
    if (args.create_follow_up && args.follow_up_for && args.follow_up_title) {
      await sb.from('agent_tasks').insert({
        created_by: agentRole,
        assigned_to: args.follow_up_for,
        title: args.follow_up_title,
        description: args.follow_up_description || args.follow_up_title,
        notes: [{ agent_role: agentRole, note: `Follow-up from task ${args.task_id}`, timestamp: new Date().toISOString() }],
      });
    }

    return { content: [{ type: 'text' as const, text: `Task completed. Result: "${args.result}"` }] };
  }
);

export const addTaskNote = tool(
  'add_task_note',
  'Add a progress note to a task. Use this when you are working on a task but not yet done.',
  {
    task_id: z.string().uuid().describe('Task ID'),
    note: z.string().describe('Progress note'),
    new_status: z.enum(['in_progress', 'blocked']).optional().describe('Optionally update status'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    const { data: task } = await sb.from('agent_tasks').select('notes').eq('id', args.task_id).single();
    const notes = task?.notes || [];
    notes.push({ agent_role: agentRole, note: args.note, timestamp: new Date().toISOString() });

    const update: Record<string, any> = { notes };
    if (args.new_status) update.status = args.new_status;
    if (args.new_status === 'in_progress') update.started_at = new Date().toISOString();

    const { error } = await sb.from('agent_tasks').update(update).eq('id', args.task_id);
    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to add note: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Note added to task.` }] };
  }
);

export const taskTools = [createTaskForAgent, getMyTasks, completeTask, addTaskNote];
