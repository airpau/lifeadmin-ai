'use client';

import { useEffect, useState } from 'react';
import {
  Brain, TrendingUp, Users, Headphones, Bot, Megaphone, ClipboardList, Target,
  Play, Pause, Loader2, Clock, ChevronDown, ChevronUp,
  RefreshCw,
} from 'lucide-react';

interface Agent {
  id: string;
  role: string;
  name: string;
  description: string;
  schedule: string;
  status: string;
  last_run_at: string | null;
  latest_report: {
    id: string;
    title: string;
    content: string;
    data: Record<string, any>;
    recommendations: string[];
    status: string;
    created_at: string;
  } | null;
}

const roleIcons: Record<string, any> = {
  cfo: TrendingUp,
  cto: Brain,
  cao: Users,
  cmo: Megaphone,
  exec_assistant: ClipboardList,
  head_of_ads: Target,
  support_lead: Headphones,
  support_agent: Bot,
};

const roleColors: Record<string, string> = {
  cfo: 'text-green-400 bg-green-500/10 border-green-500/30',
  cto: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  cao: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  cmo: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
  exec_assistant: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  head_of_ads: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  support_lead: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  support_agent: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const CRON_SECRET = '894f466aff1425f8b4416762e709fab2df7d24b06ba9711aeaacadda2757024f';

export default function AITeamPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

  const loadAgents = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/agents', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }).then(r => r.json());

    if (res.agents) setAgents(res.agents);
    setLoading(false);
  };

  const toggleStatus = async (agent: Agent) => {
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    await fetch(`/api/admin/agents/${agent.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadAgents();
  };

  const triggerRun = async (agent: Agent) => {
    setRunningAgent(agent.id);
    await fetch(`/api/admin/agents/${agent.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    setRunningAgent(null);
    await loadAgents();
  };

  useEffect(() => { loadAgents(); }, []);

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-6 w-6 text-amber-500 animate-spin mx-auto" />
      </div>
    );
  }

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-sm">{agents.length} AI executives configured</p>
        <button onClick={loadAgents} className="text-slate-400 hover:text-white">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        {agents.map((agent) => {
          const Icon = roleIcons[agent.role] || Bot;
          const colorClass = roleColors[agent.role] || roleColors.support_agent;
          const isExpanded = expandedAgent === agent.id;
          const isRunning = runningAgent === agent.id;

          return (
            <div key={agent.id} className={`bg-slate-900/50 border rounded-2xl overflow-hidden ${colorClass.split(' ')[2]}`}>
              {/* Agent Header */}
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${colorClass.split(' ').slice(0, 2).join(' ')}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm">{agent.name}</h3>
                      <p className="text-slate-500 text-xs">{agent.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full ${
                      agent.status === 'active' ? 'bg-green-400' :
                      agent.status === 'paused' ? 'bg-amber-400' : 'bg-red-400'
                    }`} />
                    <span className="text-slate-500 text-xs">{agent.status}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1 text-slate-500 text-xs">
                    <Clock className="h-3 w-3" />
                    Last: {timeAgo(agent.last_run_at)}
                  </div>
                  <span className="text-slate-700 text-xs font-mono">{agent.schedule}</span>

                  <div className="flex-1" />

                  <button
                    onClick={() => toggleStatus(agent)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      agent.status === 'active'
                        ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                    }`}
                  >
                    {agent.status === 'active' ? <Pause className="h-3 w-3 inline mr-1" /> : <Play className="h-3 w-3 inline mr-1" />}
                    {agent.status === 'active' ? 'Pause' : 'Resume'}
                  </button>

                  <button
                    onClick={() => triggerRun(agent)}
                    disabled={isRunning}
                    className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Run Now
                  </button>

                  <button
                    onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                    className="text-slate-400 hover:text-white"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Latest Report (expanded) */}
              {isExpanded && agent.latest_report && (
                <div className="border-t border-slate-800 p-5 bg-slate-950/30">
                  <h4 className="text-white text-sm font-semibold mb-2">{agent.latest_report.title}</h4>
                  <p className="text-slate-400 text-xs mb-1">
                    {new Date(agent.latest_report.created_at).toLocaleString('en-GB')} ·
                    <span className={`ml-1 ${agent.latest_report.status === 'sent' ? 'text-green-400' : 'text-slate-500'}`}>
                      {agent.latest_report.status}
                    </span>
                  </p>
                  <p className="text-slate-300 text-sm whitespace-pre-wrap mt-2">{agent.latest_report.content}</p>

                  {agent.latest_report.recommendations.length > 0 && (
                    <div className="mt-3 bg-slate-900/50 rounded-lg p-3">
                      <p className="text-amber-400 text-xs font-semibold mb-1">Recommendations</p>
                      <ul className="text-slate-400 text-xs space-y-1">
                        {agent.latest_report.recommendations.map((r, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-amber-500">•</span> {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Object.keys(agent.latest_report.data).length > 0 && (
                    <div className="mt-3 bg-slate-900/50 rounded-lg p-3">
                      <p className="text-amber-400 text-xs font-semibold mb-1">Metrics</p>
                      <pre className="text-slate-400 text-xs overflow-x-auto">
                        {JSON.stringify(agent.latest_report.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {isExpanded && !agent.latest_report && (
                <div className="border-t border-slate-800 p-5 bg-slate-950/30">
                  <p className="text-slate-500 text-sm text-center">No reports yet. Click "Run Now" to generate the first report.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
