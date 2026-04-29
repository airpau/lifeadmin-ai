'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, MessageCircle, Instagram, Facebook, Filter, RefreshCw, ChevronDown } from 'lucide-react';

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  platform: string;
  platform_user_id: string | null;
  first_message: string | null;
  source_post_id: string | null;
  status: string;
  follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = ['new', 'contacted', 'responded', 'converted', 'lost'];
const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  facebook_dm: { label: 'FB DM', color: 'bg-blue-500/20 text-blue-400' },
  facebook_comment: { label: 'FB Comment', color: 'bg-blue-500/10 text-blue-300' },
  instagram_comment: { label: 'IG Comment', color: 'bg-pink-500/20 text-pink-400' },
  instagram_dm: { label: 'IG DM', color: 'bg-pink-500/10 text-pink-300' },
  website: { label: 'Website', color: 'bg-mint-400/20 text-mint-400' },
  referral: { label: 'Referral', color: 'bg-brand-400/20 text-brand-400' },
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-mint-400/20 text-mint-400',
  contacted: 'bg-blue-500/20 text-blue-400',
  responded: 'bg-purple-500/20 text-purple-400',
  converted: 'bg-green-500/20 text-green-400',
  lost: 'bg-red-500/20 text-red-400',
};

export default function LeadsList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const supabase = createClient();

  const fetchLeads = async () => {
    setLoading(true);
    let query = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filterPlatform !== 'all') {
      query = query.eq('platform', filterPlatform);
    }
    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    const { data } = await query;
    setLeads(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();
  }, [filterPlatform, filterStatus]);

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    setSavingId(id);
    await supabase.from('leads').update(updates).eq('id', id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    setSavingId(null);
  };

  const platformCounts = leads.reduce((acc: Record<string, number>, l) => {
    acc[l.platform] = (acc[l.platform] || 0) + 1;
    return acc;
  }, {});

  const statusCounts = leads.reduce((acc: Record<string, number>, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  const newCount = statusCounts['new'] || 0;
  const convertedCount = statusCounts['converted'] || 0;

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4">
          <p className="text-2xl font-bold text-white">{leads.length}</p>
          <p className="text-slate-400 text-xs">Total leads</p>
        </div>
        <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4">
          <p className="text-2xl font-bold text-mint-400">{newCount}</p>
          <p className="text-slate-400 text-xs">New (uncontacted)</p>
        </div>
        <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4">
          <p className="text-2xl font-bold text-green-400">{convertedCount}</p>
          <p className="text-slate-400 text-xs">Converted</p>
        </div>
        <div className="bg-navy-900 border border-navy-700/50 rounded-xl p-4">
          <p className="text-2xl font-bold text-white">
            {leads.length > 0 ? `${((convertedCount / leads.length) * 100).toFixed(0)}%` : '0%'}
          </p>
          <p className="text-slate-400 text-xs">Conversion rate</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="bg-navy-800 border border-navy-700/50 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-mint-400"
          >
            <option value="all">All platforms</option>
            <option value="facebook_dm">Facebook DMs</option>
            <option value="facebook_comment">Facebook Comments</option>
            <option value="instagram_comment">Instagram Comments</option>
            <option value="instagram_dm">Instagram DMs</option>
            <option value="website">Website</option>
          </select>
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-navy-800 border border-navy-700/50 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-mint-400"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)} ({statusCounts[s] || 0})</option>
          ))}
        </select>

        <button
          onClick={fetchLeads}
          className="flex items-center gap-1.5 bg-navy-800 hover:bg-navy-700 text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Leads list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-mint-400 animate-spin" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No leads found</p>
          <p className="text-slate-500 text-sm mt-1">Leads are captured from Facebook DMs, Instagram comments, and social engagement.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => {
            const platform = PLATFORM_LABELS[lead.platform] || { label: lead.platform, color: 'bg-slate-500/20 text-slate-400' };
            const statusColor = STATUS_COLORS[lead.status] || 'bg-slate-500/20 text-slate-400';
            const isExpanded = expandedId === lead.id;
            const timeAgo = (() => {
              const diff = Date.now() - new Date(lead.created_at).getTime();
              const hours = Math.floor(diff / 3600000);
              if (hours < 1) return 'just now';
              if (hours < 24) return `${hours}h ago`;
              const days = Math.floor(hours / 24);
              return `${days}d ago`;
            })();

            return (
              <div key={lead.id} className="bg-navy-900 border border-navy-700/50 rounded-xl overflow-hidden">
                {/* Main row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-navy-800/50 transition-all"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : lead.id);
                    setEditingNotes(lead.notes || '');
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white text-sm font-medium truncate">{lead.name || lead.platform_user_id || 'Unknown'}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${platform.color}`}>{platform.label}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor}`}>{lead.status}</span>
                    </div>
                    <p className="text-slate-500 text-xs truncate">{lead.first_message || 'No message'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 text-xs whitespace-nowrap">{timeAgo}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-navy-700/50 pt-3 space-y-3">
                    {lead.first_message && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">First message</p>
                        <p className="text-slate-300 text-sm bg-navy-800 rounded-lg p-3">{lead.first_message}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Email</p>
                        <p className="text-white">{lead.email || 'Not captured'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Platform ID</p>
                        <p className="text-white text-xs font-mono">{lead.platform_user_id || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Captured</p>
                        <p className="text-white">{new Date(lead.created_at).toLocaleString('en-GB')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Status</p>
                        <select
                          value={lead.status}
                          onChange={(e) => updateLead(lead.id, { status: e.target.value })}
                          className="bg-navy-800 border border-navy-700/50 text-white text-sm rounded-lg px-2 py-1 focus:outline-none focus:border-mint-400 w-full"
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Notes</p>
                      <textarea
                        value={editingNotes}
                        onChange={(e) => setEditingNotes(e.target.value)}
                        rows={2}
                        className="w-full bg-navy-800 border border-navy-700/50 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-mint-400 resize-none"
                        placeholder="Add internal notes..."
                      />
                      {editingNotes !== (lead.notes || '') && (
                        <button
                          onClick={() => updateLead(lead.id, { notes: editingNotes })}
                          disabled={savingId === lead.id}
                          className="mt-1.5 bg-mint-400 hover:bg-mint-500 text-navy-950 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          {savingId === lead.id ? 'Saving...' : 'Save notes'}
                        </button>
                      )}
                    </div>
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
