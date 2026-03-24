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

const saveMemory: ToolDef = {
  name: 'save_memory',
  description: 'Save a persistent memory that will be available in future runs. Use this to record learnings, decisions, outcomes, and patterns you discover. Higher importance memories are loaded first.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 100, description: 'Short title for the memory' },
      content: { type: 'string', maxLength: 1000, description: 'The memory content - what you learned or decided' },
      memory_type: { type: 'string', enum: ['learning', 'decision', 'context', 'user_feedback', 'action_result'], description: 'Type of memory' },
      importance: { type: 'number', minimum: 1, maximum: 10, default: 5, description: 'Importance 1-10. 10 = critical learning, 1 = minor context' },
      tags: { type: 'array', items: { type: 'string' }, default: [], description: 'Tags for categorisation' },
      expires_in_days: { type: 'number', description: 'Auto-expire after N days. Omit for permanent memory' },
    },
    required: ['title', 'content', 'memory_type'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    const record: Record<string, any> = {
      agent_role: agentRole,
      title: args.title,
      content: args.content,
      memory_type: args.memory_type,
      importance: args.importance ?? 5,
      tags: args.tags || [],
      source: 'self',
    };

    if (args.expires_in_days) {
      const expires = new Date();
      expires.setDate(expires.getDate() + args.expires_in_days);
      record.expires_at = expires.toISOString();
    }

    const { data, error } = await sb.from('agent_memory').insert(record).select('id').single();
    if (error) {
      return `Failed to save memory: ${error.message}`;
    }
    return `Memory saved (id: ${data.id}): "${args.title}"`;
  },
};

const recallMemories: ToolDef = {
  name: 'recall_memories',
  description: 'Recall your persistent memories. Retrieves memories ordered by importance and recency. Use at the start of each run to load your accumulated knowledge.',
  schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Filter by topic keyword in title/content' },
      memory_type: { type: 'string', enum: ['learning', 'decision', 'context', 'user_feedback', 'action_result'] },
      limit: { type: 'number', maximum: 20, default: 10, description: 'Number of memories to recall' },
    },
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    let query = sb.from('agent_memory')
      .select('id, title, content, memory_type, importance, tags, access_count, created_at')
      .eq('agent_role', agentRole)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(args.limit || 10);

    if (args.memory_type) {
      query = query.eq('memory_type', args.memory_type);
    }

    if (args.topic) {
      query = query.or(`title.ilike.%${args.topic}%,content.ilike.%${args.topic}%`);
    }

    // Filter expired
    query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

    const { data, error } = await query;
    if (error) {
      return `Failed to recall: ${error.message}`;
    }

    // Update access counts
    if (data && data.length > 0) {
      const ids = data.map(m => m.id);
      await sb.from('agent_memory')
        .update({ last_accessed_at: new Date().toISOString() })
        .in('id', ids);
      // Increment access count separately to avoid race conditions
      for (const m of data) {
        await sb.from('agent_memory')
          .update({ access_count: (m.access_count || 0) + 1 })
          .eq('id', m.id);
      }
    }

    if (!data || data.length === 0) {
      return 'No memories found.';
    }

    const formatted = data.map(m =>
      `[${m.memory_type}] (importance: ${m.importance}) ${m.title}\n  ${m.content}\n  Tags: ${(m.tags || []).join(', ') || 'none'} | Created: ${m.created_at}`
    ).join('\n\n');

    return `${data.length} memories recalled:\n\n${formatted}`;
  },
};

const setGoal: ToolDef = {
  name: 'set_goal',
  description: 'Set a measurable goal for yourself. Goals help you track progress and learn from outcomes. Set specific, measurable objectives with clear deadlines.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Goal title (e.g. "Reduce avg support response time to under 30 minutes")' },
      success_criteria: { type: 'string', description: 'How will you know this goal is achieved?' },
      metric_name: { type: 'string', description: 'Metric to track (e.g. "avg_response_time_minutes")' },
      target_value: { type: 'number', description: 'Target metric value' },
      baseline_value: { type: 'number', description: 'Current metric value (starting point)' },
      deadline_days: { type: 'number', minimum: 1, maximum: 90, description: 'Days from now until deadline' },
    },
    required: ['title', 'success_criteria', 'deadline_days'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + args.deadline_days);

    const { data, error } = await sb.from('agent_goals').insert({
      agent_role: agentRole,
      title: args.title,
      success_criteria: args.success_criteria,
      metric_name: args.metric_name,
      target_value: args.target_value,
      baseline_value: args.baseline_value,
      current_value: args.baseline_value,
      deadline: deadline.toISOString(),
    }).select('id').single();

    if (error) {
      return `Failed to set goal: ${error.message}`;
    }
    return `Goal set (id: ${data.id}): "${args.title}" - deadline: ${deadline.toLocaleDateString('en-GB')}`;
  },
};

const updateGoal: ToolDef = {
  name: 'update_goal',
  description: 'Update progress on one of your active goals. Record current metric value and progress notes.',
  schema: {
    type: 'object',
    properties: {
      goal_id: { type: 'string', format: 'uuid', description: 'Goal ID to update' },
      current_value: { type: 'number', description: 'Current metric value' },
      progress_note: { type: 'string', description: 'What progress has been made?' },
    },
    required: ['goal_id', 'progress_note'],
  },
  handler: async (args) => {
    const sb = getSupabase();

    const { data: goal } = await sb.from('agent_goals').select('progress_notes').eq('id', args.goal_id).single();
    const notes = goal?.progress_notes || [];
    notes.push({ date: new Date().toISOString(), note: args.progress_note, value: args.current_value });

    const update: Record<string, any> = { progress_notes: notes };
    if (args.current_value !== undefined) update.current_value = args.current_value;

    const { error } = await sb.from('agent_goals').update(update).eq('id', args.goal_id);
    if (error) {
      return `Failed to update goal: ${error.message}`;
    }
    return `Goal updated with progress note.`;
  },
};

