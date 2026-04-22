'use client';

import { useEffect, useState } from 'react';
import {
  Ticket, MessageSquare, Clock, CheckCircle, AlertTriangle,
  Filter, ArrowLeft, Send, Loader2, RefreshCw,
} from 'lucide-react';

interface TicketData {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  source: string;
  metadata: any;
  message_count: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  first_response_at: string | null;
}

interface TicketMessage {
  id: string;
  sender_type: string;
  sender_name: string;
  message: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  open: 'bg-amber-500/20 text-amber-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  awaiting_reply: 'bg-purple-500/20 text-purple-400',
  resolved: 'bg-green-500/20 text-green-400',
  closed: 'bg-slate-500/20 text-slate-500',
};

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-slate-500/20 text-slate-500',
};

const CRON_SECRET = '894f466aff1425f8b4416762e709fab2df7d24b06ba9711aeaacadda2757024f';

export default function TicketList() {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterPriority, setFilterPriority] = useState('');

  const loadTickets = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterPriority) params.set('priority', filterPriority);

    const res = await fetch(`/api/support/tickets?${params}`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }).then(r => r.json());

    if (res.tickets) setTickets(res.tickets);
    setLoading(false);
  };

  const loadTicketDetail = async (ticket: TicketData) => {
    setSelectedTicket(ticket);
    const res = await fetch(`/api/support/tickets/${ticket.id}`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }).then(r => r.json());

    if (res.messages) setMessages(res.messages);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSending(true);

    await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({
        sender_type: 'agent',
        sender_name: 'Admin',
        message: replyText,
        notify_user: true,
      }),
    });

    setReplyText('');
    setSending(false);
    await loadTicketDetail(selectedTicket);
  };

  const updateTicket = async (field: string, value: string) => {
    if (!selectedTicket) return;
    await fetch(`/api/support/tickets/${selectedTicket.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ [field]: value }),
    });
    // Refresh
    const res = await fetch(`/api/support/tickets/${selectedTicket.id}`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }).then(r => r.json());
    if (res.ticket) setSelectedTicket(res.ticket);
  };

  useEffect(() => { loadTickets(); }, [filterStatus, filterPriority]);

  // Stats
  const openCount = tickets.filter(t => ['open', 'in_progress', 'awaiting_reply'].includes(t.status)).length;
  const urgentCount = tickets.filter(t => t.priority === 'urgent' && ['open', 'in_progress', 'awaiting_reply'].includes(t.status)).length;
  const resolvedCount = tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;

  if (selectedTicket) {
    return (
      <div>
        <button onClick={() => { setSelectedTicket(null); loadTickets(); }} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to tickets
        </button>

        {/* Ticket Header */}
        <div className="bg-slate-900/50 border border-slate-200 rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-slate-500 text-xs font-mono">{selectedTicket.ticket_number}</p>
              <h3 className="text-slate-900 text-lg font-semibold">{selectedTicket.subject}</h3>
              <p className="text-slate-500 text-xs mt-1">
                via {selectedTicket.source} · {new Date(selectedTicket.created_at).toLocaleString('en-GB')}
              </p>
            </div>
            <div className="flex gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[selectedTicket.status]}`}>{selectedTicket.status}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${priorityColors[selectedTicket.priority]}`}>{selectedTicket.priority}</span>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <select
              value={selectedTicket.status}
              onChange={(e) => updateTicket('status', e.target.value)}
              className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
            >
              <option value="open">New & Unassigned (open)</option>
              <option value="in_progress">Escalated / In Progress (in_progress)</option>
              <option value="awaiting_reply">Awaiting User Reply (awaiting_reply)</option>
              <option value="resolved">Resolved (resolved)</option>
              <option value="closed">Closed (closed)</option>
            </select>
            <select
              value={selectedTicket.priority}
              onChange={(e) => updateTicket('priority', e.target.value)}
              className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
            >
              {['low', 'medium', 'high', 'urgent'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={selectedTicket.category}
              onChange={(e) => updateTicket('category', e.target.value)}
              className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
            >
              {['general', 'billing', 'technical', 'complaint', 'account'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-slate-900/50 border border-slate-200 rounded-2xl p-5 mb-4">
          <h4 className="text-slate-900 font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-amber-500" /> Conversation
          </h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-end' : msg.sender_type === 'system' ? 'justify-center' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.sender_type === 'user'
                    ? 'bg-amber-500 text-slate-950'
                    : msg.sender_type === 'system'
                    ? 'bg-slate-800/50 text-slate-500 text-xs italic'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  <p className="text-xs opacity-60 mb-1">{msg.sender_name} · {new Date(msg.created_at).toLocaleString('en-GB')}</p>
                  <p className="whitespace-pre-wrap">{msg.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reply */}
        <div className="bg-slate-900/50 border border-slate-200 rounded-2xl p-5">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            rows={3}
            className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
          />
          <div className="flex justify-end mt-2 gap-2">
            <button
              onClick={sendReply}
              disabled={!replyText.trim() || sending}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-900 font-semibold px-5 py-2 rounded-lg flex items-center gap-2 text-sm"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Reply
            </button>
            <button
              onClick={async () => {
                await sendReply();
                await updateTicket('status', 'resolved');
              }}
              disabled={!replyText.trim() || sending}
              className="bg-mint-400 hover:bg-mint-500 disabled:opacity-50 text-navy-950 font-semibold px-5 py-2 rounded-lg flex items-center gap-2 text-sm"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Send & Resolve
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-amber-500/30 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 mb-1" />
          <p className="text-2xl font-bold text-slate-900">{openCount}</p>
          <p className="text-slate-500 text-xs">Open tickets</p>
        </div>
        <div className="bg-slate-900/50 border border-red-500/30 rounded-xl p-4">
          <Clock className="h-5 w-5 text-red-500 mb-1" />
          <p className="text-2xl font-bold text-slate-900">{urgentCount}</p>
          <p className="text-slate-500 text-xs">Urgent</p>
        </div>
        <div className="bg-slate-900/50 border border-green-500/30 rounded-xl p-4">
          <CheckCircle className="h-5 w-5 text-green-500 mb-1" />
          <p className="text-2xl font-bold text-slate-900">{resolvedCount}</p>
          <p className="text-slate-500 text-xs">Resolved</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter className="h-4 w-4 text-slate-500" />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
        >
          <option value="">All tickets</option>
          <option value="active">Needs Action (Open/Escalated)</option>
          <option value="open">New & Unassigned</option>
          <option value="in_progress">Escalated to Human</option>
          <option value="awaiting_reply">Awaiting User Reply</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
        >
          <option value="">All priorities</option>
          {['urgent', 'high', 'medium', 'low'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button onClick={loadTickets} className="text-slate-500 hover:text-slate-900">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="h-6 w-6 text-amber-500 animate-spin mx-auto" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <Ticket className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">No tickets found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => loadTicketDetail(t)}
              className="w-full flex items-center justify-between bg-slate-900/50 border border-slate-200 hover:border-amber-500/50 rounded-xl px-4 py-3 transition-all text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-slate-500 text-xs font-mono">{t.ticket_number}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColors[t.status]}`}>{t.status}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${priorityColors[t.priority]}`}>{t.priority}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-700">{t.category}</span>
                </div>
                <p className="text-slate-900 text-sm font-medium truncate">{t.subject}</p>
                <p className="text-slate-500 text-xs">via {t.source} · {t.assigned_to || 'unassigned'}</p>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <div className="flex items-center gap-1 text-slate-500">
                  <MessageSquare className="h-3 w-3" />
                  <span className="text-xs">{t.message_count}</span>
                </div>
                <span className="text-slate-500 text-xs">{new Date(t.created_at).toLocaleDateString('en-GB')}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
