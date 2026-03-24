import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Process a feedback event from the Vercel app (proposal approved/rejected, etc.)
 * This creates a feedback event record and an automatic learning memory for the agent.
 */
export async function processFeedback(params: {
  agentRole: string;
  eventType: string;
  sourceId?: string;
  feedbackContent?: string;
  impactScore?: number;
}): Promise<void> {
  const sb = getSupabase();

  // Save feedback event
  await sb.from('agent_feedback_events').insert({
    agent_role: params.agentRole,
    event_type: params.eventType,
    source_id: params.sourceId,
    feedback_content: params.feedbackContent,
    impact_score: params.impactScore || 5,
  });

  // Auto-create a memory for the agent based on feedback type
  const memoryContent = buildFeedbackMemory(params.eventType, params.feedbackContent);
  if (memoryContent) {
    await sb.from('agent_memory').insert({
      agent_role: params.agentRole,
      memory_type: 'user_feedback',
      title: `Founder ${params.eventType.replace('_', ' ')}`,
      content: memoryContent,
      importance: params.eventType.includes('rejected') ? 8 : 6, // Rejections are more important to learn from
      source: 'feedback_system',
      source_id: params.sourceId,
      tags: ['founder_feedback', params.eventType],
    });
  }

  console.log(`[Feedback] ${params.eventType} for ${params.agentRole}: ${params.feedbackContent || 'no details'}`);
}

function buildFeedbackMemory(eventType: string, content?: string): string {
  const details = content ? `: ${content}` : '';
  switch (eventType) {
    case 'proposal_approved':
      return `The founder APPROVED my proposal${details}. This type of suggestion is valued. Continue making similar recommendations.`;
    case 'proposal_rejected':
      return `The founder REJECTED my proposal${details}. I need to reconsider this type of recommendation. Either the timing was wrong, the approach was off, or it was not a priority.`;
    case 'content_approved':
      return `The founder APPROVED my content${details}. This content style and topic resonates well.`;
    case 'content_rejected':
      return `The founder REJECTED my content${details}. I need to adjust my content strategy.`;
    case 'action_acknowledged':
      return `The founder acknowledged my action item${details}. Keep flagging similar issues.`;
    case 'action_overridden':
      return `The founder overrode my action item${details}. My assessment was incorrect. Recalibrate.`;
    case 'direct_feedback':
      return `Direct feedback from founder${details}. Incorporate this into future behaviour.`;
    default:
      return `Feedback event: ${eventType}${details}`;
  }
}

/**
 * Get a summary of feedback patterns for an agent (for reporting)
 */
export async function getFeedbackSummary(agentRole: string): Promise<{
  approvalRate: number;
  totalEvents: number;
  recentRejections: string[];
}> {
  const sb = getSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await sb.from('agent_feedback_events')
    .select('event_type, feedback_content')
    .eq('agent_role', agentRole)
    .gte('created_at', thirtyDaysAgo);

  if (!events || events.length === 0) {
    return { approvalRate: 0, totalEvents: 0, recentRejections: [] };
  }

  const approvals = events.filter(e => e.event_type.includes('approved') || e.event_type.includes('acknowledged'));
  const rejections = events.filter(e => e.event_type.includes('rejected') || e.event_type.includes('overridden'));

  return {
    approvalRate: Math.round((approvals.length / events.length) * 100),
    totalEvents: events.length,
    recentRejections: rejections.slice(0, 5).map(r => r.feedback_content || 'No details'),
  };
}
