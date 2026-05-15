'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Ticket, Users, Brain, UserPlus, Activity, Gavel, MessageSquare,
  PoundSterling, Shield, Clock, BarChart3, Tag, Briefcase, RefreshCw,
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

// Long-tail admin pages. Used to live behind a "More" dropdown but the
// dropdown was clipped inside the iOS Capacitor webview, so users could
// see the trigger but not the menu. Flatten them all into the same
// horizontally-scrollable strip so every admin destination is reachable
// with a swipe — no dropdowns, no hidden state.
const ADVANCED: AdvancedItem[] = [
  { href: '/dashboard/admin/billing', label: 'Billing', icon: PoundSterling,
    title: 'API cost ledger — Anthropic / Perplexity / Resend / Stripe / TrueLayer spend' },
  { href: '/dashboard/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/admin/consumer-leads', label: 'Consumer Leads', icon: UserPlus,
    title: 'Consumer abandonment nurture funnel — cart-abandonment / pricing-page leads' },
  { href: '/dashboard/admin/dispute-intelligence', label: 'Dispute Intel', icon: Activity,
    title: 'Dispute outcome dataset — funnel, win rates, merchant × legal-ref heatmap' },
  { href: '/dashboard/admin/dispute-agent', label: 'Dispute Agent', icon: Gavel,
    title: 'Autonomous dispute-agent decisions, approve/override rate, recommendation effectiveness' },
  { href: '/dashboard/admin/whatsapp', label: 'WhatsApp', icon: MessageSquare,
    title: 'WhatsApp template SIDs + Meta approval status' },
  { href: '/dashboard/admin/legal-refs', label: 'Compliance Centre', icon: Shield,
    title: 'Legal references + canonical-source pipeline (legislation.gov.uk, GOV.UK CMA, Find Case Law)' },
  { href: '/dashboard/admin/crons', label: 'Crons', icon: Clock },
  { href: '/dashboard/admin/cancel-info', label: 'Cancel Info', icon: Tag },
  { href: '/dashboard/admin/b2b', label: 'B2B', icon: Briefcase, title: 'B2B waitlist + API keys' },
  { href: '/dashboard/admin/restore-bank-data', label: 'Restore data', icon: RefreshCw,
    title: "Restore a user's soft-deleted bank transactions (within 30-day window)" },
];

export default function AdminTabStrip({ tab, setTab, loadMembers, setSelectedMember }: Props) {
  const pathname = usePathname();

  const baseBtn = 'shrink-0 px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap';
  const inactive = 'bg-slate-100 text-slate-600 hover:text-slate-900';
  const active = 'bg-emerald-500 text-slate-900';

  return (
    <div className="admin-tab-strip-wrap relative mb-6">
      <div
        className="admin-tab-strip flex items-center gap-2 overflow-x-auto"
        role="tablist"
        aria-label="Admin sections"
      >
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

        {ADVANCED.map((item) => {
          const Icon = item.icon;
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.title}
              className={`${baseBtn} ${isActive ? active : inactive}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
