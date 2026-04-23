'use client';

import { useEffect, useState } from 'react';
import {
  Headphones, Activity, Briefcase, Zap, BarChart3, Megaphone,
  Sun, BookOpen, Receipt, Search,
  ChevronDown, ChevronUp, RefreshCw, Loader2, Clock, AlertTriangle,
} from 'lucide-react';

interface BusinessLogEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
}

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  schedule: string;
  status: 'healthy' | 'warning' | 'missed' | 'never';
  last_run: string | null;
  next_run: string | null;
  latest_summary: string | null;
  latest_title: string | null;
  recent_entries: BusinessLogEntry[];
}

interface TeamSummary {
  healthy: number;
  warning: number;
  missed: number;
  total: number;
}

const agentIcons: Record<string, React.ElementType> = {
  'riley-support-agent': Headphones,
  'heartbeat-monitor': Activity,
  'ceo-briefing': Briefcase,
  'dev-sprint-runner': Zap,
  'paperclip-business-monitor': BarChart3,
  'social-media-agent': Megaphone,
  'morning-briefing': Sun,
  'obsidian-ideas': BookOpen,
  'receipt-scanner': Receipt,
  'upwork-scout': Search,
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function timeUntil(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  return `in ${Math.floor(hours / 24)}d`;
}

function StatusDot({ status }: { status: AgentStatus['status'] }) {
  const classes: Record<AgentStatus['status'], string> = {
    healthy: 'bg-[#34d399] shadow-[0_0_6px_#34d399]',
    warning: 'bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]',
    missed: 'bg-red-500 shadow-[0_0_6px_#ef4444]',
    never: 'bg-slate-600',
  };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${classes[status]} ${status === 'healthy' ? 'animate-pulse' : ''}`}
    />
  );
}

function StatusLabel({ status }: { status: AgentStatus['status'] }) {
  const map: Record<AgentStatus['status'], { label: string; cls: string }> = {
    healthy: { label: 'Healthy', cls: 'text-[#34d399]' },
    warning: { label: 'Overdue', cls: 'text-[#f59e0b]' },
    missed: { label: 'Missed', cls: 'text-red-400' },
    never: { label: 'No runs', cls: 'text-slate-500' },
  };
  const { label, cls } = map[status];
  return <span className={`text-xs font-medium ${cls}`}>{label}</span>;
}

export default function AITeamPanel() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team-status', { credentials: 'include' });
      const data = await res.json();
      if (data.agents) setAgents(data.agents);
      if (data.summary) setSummary(data.summary);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 text-[#34d399] animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Health summary bar */}
      {summary && (
        <div className="rounded-2xl border border-slate-200 bg-[#0a1628]/60 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#34d399] animate-pulse inline-block" />
                <span className="text-[#34d399] text-sm font-semibold">{summary.healthy}</span>
                <span className="text-slate-500 text-xs">healthy</span>
              </div>
              {summary.warning > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] inline-block" />
                  <span className="text-[#f59e0b] text-sm font-semibold">{summary.warning}</span>
                  <span className="text-slate-500 text-xs">overdue</span>
                </div>
              )}
              {summary.missed > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-red-400 text-sm font-semibold">{summary.missed}</span>
                  <span className="text-slate-500 text-xs">missed</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-xs">{summary.total} Paperclip agents</span>
              <button
                onClick={load}
                className="text-slate-500 hover:text-slate-900 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent cards */}
      <div className="space-y-2">
        {agents.map(agent => {
          const Icon = agentIcons[agent.id] || Activity;
          const isExpanded = expanded === agent.id;

          return (
            <div
              key={agent.id}
              className={`rounded-2xl border overflow-hidden transition-colors ${
                agent.status === 'healthy'
                  ? 'border-slate-200 bg-[#0a1628]/60'
                  : agent.status === 'warning'
                  ? 'border-[#f59e0b]/20 bg-[#0a1628]/60'
                  : agent.status === 'missed'
                  ? 'border-red-500/20 bg-[#0a1628]/60'
                  : 'border-slate-200 bg-[#0a1628]/40'
              }`}
            >
              {/* Card header */}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-800/60 flex-shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-slate-700" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <StatusDot status={agent.status} />
                      <h3 className="text-slate-900 text-sm font-semibold leading-none">{agent.name}</h3>
                      <StatusLabel status={agent.status} />
                    </div>
                    <p className="text-slate-500 text-xs mb-2">{agent.role}</p>

                    {/* Meta row */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-slate-600 text-xs font-mono">{agent.schedule}</span>
                      <div className="flex items-center gap-1 text-slate-500 text-xs">
                        <Clock className="h-3 w-3" />
                        Last: <span className="text-slate-500">{timeAgo(agent.last_run)}</span>
                      </div>
                      {agent.next_run && (
                        <div className="flex items-center gap-1 text-slate-500 text-xs">
                          Next: <span className={
                            agent.status === 'missed' ? 'text-red-400' :
                            agent.status === 'warning' ? 'text-[#f59e0b]' : 'text-slate-500'
                          }>{timeUntil(agent.next_run)}</span>
                        </div>
                      )}
                    </div>

                    {/* Latest summary */}
                    {agent.latest_summary && (
                      <p className="text-slate-500 text-xs mt-2 line-clamp-2 leading-relaxed">
                        {agent.latest_summary.slice(0, 160)}{agent.latest_summary.length > 160 ? '...' : ''}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => setExpanded(isExpanded ? null : agent.id)}
                    className="text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0 mt-1"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded: recent log entries */}
              {isExpanded && (
                <div className="border-t border-slate-200 bg-white/30">
                  {agent.recent_entries.length === 0 ? (
                    <p className="text-slate-500 text-xs text-center py-5">
                      No business_log entries yet for <code className="font-mono">{agent.id}</code>
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-800/50">
                      {agent.recent_entries.map((entry, i) => (
                        <div key={entry.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-slate-900 text-xs font-medium leading-tight">
                              {entry.title}
                            </span>
                            <span className="text-slate-600 text-xs flex-shrink-0">
                              {timeAgo(entry.created_at)}
                            </span>
                          </div>
                          <p className="text-slate-500 text-xs leading-relaxed">
                            {entry.content.slice(0, 200)}{entry.content.length > 200 ? '...' : ''}
                          </p>
                          {i === 0 && agent.recent_entries.length > 1 && (
                            <div className="mt-1">
                              <span className="text-[#34d399] text-xs font-medium">Latest</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
