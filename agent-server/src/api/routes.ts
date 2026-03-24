import { Router, Request, Response } from 'express';
import { authMiddleware } from './middleware';
import { triggerAgent, getAgentStatuses } from '../scheduler';
import { runAgentForMeeting } from '../agents/run-agent';
import { agentRegistry } from '../agents/registry';
import { processFeedback, getFeedbackSummary } from '../learning/feedback';
import { getGoalStats } from '../learning/goals';
import { getPredictionStats, getMemoryStats } from '../learning/self-eval';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

export const router = Router();

// Health check (no auth required)
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    agents: Object.keys(agentRegistry).length,
    enabled: config.AGENTS_ENABLED,
    uptime: process.uptime(),
  });
});

// List all agents and their current status
router.get('/api/agents', authMiddleware, (_req: Request, res: Response) => {
  res.json({ agents: getAgentStatuses() });
});

// Get detailed agent status including learning metrics
router.get('/api/agents/:role/status', authMiddleware, async (req: Request, res: Response) => {
  const { role } = req.params;
  if (!agentRegistry[role]) {
    res.status(404).json({ error: `Unknown agent: ${role}` });
    return;
  }

  const sb = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

  const [feedbackSummary, recentReports, activeGoals, memories] = await Promise.all([
    getFeedbackSummary(role),
    sb.from('executive_reports').select('title, created_at').eq('report_type', role).order('created_at', { ascending: false }).limit(5),
    sb.from('agent_goals').select('title, status, deadline').eq('agent_role', role).eq('status', 'active'),
    sb.from('agent_memory').select('title, memory_type, importance').eq('agent_role', role).order('importance', { ascending: false }).limit(10),
  ]);

  res.json({
    agent: agentRegistry[role],
    feedback: feedbackSummary,
    recentReports: recentReports.data || [],
    activeGoals: activeGoals.data || [],
    topMemories: memories.data || [],
  });
});

// Manually trigger an agent run
router.post('/api/trigger/:role', authMiddleware, async (req: Request, res: Response) => {
  const { role } = req.params;
  console.log(`[API] Manual trigger for ${role}`);

  const result = await triggerAgent(role);
  if (result.success) {
    res.json({ success: true, cost: result.cost });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

// Meeting room endpoint (proxied from Vercel)
router.post('/api/meeting', authMiddleware, async (req: Request, res: Response) => {
  const { message, agents, history, meetingId, action } = req.body;

  if (!message && action !== 'end_meeting') {
    res.status(400).json({ error: 'message required' });
    return;
  }

  const sb = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

  // Handle end meeting
  if (action === 'end_meeting' && meetingId) {
    // Generate meeting summary using Charlie
    const summaryResponse = await runAgentForMeeting(
      'exec_assistant',
      'Please summarise this meeting and list all action items.',
      history || []
    );

    await sb.from('meetings').update({
      status: 'ended',
      summary: summaryResponse,
      ended_at: new Date().toISOString(),
    }).eq('id', meetingId);

    res.json({ summary: summaryResponse, ended: true });
    return;
  }

  // Create or continue meeting
  let currentMeetingId = meetingId;
  if (!currentMeetingId) {
    const { data: meeting } = await sb.from('meetings').insert({
      title: `Meeting - ${new Date().toLocaleDateString('en-GB')}`,
      status: 'active',
    }).select('id').single();
    currentMeetingId = meeting?.id;
  }

  // Save founder message
  if (currentMeetingId) {
    await sb.from('meeting_messages').insert({
      meeting_id: currentMeetingId,
      role: 'user',
      content: message,
    });
  }

  // Determine which agents should respond
  let selectedAgents: string[] = agents || [];

  if (selectedAgents.length === 0) {
    // Chairperson mode: let Claude pick 3-5 relevant agents
    const allRoles = Object.keys(agentRegistry);
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

    const chairResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'You select which agents should respond to a founder message in a meeting. Return ONLY a JSON array of role strings.',
      messages: [{
        role: 'user',
        content: `Available agents: ${allRoles.join(', ')}\n\nFounder says: "${message}"\n\nWhich 3-5 agents are most relevant? Return JSON array only.`,
      }],
    });

    try {
      const text = chairResponse.content[0];
      if (text.type === 'text') {
        const match = text.text.match(/\[.*\]/s);
        if (match) {
          selectedAgents = JSON.parse(match[0]);
        }
      }
    } catch {
      // Fallback: use exec_assistant, cfo, cao
      selectedAgents = ['exec_assistant', 'cfo', 'cao'];
    }
  }

  // Get responses from selected agents in parallel
  const responses = await Promise.all(
    selectedAgents.map(async (role) => {
      const agentDef = agentRegistry[role];
      if (!agentDef) return { agent: role, role, response: `Unknown agent: ${role}` };

      const response = await runAgentForMeeting(role, message, history || []);

      // Save agent response to meeting
      if (currentMeetingId) {
        await sb.from('meeting_messages').insert({
          meeting_id: currentMeetingId,
          role: 'assistant',
          agent_role: role,
          agent_name: agentDef.name,
          content: response,
        });
      }

      // Save to agent memory
      await sb.from('agent_memory').insert({
        agent_role: role,
        memory_type: 'context',
        title: `Meeting discussion: ${message.substring(0, 50)}`,
        content: `Founder asked: "${message}". I responded: "${response.substring(0, 200)}"`,
        importance: 6,
        source: 'meeting',
        tags: ['meeting'],
      });

      return { agent: agentDef.name, role, response };
    })
  );

  res.json({
    meetingId: currentMeetingId,
    responses,
  });
});

// Feedback webhook (from Vercel proposal approval/rejection)
router.post('/api/feedback', authMiddleware, async (req: Request, res: Response) => {
  const { agent_role, event_type, source_id, feedback_content, impact_score } = req.body;

  if (!agent_role || !event_type) {
    res.status(400).json({ error: 'agent_role and event_type required' });
    return;
  }

  await processFeedback({
    agentRole: agent_role,
    eventType: event_type,
    sourceId: source_id,
    feedbackContent: feedback_content,
    impactScore: impact_score,
  });

  res.json({ success: true });
});

// Learning dashboard data
router.get('/api/learning', authMiddleware, async (_req: Request, res: Response) => {
  const [goalStats, predictionStats, memoryStats] = await Promise.all([
    getGoalStats(),
    getPredictionStats(),
    getMemoryStats(),
  ]);

  res.json({
    goals: goalStats,
    predictions: predictionStats,
    memories: memoryStats,
  });
});
