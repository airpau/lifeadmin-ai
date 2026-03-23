'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Users, Send, Loader2, X, TrendingUp, Brain,
  Megaphone, ClipboardList, Headphones, Bot, Lightbulb, Check, Target,
} from 'lucide-react';

interface MeetingMessage {
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  agentRole?: string;
}

const roleIcons: Record<string, any> = {
  cfo: TrendingUp,
  cto: Brain,
  cao: Users,
  cmo: Megaphone,
  head_of_ads: Target,
  exec_assistant: ClipboardList,
  support_lead: Headphones,
  support_agent: Bot,
};

const roleColors: Record<string, string> = {
  cfo: 'text-green-400',
  cto: 'text-blue-400',
  cao: 'text-purple-400',
  cmo: 'text-pink-400',
  head_of_ads: 'text-orange-400',
  exec_assistant: 'text-cyan-400',
  support_lead: 'text-amber-400',
  support_agent: 'text-slate-400',
};

const roleBgColors: Record<string, string> = {
  cfo: 'bg-green-500/10 border-green-500/30',
  cto: 'bg-blue-500/10 border-blue-500/30',
  cao: 'bg-purple-500/10 border-purple-500/30',
  cmo: 'bg-pink-500/10 border-pink-500/30',
  head_of_ads: 'bg-orange-500/10 border-orange-500/30',
  exec_assistant: 'bg-cyan-500/10 border-cyan-500/30',
  support_lead: 'bg-amber-500/10 border-amber-500/30',
  support_agent: 'bg-slate-500/10 border-slate-500/30',
};

const CRON_SECRET = '894f466aff1425f8b4416762e709fab2df7d24b06ba9711aeaacadda2757024f';

interface MeetingRoomProps {
  onClose: () => void;
}

export default function MeetingRoom({ onClose }: MeetingRoomProps) {
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposalSent, setProposalSent] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const createProposal = async (msg: MeetingMessage, index: number) => {
    try {
      await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CRON_SECRET}`,
        },
        body: JSON.stringify({
          title: `${msg.agent}: ${msg.content.slice(0, 80)}...`,
          description: msg.content,
          implementation: `Suggested by ${msg.agent} during executive meeting. Review and implement as appropriate.`,
          category: 'feature',
          priority: 'medium',
          proposed_by: msg.agentRole || 'meeting',
          send_email: true,
        }),
      });
      setProposalSent(prev => new Set(prev).add(index));
    } catch {
      // silent fail
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: MeetingMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/meeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CRON_SECRET}`,
        },
        body: JSON.stringify({
          message: text,
          history: updatedMessages,
        }),
      });

      const data = await res.json();

      if (data.responses) {
        const agentMessages: MeetingMessage[] = data.responses.map((r: any) => ({
          role: 'assistant' as const,
          content: r.response,
          agent: r.agent,
          agentRole: r.role,
        }));
        setMessages([...updatedMessages, ...agentMessages]);
      }
    } catch {
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: 'Meeting connection lost. Please try again.', agent: 'System' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/20 p-2 rounded-lg">
              <Users className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Executive Meeting Room</h2>
              <p className="text-slate-400 text-xs">8 agents online — speak to your AI team directly</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Online indicators */}
            <div className="flex -space-x-1">
              {['cfo', 'cto', 'cao', 'cmo', 'head_of_ads', 'exec_assistant', 'support_lead', 'support_agent'].map((role) => {
                const Icon = roleIcons[role] || Bot;
                return (
                  <div key={role} className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-slate-800 ${roleBgColors[role]}`}>
                    <Icon className={`h-3 w-3 ${roleColors[role]}`} />
                  </div>
                );
              })}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <Users className="h-12 w-12 text-amber-500/30 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">Meeting room ready</p>
              <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
                Type a message to address your AI executive team. All agents will respond
                from their area of expertise — like a real boardroom meeting.
              </p>
              <div className="space-y-2 max-w-md mx-auto">
                {[
                  'What are our top priorities this week?',
                  'We need to fix the onboarding drop-off — ideas?',
                  'How should we approach the waitlist launch?',
                  'What are the biggest risks to the business right now?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="block w-full text-left text-sm text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg px-4 py-2.5 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === 'user') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[70%]">
                    <p className="text-xs text-amber-400 mb-1 text-right font-medium">Paul (Founder)</p>
                    <div className="bg-amber-500 text-slate-950 rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            }

            const Icon = roleIcons[msg.agentRole || ''] || Bot;
            const color = roleColors[msg.agentRole || ''] || 'text-slate-400';
            const bgColor = roleBgColors[msg.agentRole || ''] || 'bg-slate-500/10 border-slate-500/30';

            return (
              <div key={i} className="flex gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${bgColor}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div className="max-w-[75%]">
                  <p className={`text-xs ${color} mb-1 font-medium`}>{msg.agent}</p>
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-200">
                    {msg.content}
                  </div>
                  <div className="mt-1">
                    {proposalSent.has(i) ? (
                      <span className="text-xs text-green-400 flex items-center gap-1"><Check className="h-3 w-3" /> Proposal sent to email</span>
                    ) : (
                      <button
                        onClick={() => createProposal(msg, i)}
                        className="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-1 transition-all"
                      >
                        <Lightbulb className="h-3 w-3" /> Make this a proposal
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3 items-center">
              <div className="bg-slate-800 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                <span className="text-slate-400 text-sm">Agents are responding...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Address your executive team..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 w-11 h-11 rounded-xl flex items-center justify-center transition-all font-semibold"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600 text-center mt-2">
            All agents respond in parallel — like a live boardroom meeting
          </p>
        </div>
      </div>
    </div>
  );
}
