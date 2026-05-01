'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Ticket, Users, Brain, UserPlus, Activity, Gavel, MessageSquare,
  PoundSterling, Shield, Clock, BarChart3, Tag, Briefcase, RefreshCw,
  ChevronDown,
} from 'lucide-react';

type AdminTab = 'overview' | 'members' | 'tickets' | 'leads' | 'ai_team';

interface Props {
  tab: AdminTab;
  setTab: (t: AdminTab) => void;
  loadMembers: () => void;
  setSelectedMember: (v: null) => void;
}

interface AdvancedItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title?: string;
}

const ADVANCED: AdvancedItem[] = [
  { href: '/dashboard/admin/consumer-leads', label: 'Consumer Leads', icon: UserPlus,
    title: 'Consumer abandonment nurture funnel — cart-abandonment / pricing-page leads (separate table from social-DM Leads tab above)' },
  { href: '/dashboard/admin/dispute-intelligence', label: 'Dispute Intel', icon: Activity,
    title: 'Dispute outcome dataset — funnel, win rates, merchant × legal-ref heatmap' },
  { href: '/dashboard/admin/dispute-agent', label: 'Dispute Agent', icon: Gavel,
    title: 'Autonomous dispute-agent decisions, approve/override rate, recommendation effectiveness' },
  { href: '/dashboard/admin/whatsapp', label: 'WhatsApp', icon: MessageSquare,
    title: 'WhatsApp template SIDs + Meta approval status' },
  { href: '/dashboard/admin/legal-refs', label: 'Legal Refs', icon: Shield },
  { href: '/dashboard/admin/crons', label: 'Crons', icon: Clock },
  { href: '/dashboard/admin/cancel-info', label: 'Cancel Info', icon: Tag },
  { href: '/dashboard/admin/b2b', label: 'B2B', icon: Briefcase, title: 'B2B waitlist + API keys' },
  { href: '/dashboard/admin/restore-bank-data', label: 'Restore data', icon: RefreshCw,
    title: "Restore a user's soft-deleted bank transactions (within 30-day window)" },
];

export default function AdminTabStrip({ tab, setTab, loadMembers, setSelectedMember }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const baseBtn = 'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5';
  const inactive = 'bg-slate-100 text-slate-600 hover:text-slate-900';
  const active = 'bg-emerald-500 text-slate-900';

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <button
        onClick={() => { setTab('overview'); setSelectedMember(null); }}
        className={`${baseBtn} ${tab === 'overview' ? active : inactive}`}
      >
        Overview
      </button>
      <button
        onClick={() => { setTab('members'); loadMembers(); setSelectedMember(null); }}
        className={`${baseBtn} ${tab === 'members' ? active : inactive}`}
      >
        Members
      </button>
      <button
        onClick={() => { setTab('tickets'); setSelectedMember(null); }}
        className={`${baseBtn} ${tab === 'tickets' ? active : inactive}`}
      >
        <Ticket className="h-4 w-4" /> Tickets
      </button>
      <button
        onClick={() => { setTab('leads'); setSelectedMember(null); }}
        className={`${baseBtn} ${tab === 'leads' ? active : inactive}`}
      >
        <Users className="h-4 w-4" /> Leads
      </button>
      <button
        onClick={() => { setTab('ai_team'); setSelectedMember(null); }}
        className={`${baseBtn} ${tab === 'ai_team' ? active : inactive}`}
      >
        <Brain className="h-4 w-4" /> AI Team
      </button>
      <Link href="/dashboard/admin/billing" className={`${baseBtn} ${inactive}`}
        title="API cost ledger — Anthropic / Perplexity / Resend / Stripe / TrueLayer spend">
        <PoundSterling className="h-4 w-4" /> Billing
      </Link>
      <Link href="/dashboard/admin/analytics" className={`${baseBtn} ${inactive}`}>
        <BarChart3 className="h-4 w-4" /> Analytics
      </Link>

      {/* More popover — long-tail admin tools live here so the primary
          row never overflows horizontally on narrow viewports. */}
      <div className="relative" ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          className={`${baseBtn} ${inactive}`}
        >
          More
          <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
        {moreOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full mt-2 z-30 w-60 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5"
          >
            {ADVANCED.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.title}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  role="menuitem"
                >
                  <Icon className="h-4 w-4 text-slate-500" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
