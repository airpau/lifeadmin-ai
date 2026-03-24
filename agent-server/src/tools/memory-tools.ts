import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

export const saveMemory = tool(
  'save_memory',
  'Save a persistent memory that will be available in future runs. Use this to record learnings, decisions, outcomes, and patterns you discover. Higher importance memories are loaded first.',
  {
    title: z.string().max(100).describe('Short title for the memory'),
    content: z.string().max(1000).describe('The memory content - what you learned or decided'),
    memory_type: z.enum(['learning', 'decision', 'context', 'user_feedback', 'action_result']).describe('Type of memory'),
    importance: z.number().min(1).max(10).default(5).describe('Importance 1-10. 10 = critical learning, 1 = minor context'),
    tags: z.array(z.string()).default([]).describe('Tags for categorisation'),
    expires_in_days: z.number().optional().describe('Auto-expire after N days. Omit for permanent memory'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    const record: Record<string, any> = {
      agent_role: agentRole,
      title: args.title,
      content: args.content,
      memory_type: args.memory_type,
      importance: args.importance,
      tags: args.tags,
      source: 'self',
    };

    if (args.expires_in_days) {
      const expires = new Date();
      expires.setDate(expires.getDate() + args.expires_in_days);
      record.expires_at = expires.toISOString();
    }

    const { data, error } = await sb.from('agent_memory').insert(record).select('id').single();
    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to save memory: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Memory saved (id: ${data.id}): "${args.title}"` }] };
  }
);

export const recallMemories = tool(
  'recall_memories',
  'Recall your persistent memories. Retrieves memories ordered by importance and recency. Use at the start of each run to load your accumulated knowledge.',
  {
    topic: z.string().optional().describe('Filter by topic keyword in title/content'),
    memory_type: z.enum(['learning', 'decision', 'context', 'user_feedback', 'action_result']).optional(),
    limit: z.number().max(20).default(10).describe('Number of memories to recall'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    let query = sb.from('agent_memory')
      .select('id, title, content, memory_type, importance, tags, access_count, created_at')
      .eq('agent_role', agentRole)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(args.limit);

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
      return { content: [{ type: 'text' as const, text: `Failed to recall: ${error.message}` }], isError: true };
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
      return { content: [{ type: 'text' as const, text: 'No memories found.' }] };
    }

    const formatted = data.map(m =>
      `[${m.memory_type}] (importance: ${m.importance}) ${m.title}\n  ${m.content}\n  Tags: ${(m.tags || []).join(', ') || 'none'} | Created: ${m.created_at}`
    ).join('\n\n');

    return { content: [{ type: 'text' as const, text: `${data.length} memories recalled:\n\n${formatted}` }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const setGoal = tool(
  'set_goal',
  'Set a measurable goal for yourself. Goals help you track progress and learn from outcomes. Set specific, measurable objectives with clear deadlines.',
  {
    title: z.string().describe('Goal title (e.g. "Reduce avg support response time to under 30 minutes")'),
    success_criteria: z.string().describe('How will you know this goal is achieved?'),
    metric_name: z.string().optional().describe('Metric to track (e.g. "avg_response_time_minutes")'),
    target_value: z.number().optional().describe('Target metric value'),
    baseline_value: z.number().optional().describe('Current metric value (starting point)'),
    deadline_days: z.number().min(1).max(90).describe('Days from now until deadline'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
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
      return { content: [{ type: 'text' as const, text: `Failed to set goal: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Goal set (id: ${data.id}): "${args.title}" - deadline: ${deadline.toLocaleDateString('en-GB')}` }] };
  }
);

export const updateGoal = tool(
  'update_goal',
  'Update progress on one of your active goals. Record current metric value and progress notes.',
  {
    goal_id: z.string().uuid().describe('Goal ID to update'),
    current_value: z.number().optional().describe('Current metric value'),
    progress_note: z.string().describe('What progress has been made?'),
  },
  async (args) => {
    const sb = getSupabase();

    const { data: goal } = await sb.from('agent_goals').select('progress_notes').eq('id', args.goal_id).single();
    const notes = goal?.progress_notes || [];
    notes.push({ date: new Date().toISOString(), note: args.progress_note, value: args.current_value });

    const update: Record<string, any> = { progress_notes: notes };
    if (args.current_value !== undefined) update.current_value = args.current_value;

    const { error } = await sb.from('agent_goals').update(update).eq('id', args.goal_id);
    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to update goal: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Goal updated with progress note.` }] };
  }
);

