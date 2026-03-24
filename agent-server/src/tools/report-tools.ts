import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
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

const saveReport: ToolDef = {
  name: 'save_report',
  description: 'Save your analysis report to the database. This is your primary output each run. Other agents (especially Charlie the EA) will read your reports.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Report title' },
      content: { type: 'string', description: 'Full report content' },
      data: { type: 'object', default: {}, description: 'Structured metrics/data as key-value pairs' },
      recommendations: { type: 'array', items: { type: 'string' }, default: [], description: 'Actionable recommendations' },
    },
    required: ['title', 'content'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    // Look up agent_id from ai_executives
    const { data: agent } = await sb.from('ai_executives')
      .select('id')
      .eq('role', agentRole)
      .single();

    if (!agent) {
      return `Agent role "${agentRole}" not found in ai_executives table.`;
    }

    const { data, error } = await sb.from('executive_reports').insert({
      agent_id: agent.id,
      report_type: agentRole,
      title: args.title,
      content: args.content,
      data: args.data || {},
      recommendations: args.recommendations || [],
      status: 'draft',
    }).select('id').single();

    if (error) {
      return `Failed to save report: ${error.message}`;
    }
    return `Report saved (id: ${data.id}): "${args.title}"`;
  },
};

const saveActionItem: ToolDef = {
  name: 'save_action_item',
  description: 'Flag an action item for yourself, another agent, or a human to address. Action items are visible to Charlie (EA) who includes them in the founder briefing.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Action item title' },
      description: { type: 'string', description: 'Detailed description' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      category: { type: 'string', enum: ['finance', 'technical', 'operations', 'marketing', 'support', 'compliance', 'growth'], default: 'operations' },
      assigned_to: { type: 'string', default: 'human', description: 'Agent role or "human"' },
    },
    required: ['title', 'description'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    const { data, error } = await sb.from('agent_action_items').insert({
      flagged_by: agentRole,
      assigned_to: args.assigned_to || 'human',
      title: args.title,
      description: args.description,
      priority: args.priority || 'medium',
      category: args.category || 'operations',
    }).select('id').single();

    if (error) {
      return `Failed to save action item: ${error.message}`;
    }
    return `Action item flagged (id: ${data.id}): "${args.title}" - assigned to ${args.assigned_to || 'human'}`;
  },
};

const proposeImprovement: ToolDef = {
  name: 'propose_improvement',
  description: 'Suggest a system improvement that requires founder approval. Config/prompt/schedule changes auto-execute on approval. Code changes create GitHub issues.',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Proposal title' },
      description: { type: 'string', description: 'What and why' },
      implementation: { type: 'string', description: 'How to implement' },
      category: { type: 'string', enum: ['config', 'code', 'data', 'prompt', 'schedule', 'feature', 'bugfix', 'infrastructure'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      estimated_impact: { type: 'string', description: 'Expected business impact' },
    },
    required: ['title', 'description', 'implementation', 'category', 'estimated_impact'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();
    const approvalToken = crypto.randomUUID();

    const { data, error } = await sb.from('improvement_proposals').insert({
      proposed_by: agentRole,
      title: args.title,
      description: args.description,
      implementation: args.implementation,
      category: args.category,
      priority: args.priority || 'medium',
      estimated_impact: args.estimated_impact,
      approval_token: approvalToken,
    }).select('id').single();

    if (error) {
      return `Failed to create proposal: ${error.message}`;
    }

    // Automatically send approval email with the correct token
    const baseUrl = config.SITE_URL;
    const approveUrl = `${baseUrl}/api/admin/proposals/approve?token=${approvalToken}&action=approve`;
    const rejectUrl = `${baseUrl}/api/admin/proposals/approve?token=${approvalToken}&action=reject`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #0f172a;">Improvement Proposal: ${args.title}</h2>
        <p><strong>From:</strong> ${agentRole} | <strong>Category:</strong> ${args.category} | <strong>Priority:</strong> ${args.priority || 'medium'}</p>
        <h3>Why</h3><p>${args.description}</p>
        <h3>How</h3><p>${args.implementation}</p>
        <h3>Impact</h3><p>${args.estimated_impact}</p>
        <div style="margin: 30px 0;">
          <a href="${approveUrl}" style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 12px;">Approve</a>
          <a href="${rejectUrl}" style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reject</a>
        </div>
        <p style="color: #64748b; font-size: 12px;">Paybacker AI - Improvement Proposal</p>
      </div>
    `;

    try {
      const resend = new Resend(config.RESEND_API_KEY);
      await resend.emails.send({
        from: config.FROM_EMAIL,
        to: config.FOUNDER_EMAIL,
        subject: `[Approve/Reject] ${args.title}`,
        html,
      });
    } catch (emailErr: any) {
      return `Proposal saved (id: ${data.id}) but email failed: ${emailErr.message}`;
    }

    return `Proposal created and approval email sent (id: ${data.id}): "${args.title}"`;
  },
};

const getRecentReports: ToolDef = {
  name: 'get_recent_reports',
  description: 'Get recent reports from other agents. Useful for understanding what other agents have found and coordinating your analysis.',
  schema: {
    type: 'object',
    properties: {
      agent_role: { type: 'string', description: 'Filter by specific agent role. Omit for all agents.' },
      hours: { type: 'number', default: 24, description: 'How many hours back to look' },
      limit: { type: 'number', maximum: 10, default: 5 },
    },
  },
  handler: async (args) => {
    const sb = getSupabase();
    const since = new Date(Date.now() - (args.hours || 24) * 60 * 60 * 1000).toISOString();

    let query = sb.from('executive_reports')
      .select('report_type, title, content, data, recommendations, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(args.limit || 5);

    if (args.agent_role) {
      query = query.eq('report_type', args.agent_role);
    }

    const { data, error } = await query;
    if (error) {
      return `Failed to get reports: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return 'No recent reports found.';
    }

    const formatted = data.map(r =>
      `[${r.report_type}] ${r.title}\n${r.content}\nRecommendations: ${(r.recommendations || []).join('; ') || 'none'}`
    ).join('\n\n---\n\n');

    return formatted;
  },
};

export const reportTools: ToolDef[] = [saveReport, saveActionItem, proposeImprovement, getRecentReports];
