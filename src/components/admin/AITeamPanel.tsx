'use client';

import { useEffect, useState } from 'react';
import {
  Brain, TrendingUp, Users, Headphones, Bot, Megaphone, ClipboardList, Target, Palette,
  Rocket, Heart, Shield, Eye, Sparkles,
  Play, Pause, Loader2, Clock, ChevronDown, ChevronUp,
  RefreshCw, Activity, Zap, BarChart3, MessageSquare,
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

interface RailwayStatus {
  status: string;
  agents: number;
  enabled: boolean;
  uptime: number;
}

interface LearningData {
  goals: Record<string, { active: number; completed: number; failed: number }>;
  predictions: Record<string, { total: number; correct: number; accuracy: number; pending: number }>;
  memories: Record<string, { total: number; byType: Record<string, number>; avgImportance: number }>;
}

const roleIcons: Record<string, any> = {
  cfo: TrendingUp,
  cto: Brain,
  cao: Users,
  cmo: Megaphone,
  exec_assistant: ClipboardList,
  head_of_ads: Target,
  cco: Palette,
  cgo: Rocket,
  cro: Heart,
  clo: Shield,
  cio: Eye,
  cxo: Sparkles,
  cfraudo: Shield,
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
  cco: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  cgo: 'text-lime-400 bg-lime-500/10 border-lime-500/30',
  cro: 'text-red-400 bg-red-500/10 border-red-500/30',
  clo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  cio: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  cxo: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
  cfraudo: 'text-red-400 bg-red-500/10 border-red-500/30',
  support_lead: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  support_agent: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const CRON_SECRET = '894f466aff1425f8b4416762e709fab2df7d24b06ba9711aeaacadda2757024f';

export default function AITeamPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [railwayStatus, setRailwayStatus] = useState<RailwayStatus | null>(null);
  const [learning, setLearning] = useState<LearningData | null>(null);
  const [tab, setTab] = useState<'agents' | 'learning'>('agents');

  const loadAgents = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/agents', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }).then(r => r.json());

    if (res.agents) setAgents(res.agents);
    setLoading(false);
  };

  const loadRailwayStatus = async () => {
    try {
      const res = await fetch('/api/admin/agents/railway-status', {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRailwayStatus(data.railway);
        if (data.learning) setLearning(data.learning);
      }
    } catch {}
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
    try {
      await fetch(`/api/admin/agents/${agent.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
    } catch {}
    setRunningAgent(null);
    await loadAgents();
  };

  useEffect(() => {
    loadAgents();
    loadRailwayStatus();
  }, []);

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

  const formatUptime = (secs: number) => {
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
    return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
  };

  return (
    <div>
      {/* Railway Server Status */}
      <div className={`rounded-2xl border p-4 mb-4 ${
        railwayStatus?.status === 'healthy'
          ? 'bg-green-500/5 border-green-500/30'
          : 'bg-red-500/5 border-red-500/30'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${railwayStatus?.status === 'healthy' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <div>
              <p className="text-white text-sm font-semibold">
                Agent Server {railwayStatus?.status === 'healthy' ? 'Online' : railwayStatus ? 'Error' : 'Checking...'}
              </p>
              <p className="text-slate-500 text-xs">
                {railwayStatus ? (
                  <>Claude Agent SDK on Railway - {railwayStatus.agents} agents - Uptime: {formatUptime(railwayStatus.uptime)}</>
                ) : 'Connecting to Railway...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/10 text-amber-400 text-xs px-2 py-1 rounded-lg font-medium">
              <Zap className="h-3 w-3 inline mr-1" />Autonomous
            </span>
            <button onClick={() => { loadAgents(); loadRailwayStatus(); }} className="text-slate-400 hover:text-white">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('agents')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
            tab === 'agents' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="h-3 w-3 inline mr-1" />Agents ({agents.length})
        </button>
        <button
          onClick={() => setTab('learning')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
            tab === 'learning' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <BarChart3 className="h-3 w-3 inline mr-1" />Learning
        </button>
      </div>

      {/* Learning Tab */}
      {tab === 'learning' && learning && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">Total Memories</p>
              <p className="text-white text-2xl font-bold">
                {Object.values(learning.memories).reduce((s, m) => s + m.total, 0)}
              </p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">Active Goals</p>
              <p className="text-white text-2xl font-bold">
                {Object.values(learning.goals).reduce((s, g) => s + g.active, 0)}
              </p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">Predictions Made</p>
              <p className="text-white text-2xl font-bold">
                {Object.values(learning.predictions).reduce((s, p) => s + p.total, 0)}
              </p>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <h4 className="text-white text-sm font-semibold mb-3">Agent Learning Progress</h4>
            <div className="space-y-2">
              {Object.entries(learning.memories).map(([role, mem]) => {
                const pred = learning.predictions[role];
                const goals = learning.goals[role];
                return (
                  <div key={role} className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400 w-24 truncate">{role}</span>
                    <div className="flex-1 flex items-center gap-4">
                      <span className="text-slate-500">
                        <MessageSquare className="h-3 w-3 inline mr-1" />{mem.total} memories
                      </span>
                      {pred && pred.total > 0 && (
                        <span className={pred.accuracy >= 60 ? 'text-green-400' : 'text-amber-400'}>
                          {pred.accuracy}% accuracy ({pred.correct}/{pred.total - pred.pending})
                        </span>
                      )}
                      {goals && goals.active > 0 && (
                        <span className="text-cyan-400">{goals.active} active goals</span>
                      )}
                      {goals && goals.completed > 0 && (
                        <span className="text-green-400">{goals.completed} completed</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {Object.keys(learning.memories).length === 0 && (
                <p className="text-slate-500 text-sm text-center py-4">No learning data yet. Agents will start learning after their first runs.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agents Tab */}
      {tab === 'agents' && (
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

                    {/* Learning badges */}
                    {learning?.memories[agent.role] && (
                      <span className="text-slate-600 text-xs">
                        {learning.memories[agent.role].total} memories
                      </span>
                    )}
                    {learning?.predictions[agent.role] && learning.predictions[agent.role].total > 0 && (
                      <span className={`text-xs ${learning.predictions[agent.role].accuracy >= 60 ? 'text-green-500' : 'text-amber-500'}`}>
                        {learning.predictions[agent.role].accuracy}% accuracy
                      </span>
                    )}

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
                      {new Date(agent.latest_report.created_at).toLocaleString('en-GB')} -
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
                              <span className="text-amber-500">-</span> {r}
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
                    <p className="text-slate-500 text-sm text-center">No reports yet. Click "Run Now" to trigger the first autonomous run.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