export const evaluateGoal = tool(
  'evaluate_goal',
  'Evaluate a goal that has reached its deadline. Record the outcome and what you learned.',
  {
    goal_id: z.string().uuid().describe('Goal ID to evaluate'),
    status: z.enum(['completed', 'failed', 'abandoned']).describe('Final goal status'),
    outcome: z.string().describe('What actually happened?'),
    learnings: z.string().describe('What did you learn from this goal?'),
  },
  async (args) => {
    const sb = getSupabase();
    const { error } = await sb.from('agent_goals').update({
      status: args.status,
      outcome: args.outcome,
      learnings: args.learnings,
      completed_at: new Date().toISOString(),
    }).eq('id', args.goal_id);

    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to evaluate goal: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Goal marked as ${args.status}. Learning saved.` }] };
  }
);

export const makePrediction = tool(
  'make_prediction',
  'Make a testable prediction about the business that can be evaluated later. This builds your prediction track record and helps you calibrate your judgement.',
  {
    prediction: z.string().describe('The specific prediction (e.g. "MRR will reach GBP 500 by Friday")'),
    confidence: z.number().min(1).max(10).describe('How confident are you? 1=guess, 10=certain'),
    reasoning: z.string().describe('Why do you believe this?'),
    evaluate_in_days: z.number().min(1).max(30).describe('Days from now to evaluate this prediction'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
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
      return { content: [{ type: 'text' as const, text: `Failed to save prediction: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Prediction recorded (id: ${data.id}). Will be evaluated on ${evalDate.toLocaleDateString('en-GB')}.` }] };
  }
);

export const evaluatePrediction = tool(
  'evaluate_prediction',
  'Evaluate a prediction that is due. Check what actually happened and record whether you were correct.',
  {
    prediction_id: z.string().uuid().describe('Prediction ID to evaluate'),
    actual_outcome: z.string().describe('What actually happened?'),
    was_correct: z.boolean().describe('Was the prediction correct?'),
    evaluation_notes: z.string().describe('What did you learn about your prediction accuracy?'),
  },
  async (args) => {
    const sb = getSupabase();
    const { error } = await sb.from('agent_predictions').update({
      actual_outcome: args.actual_outcome,
      was_correct: args.was_correct,
      evaluation_notes: args.evaluation_notes,
      evaluated_at: new Date().toISOString(),
    }).eq('id', args.prediction_id);

    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to evaluate prediction: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Prediction evaluated: ${args.was_correct ? 'CORRECT' : 'INCORRECT'}` }] };
  }
);

export const recallFeedback = tool(
  'recall_feedback',
  'Recall recent feedback from the founder (approvals, rejections, direct feedback). Use this to understand what approaches the founder prefers.',
  {
    limit: z.number().max(20).default(5).describe('Number of feedback events to recall'),
    unprocessed_only: z.boolean().default(true).describe('Only show feedback you have not yet incorporated'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    let query = sb.from('agent_feedback_events')
      .select('*')
      .eq('agent_role', agentRole)
      .order('created_at', { ascending: false })
      .limit(args.limit);

    if (args.unprocessed_only) {
      query = query.eq('processed', false);
    }

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to recall feedback: ${error.message}` }], isError: true };
    }

    if (!data || data.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No feedback events found.' }] };
    }

    const formatted = data.map(f =>
      `[${f.event_type}] ${f.feedback_content || 'No details'} (impact: ${f.impact_score || 'unrated'}) - ${f.created_at}`
    ).join('\n');

    return { content: [{ type: 'text' as const, text: `${data.length} feedback events:\n${formatted}` }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const markFeedbackProcessed = tool(
  'mark_feedback_processed',
  'Mark feedback events as processed after you have incorporated the learning into your behaviour.',
  {
    feedback_ids: z.array(z.string().uuid()).describe('Feedback event IDs to mark as processed'),
  },
  async (args) => {
    const sb = getSupabase();
    const { error } = await sb.from('agent_feedback_events')
      .update({ processed: true })
      .in('id', args.feedback_ids);

    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to mark feedback: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `${args.feedback_ids.length} feedback events marked as processed.` }] };
  }
);

export const memoryTools = [
  saveMemory, recallMemories,
  setGoal, updateGoal, evaluateGoal,
  makePrediction, evaluatePrediction,
  recallFeedback, markFeedbackProcessed,
];