const evaluateGoal: ToolDef = {
  name: 'evaluate_goal',
  description: 'Evaluate a goal that has reached its deadline. Record the outcome and what you learned.',
  schema: {
    type: 'object',
    properties: {
      goal_id: { type: 'string', format: 'uuid', description: 'Goal ID to evaluate' },
      status: { type: 'string', enum: ['completed', 'failed', 'abandoned'], description: 'Final goal status' },
      outcome: { type: 'string', description: 'What actually happened?' },
      learnings: { type: 'string', description: 'What did you learn from this goal?' },
    },
    required: ['goal_id', 'status', 'outcome', 'learnings'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    const { error } = await sb.from('agent_goals').update({
      status: args.status,
      outcome: args.outcome,
      learnings: args.learnings,
      completed_at: new Date().toISOString(),
    }).eq('id', args.goal_id);

    if (error) {
      return `Failed to evaluate goal: ${error.message}`;
    }
    return `Goal marked as ${args.status}. Learning saved.`;
  },
};

const makePrediction: ToolDef = {
  name: 'make_prediction',
  description: 'Make a testable prediction about the business that can be evaluated later. This builds your prediction track record and helps you calibrate your judgement.',
  schema: {
    type: 'object',
    properties: {
      prediction: { type: 'string', description: 'The specific prediction (e.g. "MRR will reach GBP 500 by Friday")' },
      confidence: { type: 'number', minimum: 1, maximum: 10, description: 'How confident are you? 1=guess, 10=certain' },
      reasoning: { type: 'string', description: 'Why do you believe this?' },
      evaluate_in_days: { type: 'number', minimum: 1, maximum: 30, description: 'Days from now to evaluate this prediction' },
    },
    required: ['prediction', 'confidence', 'reasoning', 'evaluate_in_days'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    const evalDate = new Date();
    evalDate.setDate(evalDate.getDate() + args.evaluate_in_days);

    const { data, error } = await sb.from('agent_predictions').insert({
      agent_role: agentRole,
      prediction: args.prediction,
      confidence: args.confidence,
      reasoning: args.reasoning,
      evaluation_date: evalDate.toISOString(),
    }).select('id').single();

    if (error) {
      return `Failed to save prediction: ${error.message}`;
    }
    return `Prediction recorded (id: ${data.id}). Will be evaluated on ${evalDate.toLocaleDateString('en-GB')}.`;
  },
};

const evaluatePrediction: ToolDef = {
  name: 'evaluate_prediction',
  description: 'Evaluate a prediction that is due. Check what actually happened and record whether you were correct.',
  schema: {
    type: 'object',
    properties: {
      prediction_id: { type: 'string', format: 'uuid', description: 'Prediction ID to evaluate' },
      actual_outcome: { type: 'string', description: 'What actually happened?' },
      was_correct: { type: 'boolean', description: 'Was the prediction correct?' },
      evaluation_notes: { type: 'string', description: 'What did you learn about your prediction accuracy?' },
    },
    required: ['prediction_id', 'actual_outcome', 'was_correct', 'evaluation_notes'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    const { error } = await sb.from('agent_predictions').update({
      actual_outcome: args.actual_outcome,
      was_correct: args.was_correct,
      evaluation_notes: args.evaluation_notes,
      evaluated_at: new Date().toISOString(),
    }).eq('id', args.prediction_id);

    if (error) {
      return `Failed to evaluate prediction: ${error.message}`;
    }
    return `Prediction evaluated: ${args.was_correct ? 'CORRECT' : 'INCORRECT'}`;
  },
};

const recallFeedback: ToolDef = {
  name: 'recall_feedback',
  description: 'Recall recent feedback from the founder (approvals, rejections, direct feedback). Use this to understand what approaches the founder prefers.',
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', maximum: 20, default: 5, description: 'Number of feedback events to recall' },
      unprocessed_only: { type: 'boolean', default: true, description: 'Only show feedback you have not yet incorporated' },
    },
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    let query = sb.from('agent_feedback_events')
      .select('*')
      .eq('agent_role', agentRole)
      .order('created_at', { ascending: false })
      .limit(args.limit ?? 5);

    if (args.unprocessed_only !== false) {
      query = query.eq('processed', false);
    }

    const { data, error } = await query;
    if (error) {
      return `Failed to recall feedback: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return 'No feedback events found.';
    }

    const formatted = data.map((f: any) =>
      `[${f.event_type}] ${f.feedback_content || 'No details'} (impact: ${f.impact_score || 'unrated'}) - ${f.created_at}`
    ).join('\n');

    return `${data.length} feedback events:\n${formatted}`;
  },
};

const markFeedbackProcessed: ToolDef = {
  name: 'mark_feedback_processed',
  description: 'Mark feedback events as processed after you have incorporated the learning into your behaviour.',
  schema: {
    type: 'object',
    properties: {
      feedback_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Feedback event IDs to mark as processed' },
    },
    required: ['feedback_ids'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    const { error } = await sb.from('agent_feedback_events')
      .update({ processed: true })
      .in('id', args.feedback_ids);

    if (error) {
      return `Failed to mark feedback: ${error.message}`;
    }
    return `${args.feedback_ids.length} feedback events marked as processed.`;
  },
};

export const memoryTools: ToolDef[] = [
  saveMemory, recallMemories,
  setGoal, updateGoal, evaluateGoal,
  makePrediction, evaluatePrediction,
  recallFeedback, markFeedbackProcessed,
];
