/**
 * Shared helpers and constants for the disputes surface.
 *
 * Moved from src/app/dashboard/disputes/page.tsx (2026-05-05)
 */

import {
  FileText, Mail, Phone, MessageSquare, StickyNote,
  type LucideIcon,
} from 'lucide-react';

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  complaint: 'Company Complaint',
  energy_dispute: 'Energy Bill Dispute',
  broadband_complaint: 'Broadband / Mobile',
  flight_compensation: 'Flight Compensation',
  parking_appeal: 'Parking Appeal',
  debt_dispute: 'Debt Dispute',
  refund_request: 'Refund Request',
  hmrc_tax_rebate: 'HMRC Tax Rebate',
  council_tax_band: 'Council Tax',
  dvla_vehicle: 'DVLA',
  nhs_complaint: 'NHS Complaint',
  gym_membership: 'Gym Membership',
  insurance_dispute: 'Insurance Dispute',
};

export const CATEGORY_ALIAS: Record<string, string> = {
  energy_bill: 'energy_dispute',
  energy: 'energy_dispute',
  broadband: 'broadband_complaint',
  mobile: 'broadband_complaint',
  flight: 'flight_compensation',
  flights: 'flight_compensation',
  flight_delay: 'flight_compensation',
  parking: 'parking_appeal',
  debt: 'debt_dispute',
  refund: 'refund_request',
  hmrc: 'hmrc_tax_rebate',
  council_tax: 'council_tax_band',
  dvla: 'dvla_vehicle',
  nhs: 'nhs_complaint',
  subscription: 'complaint',
};

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-amber-100 text-amber-600 border border-amber-200' },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
  awaiting_response: { label: 'Waiting for reply', className: 'bg-purple-500/10 text-purple-400 border border-purple-500/20' },
  escalated: { label: 'Escalated', className: 'bg-orange-500/10 text-orange-400 border border-orange-500/20' },
  ombudsman: { label: 'Ombudsman', className: 'bg-red-500/10 text-red-400 border border-red-500/20' },
  resolved_won: { label: 'Won', className: 'bg-green-500/10 text-green-500 border border-green-500/20' },
  won: { label: 'Won', className: 'bg-green-500/10 text-green-500 border border-green-500/20' },
  resolved_partial: { label: 'Partially Won', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  partial: { label: 'Partially Won', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  resolved_lost: { label: 'Not resolved', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
  lost: { label: 'Not resolved', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
  closed: { label: 'Closed', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
};

export const ACTIVE_STATUSES = ['open', 'in_progress', 'awaiting_response', 'escalated', 'ombudsman'];

export function isResolved(status: string): boolean {
  return ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed'].includes(status);
}

export function isWon(status: string): boolean {
  return ['resolved_won', 'resolved_partial'].includes(status);
}

export const ENTRY_TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  ai_letter: { label: 'Your letter', icon: FileText, className: 'border-emerald-500/30 bg-emerald-500/5' },
  company_email: { label: 'Their email', icon: Mail, className: 'border-orange-400/30 bg-orange-400/5' },
  company_letter: { label: 'Their letter', icon: FileText, className: 'border-orange-400/30 bg-orange-400/5' },
  phone_call: { label: 'Phone call', icon: Phone, className: 'border-blue-400/30 bg-blue-400/5' },
  user_note: { label: 'Your note', icon: StickyNote, className: 'border-slate-400/30 bg-slate-400/5' },
  company_response: { label: 'Their response', icon: MessageSquare, className: 'border-orange-400/30 bg-orange-400/5' },
};

export function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w !== 1 ? 's' : ''} ago`;
  }
  return formatDate(d);
}

import type { Dispute } from '@/types/disputes';

export function letterAlreadyLogged(dispute: Dispute | null, letterContent: string): boolean {
  if (!dispute || !letterContent) return false;
  const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
  const target = normalise(letterContent);
  if (target.length < 50) return false;
  return (dispute.correspondence ?? []).some(
    (c) => c.entry_type === 'letter_sent' && normalise(c.content || '') === target,
  );
}
