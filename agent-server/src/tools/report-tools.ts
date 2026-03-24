import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

export const saveReport = tool(
  'save_report',
  'Save your analysis report to the database. This is your primary output each run. Other agents (especially Charlie the EA) will read your reports.',
  {
    title: z.string().describe('Report title'),
    content: z.string().describe('Full report content'),
    data: z.record(z.string(), z.any()).default({}).describe('Structured metrics/data as key-value pairs'),
    recommendations: z.array(z.string()).default([]).describe('Actionable recommendations'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    // Look up agent_id from ai_executives
    const { data: agent } = await sb.from('ai_executives')
      .select('id')
      .eq('role', agentRole)
      .single();

    if (!agent) {
      return { content: [{ type: 'text' as const, text: `Agent role "${agentRole}" not found in ai_executives table.` }], isError: true };
    }

    const { data, error } = await sb.from('executive_reports').insert({
      agent_id: agent.id,
      report_type: agentRole,
      title: args.title,
      content: args.content,
      data: args.data,
      recommendations: args.recommendations,
      status: 'draft',
    }).select('id').single();

    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to save report: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Report saved (id: ${data.id}): "${args.title}"` }] };
  }
);

export const saveActionItem = tool(
  'save_action_item',
  'Flag an action item for yourself, another agent, or a human to address. Action items are visible to Charlie (EA) who includes them in the founder briefing.',
  {
    title: z.string().describe('Action item title'),
    description: z.string().describe('Detailed description'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    category: z.enum(['finance', 'technical', 'operations', 'marketing', 'support', 'compliance', 'growth']).default('operations'),
    assigned_to: z.string().default('human').describe('Agent role or "human"'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();

    const { data, error } = await sb.from('agent_action_items').insert({
      flagged_by: agentRole,
      assigned_to: args.assigned_to,
      title: args.title,
      description: args.description,
      priority: args.priority,
      category: args.category,
    }).select('id').single();

    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to save action item: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Action item flagged (id: ${data.id}): "${args.title}" - assigned to ${args.assigned_to}` }] };
  }
);

export const proposeImprovement = tool(
  'propose_improvement',
  'Suggest a system improvement that requires founder approval. Config/prompt/schedule changes auto-execute on approval. Code changes create GitHub issues.',
  {
    title: z.string().describe('Proposal title'),
    description: z.string().describe('What and why'),
    implementation: z.string().describe('How to implement'),
    category: z.enum(['config', 'code', 'data', 'prompt', 'schedule', 'feature', 'bugfix', 'infrastructure']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    estimated_impact: z.string().describe('Expected business impact'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'unknown';
    const sb = getSupabase();
    const approvalToken = crypto.randomUUID();

    const { data, error } = await sb.from('improvement_proposals').insert({
      proposed_by: agentRole,
      title: args.title,
      description: args.description,
      implementation: args.implementation,
      category: args.category,
      priority: args.priority,
      estimated_impact: args.estimated_impact,
      approval_token: approvalToken,
    }).select('id').single();

    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to create proposal: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Proposal created (id: ${data.id}, token: ${approvalToken}): "${args.title}". Send an approval email to get founder sign-off.` }] };
  }
);

export const getRecentReports = tool(
  'get_recent_reports',
  'Get recent reports from other agents. Useful for understanding what other agents have found and coordinating your analysis.',
  {
    agent_role: z.string().optional().describe('Filter by specific agent role. Omit for all agents.'),
    hours: z.number().default(24).describe('How many hours back to look'),
    limit: z.number().max(10).default(5),
  },
  async (args) => {
    const sb = getSupabase();
    const since = new Date(Date.now() - args.hours * 60 * 60 * 1000).toISOString();

    let query = sb.from('executive_reports')
      .select('report_type, title, content, data, recommendations, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(args.limit);

    if (args.agent_role) {
      query = query.eq('report_type', args.agent_role);
    }

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: 'text' as const, text: `Failed to get reports: ${error.message}` }], isError: true };
    }

    if (!data || data.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No recent reports found.' }] };
    }

    const formatted = data.map(r =>
      `[${r.report_type}] ${r.title}\n${r.content}\nRecommendations: ${(r.recommendations || []).join('; ') || 'none'}`
    ).join('\n\n---\n\n');

    return { content: [{ type: 'text' as const, text: formatted }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const reportTools = [saveReport, saveActionItem, proposeImprovement, getRecentReports];
