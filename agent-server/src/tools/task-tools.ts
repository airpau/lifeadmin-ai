import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

const createTaskForAgent: ToolDef = {
  name: 'create_task_for_agent',
  description: 'Create a task and assign it to another agent. The assigned agent will pick it up on their next scheduled run. Use this for cross-functional collaboration.',
  schema: {
    type: 'object',
    properties: {
      assigned_to: { type: 'string', description: 'Agent role to assign to (e.g. "cto", "cmo", "support_lead")' },
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Detailed task description with context' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      category: { type: 'string', enum: ['finance', 'technical', 'operations', 'marketing', 'content', 'support', 'compliance', 'growth', 'retention', 'intelligence', 'experience', 'fraud'], default: 'operations' },
      due_in_hours: { type: 'number', description: 'Hours from now until due' },
    },
    required: ['assigned_to', 'title', 'description'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    const record: Record<string, any> = {
      created_by: agentRole,
      assigned_to: args.assigned_to,
      title: args.title,
      description: args.description,
      priority: args.priority || 'medium',
      category: args.category || 'operations',
      notes: [{ agent_role: agentRole, note: `Task created: ${args.description}`, timestamp: new Date().toISOString() }],
    };

    if (args.due_in_hours) {
      const due = new Date();
      due.setHours(due.getHours() + args.due_in_hours);
      record.due_by = due.toISOString();
    }

    const { data, error } = await sb.from('agent_tasks').insert(record).select('id').single();
    if (error) {
      return `Failed to create task: ${error.message}`;
    }

    // Trigger the assigned agent to run immediately
    try {
      const { triggerAgentNow } = await import('../scheduler');
      triggerAgentNow(args.assigned_to);
    } catch {}

    return `Task created for ${args.assigned_to} (id: ${data.id}): "${args.title}" - they will pick it up immediately.`;
  },
};

const getMyTasks: ToolDef = {
  name: 'get_my_tasks',
  description: 'Get tasks assigned to you. Check this at the start of each run to see what other agents need from you.',
  schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'in_progress', 'all'], default: 'pending', description: 'Filter by status' },
      limit: { type: 'number', maximum: 10, default: 5 },
    },
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    let query = sb.from('agent_tasks')
      .select('id, created_by, title, description, priority, category, status, notes, due_by, created_at')
      .eq('assigned_to', agentRole)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(args.limit || 5);

    const status = args.status || 'pending';
    if (status !== 'all') {
      query = query.eq('status', status);
    } else {
      query = query.in('status', ['pending', 'in_progress']);
    }

    const { data, error } = await query;
    if (error) {
      return `Failed to get tasks: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return 'No pending tasks assigned to you.';
    }

    const formatted = data.map(t => {
      const notes = (t.notes || []).map((n: any) => `    - ${n.agent_role}: ${n.note}`).join('\n');
      return `[${t.priority}] ${t.title} (from: ${t.created_by}, status: ${t.status})\n  ${t.description}\n  Due: ${t.due_by || 'no deadline'}\n  Notes:\n${notes || '    (none)'}`;
    }).join('\n\n');

    return `${data.length} tasks:\n\n${formatted}`;
  },
};

const completeTask: ToolDef = {
  name: 'complete_task',
  description: 'Mark a task as completed with a result description. The creating agent will see your result.',
  schema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', format: 'uuid', description: 'Task ID to complete' },
      result: { type: 'string', description: 'What you did and what the outcome was' },
      create_follow_up: { type: 'boolean', default: false, description: 'Should a follow-up task be created?' },
      follow_up_for: { type: 'string', description: 'Agent role for follow-up task' },
      follow_up_title: { type: 'string', description: 'Follow-up task title' },
      follow_up_description: { type: 'string', description: 'Follow-up task description' },
    },
    required: ['task_id', 'result'],
  },
  handler: async (args, agentRole) => {
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
      return `Failed to complete task: ${error.message}`;
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

    return `Task completed. Result: "${args.result}"`;
  },
};

const addTaskNote: ToolDef = {
  name: 'add_task_note',
  description: 'Add a progress note to a task. Use this when you are working on a task but not yet done.',
  schema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', format: 'uuid', description: 'Task ID' },
      note: { type: 'string', description: 'Progress note' },
      new_status: { type: 'string', enum: ['in_progress', 'blocked'], description: 'Optionally update status' },
    },
    required: ['task_id', 'note'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    const { data: task } = await sb.from('agent_tasks').select('notes').eq('id', args.task_id).single();
    const notes = task?.notes || [];
    notes.push({ agent_role: agentRole, note: args.note, timestamp: new Date().toISOString() });

    const update: Record<string, any> = { notes };
    if (args.new_status) update.status = args.new_status;
    if (args.new_status === 'in_progress') update.started_at = new Date().toISOString();

    const { error } = await sb.from('agent_tasks').update(update).eq('id', args.task_id);
    if (error) {
      return `Failed to add note: ${error.message}`;
    }
    return `Note added to task.`;
  },
};

export const taskTools: ToolDef[] = [createTaskForAgent, getMyTasks, completeTask, addTaskNote];
