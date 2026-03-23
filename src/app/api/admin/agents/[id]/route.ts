import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AgentConfig } from '@/lib/agents/executive-agent';
import { runCFOAgent } from '@/lib/agents/cfo-agent';
import { runCTOAgent } from '@/lib/agents/cto-agent';
import { runCAOAgent } from '@/lib/agents/cao-agent';
import { runCMOAgent } from '@/lib/agents/cmo-agent';
import { runExecAssistantAgent } from '@/lib/agents/exec-assistant-agent';
import { runSupportLeadAgent } from '@/lib/agents/support-lead-agent';
import { runSupportAgent } from '@/lib/agents/support-agent';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const agentRunners: Record<string, (config: AgentConfig) => Promise<any>> = {
  cfo: runCFOAgent,
  cto: runCTOAgent,
  cao: runCAOAgent,
  cmo: runCMOAgent,
  exec_assistant: runExecAssistantAgent,
  support_lead: runSupportLeadAgent,
  support_agent: runSupportAgent,
};

// PUT — update agent config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = getAdmin();

  const update: Record<string, any> = {};
  if (body.status) update.status = body.status;
  if (body.system_prompt) update.system_prompt = body.system_prompt;
  if (body.schedule) update.schedule = body.schedule;
  if (body.config) update.config = body.config;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: agent, error } = await supabase
    .from('ai_executives')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update agent', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent });
}

// POST — manually trigger agent run
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getAdmin();

  const { data: agent, error } = await supabase
    .from('ai_executives')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const runner = agentRunners[agent.role];
  if (!runner) {
    return NextResponse.json({ error: `No runner for role: ${agent.role}` }, { status: 400 });
  }

  const config: AgentConfig = {
    id: agent.id,
    role: agent.role,
    name: agent.name,
    systemPrompt: agent.system_prompt,
    config: agent.config || {},
  };

  const report = await runner(config);

  // Save report
  const { data: savedReport } = await supabase
    .from('executive_reports')
    .insert({
      agent_id: agent.id,
      report_type: report.reportType,
      title: report.title,
      content: report.content,
      data: report.data,
      recommendations: report.recommendations,
      status: 'draft',
    })
    .select('*')
    .single();

  // Update last_run_at
  await supabase
    .from('ai_executives')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ report: savedReport });
}
