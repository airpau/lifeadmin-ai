'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
 Wallet, Building2, Shield, RefreshCw, X, MessageCircle,
 ArrowLeft, ArrowRight, HelpCircle, AlertTriangle, Clock, Send, Mail, Zap, Loader2, Trash2, ExternalLink,
 Pencil, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { fmtNum } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import BankPickerModal, { connectBankDirect } from '@/components/BankPickerModal';
import DisconnectBankModal from '@/components/money-hub/DisconnectBankModal';
import { isDealValid } from '@/lib/savings-utils';
import PlanLimitsBanner from '@/components/PlanLimitsBanner';

import OverviewPanel from './OverviewPanel';
import SpendingPanel from './SpendingPanel';
import GoalsAndBudgetsPanel from './GoalsAndBudgetsPanel';
import NetWorthPanel from './NetWorthPanel';
import ContractsPanel from './ContractsPanel';
import UpcomingWidget from './UpcomingWidget';
import { filterActiveSubscriptions } from '@/lib/subscriptions/active-count';

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string) {
 const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
 if (mins < 1) return 'just now';
 if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
 const hrs = Math.floor(mins / 60);
 if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
 const days = Math.floor(hrs / 24);
 if (days === 1) return 'yesterday';
 return `${days} days ago`;
}

function formatAbsoluteDateTime(dateStr: string) {
 const d = new Date(dateStr);
 return d.toLocaleString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
 });
}

type ExpectedBill = {
 name: string; expected_amount: number; category: string;
 paid: boolean; past_due: boolean; source: string; expected_date?: string;
 billing_day?: number; bill_key?: string; occurrence_count?: number;
};

type FacBankStatus = 'bank_matched' | 'not_in_bank' | 'due_soon' | 'overdue';

type FacItem = {
 id: string;
 provider_name: string;
 amount: number;
 billing_cycle: string | null;
 category: string | null;
 next_billing_date: string | null;
 source: string | null;
 needs_review: boolean;
 bankStatus: FacBankStatus;
 matchedTxn: { merchant_name: string; amount: number; timestamp: string } | null;
};

// Humorous rotating captions shown while the inbox scan runs.
// Mirrors the LOADING_CAPTIONS pattern in dashboard/complaints/page.tsx.
const SCAN_CAPTIONS: { icon: string; text: string }[] = [
 { icon: '📬', text: 'Rifling through your inbox for receipts you forgot existed...' },
 { icon: '🕵️', text: 'Hunting for that Netflix trial you swore you cancelled...' },
 { icon: '📈', text: 'Flagging silent price rises your provider hoped you\'d miss...' },
 { icon: '📅', text: 'Spotting contract renewals before they ambush you...' },
 { icon: '💳', text: 'Reading subscription confirmations from the last two years...' },
 { icon: '⚖️', text: 'Checking whether anyone owes you a refund right now...' },
 { icon: '🧾', text: 'Matching receipts to transactions so the maths adds up...' },
 { icon: '🔍', text: 'Reading 1,200 emails so you don\'t have to...' },
 { icon: '☕', text: 'This usually takes less than a kettle boil...' },
 { icon: '🎯', text: 'Almost done — packaging everything we found...' },
];

// English ordinal suffix — "1st, 2nd, 3rd, 4th..., 21st, 22nd, 23rd, 24th...".
// Previous code hard-coded "th" which produced "2th", "3th", "21th".
function ordinal(n: number): string {
  if (n <= 0 || !Number.isFinite(n)) return String(n);
  const lastTwo = n % 100;
  const last = n % 10;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13 ? 'th'
    : last === 1 ? 'st'
    : last === 2 ? 'nd'
    : last === 3 ? 'rd'
    : 'th';
  return `${n}${suffix}`;
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function MoneyHubPage() {
 const [data, setData] = useState<any>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [syncing, setSyncing] = useState(false);
 const [selectedMonth, setSelectedMonth] = useState('');
 const [spaces, setSpaces] = useState<Array<{ id: string; name: string; emoji: string | null; is_default: boolean; created_at?: string | null }>>([]);
 const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
 const [preferredSpaceId, setPreferredSpaceId] = useState<string | null>(null);
 // Separate flag for Space / month switches — initial load uses `loading`.
 // This drives the inline "Switching…" pill so the user gets visible
 // feedback on the (currently slow) /api/money-hub refetch.
 const [switching, setSwitching] = useState(false);

 // Client-side stale-while-revalidate cache, keyed by `${month}:${spaceId}`.
 // Lets Space / month switches render instantly after the first view, with
 // a background refetch keeping the data fresh. Cleared on manual Sync.
 const cacheRef = useRef<Map<string, any>>(new Map());
 const [showBankPicker, setShowBankPicker] = useState(false);
 const [showFcaBanner, setShowFcaBanner] = useState(false);
 const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
 const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 // Expected bills
 const [expectedBills, setExpectedBills] = useState<ExpectedBill[]>([]);
 const [expectedBillsTotal, setExpectedBillsTotal] = useState(0);
 const [showAllBills, setShowAllBills] = useState(false);

 // Bank state
 const [expiredConnections, setExpiredConnections] = useState<any[]>([]);
 const [activeConnections, setActiveConnections] = useState<any[]>([]);
 const [bankPromptDismissed, setBankPromptDismissed] = useState(false);
 const [userId, setUserId] = useState<string | null>(null);
 const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

 // AI Chat (Pro)
 const [chatOpen, setChatOpen] = useState(false);
 const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
 const [chatInput, setChatInput] = useState('');
 const [chatLoading, setChatLoading] = useState(false);
 const chatEndRef = useRef<HTMLDivElement>(null);

 const searchParams = useSearchParams();

 // Email scanning
 const [scanning, setScanning] = useState(false);
 const [scanCaption, setScanCaption] = useState(0);

 // Deals
 const [deals, setDeals] = useState<any>(null);

 // FAC (Financial Action Centre)
 const [facItems, setFacItems] = useState<FacItem[]>([]);
 const [facCounts, setFacCounts] = useState<Record<string, number>>({});
 const [facLoading, setFacLoading] = useState(false);
 const [facShowAll, setFacShowAll] = useState(false);
 const [facEditId, setFacEditId] = useState<string | null>(null);
 const [facEditFields, setFacEditFields] = useState<{ amount: string; billing_cycle: string; category: string }>({ amount: '', billing_cycle: 'monthly', category: 'other' });
 const [facSaving, setFacSaving] = useState(false);

 const supabase = createClient();

 const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
 if (toastTimer.current) clearTimeout(toastTimer.current);
 setToast({ message, type });
 toastTimer.current = setTimeout(() => setToast(null), 5000);
 };

 // ─── Data fetching ──────────────────────────────────────────────────────

 const refreshData = useCallback(async (month?: string, spaceId?: string | null) => {
 const targetMonth = month ?? selectedMonth;
 const targetSpace = spaceId !== undefined ? spaceId : activeSpaceId;
 const cacheKey = `${targetMonth || 'current'}:${targetSpace || 'default'}`;

 // Cache hit: show instantly, kick off background refetch without
 // the switching spinner so the UI feels snappy. If the refetch
 // returns the same shape, the user never notices the update.
 const cached = cacheRef.current.get(cacheKey);
 if (cached && data) {
 setData(cached);
 setError(null);
 if (cached.activeSpace?.id && !activeSpaceId) setActiveSpaceId(cached.activeSpace.id);
 } else if (data) {
 // Cache miss but data exists → show the switcher spinner.
 setSwitching(true);
 }

 try {
 const params = new URLSearchParams();
 if (targetMonth) params.set('month', targetMonth);
 if (targetSpace) params.set('space_id', targetSpace);
 const query = params.toString();
 const url = query ? `/api/money-hub?${query}` : '/api/money-hub';
 const res = await fetch(url);
 const d = await res.json();
 if (!d.error) {
 setData(d);
 setError(null);
 cacheRef.current.set(cacheKey, d);
 if (d.activeSpace?.id && !activeSpaceId) setActiveSpaceId(d.activeSpace.id);
 }
 else setError(d.error);
 } catch (e: any) {
 setError(e.message || 'Failed to load Money Hub data');
 } finally {
 setLoading(false);
 setSwitching(false);
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [selectedMonth, activeSpaceId, data]);

 // Load the user's Spaces once on mount. Also pick the initial
 // active Space using priority order:
 //   1. ?space_id=X URL param (already handled by Money Hub API)
 //   2. localStorage 'lastSpaceId' (per-device memory)
 //   3. profile.preferred_space_id (cross-device preference)
 //   4. Fallback: whichever Space the API returned as active (default)
 useEffect(() => {
 let alive = true;
 fetch('/api/spaces')
 .then((r) => r.json())
 .then((d) => {
 if (!alive) return;
 if (d.spaces) setSpaces(d.spaces);
 if (d.preferred_space_id) setPreferredSpaceId(d.preferred_space_id);
 const urlParams = new URLSearchParams(window.location.search);
 const urlSpace = urlParams.get('space_id');
 let candidate: string | null = null;
 if (urlSpace) candidate = urlSpace;
 else if (typeof window !== 'undefined') {
 const stored = localStorage.getItem('lastSpaceId');
 if (stored && (d.spaces ?? []).some((s: any) => s.id === stored)) candidate = stored;
 }
 if (!candidate && d.preferred_space_id) candidate = d.preferred_space_id;
 if (candidate && candidate !== activeSpaceId) {
 setActiveSpaceId(candidate);
 void refreshData(undefined, candidate);
 }
 })
 .catch(() => { /* silent */ });
 return () => { alive = false; };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // Persist the current Space to localStorage whenever the user switches.
 useEffect(() => {
 if (typeof window !== 'undefined' && activeSpaceId) {
 localStorage.setItem('lastSpaceId', activeSpaceId);
 }
 }, [activeSpaceId]);

 const fetchExpectedBills = async (month?: string) => {
 try {
 const targetMonth = month ?? selectedMonth;
 const url = targetMonth ? `/api/money-hub/expected-bills?month=${targetMonth}` : '/api/money-hub/expected-bills';
 const res = await fetch(url);
 const d = await res.json();
 if (!d.error && d.bills) {
 setExpectedBills(d.bills);
 setExpectedBillsTotal(d.totalExpected || 0);
 }
 } catch { /* silent */ }
 };

 // FAC Handlers
 const dismissBill = async (bill: ExpectedBill) => {
 if (!userId || !bill.bill_key) return;
 const now = new Date();
 const targetMonth = selectedMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
 const [year, month] = targetMonth.split('-').map(Number);
 // Optimistic removal
 setExpectedBills(prev => prev.filter(b => b.bill_key !== bill.bill_key));
 setExpectedBillsTotal(prev => parseFloat((prev - bill.expected_amount).toFixed(2)));
 const { error } = await supabase.rpc('dismiss_expected_bill', {
 p_user_id: userId,
 p_bill_key: bill.bill_key,
 p_year: year,
 p_month: month,
 });
 if (error) {
 showToast('Failed to dismiss bill.', 'error');
 fetchExpectedBills();
 }
 };

 const markBillPaid = async (bill: ExpectedBill, paid: boolean) => {
 const billKey = bill.bill_key;
 if (!billKey) return;
 const billMonth = (selectedMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
 // Optimistic update
 setExpectedBills(prev => prev.map(b => b.bill_key === billKey ? { ...b, paid, past_due: paid ? false : b.past_due } : b));
 try {
 const res = await fetch('/api/money-hub/expected-bills/mark-paid', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ bill_key: billKey, bill_month: billMonth, paid }),
 });
 if (!res.ok) throw new Error('Failed');
 showToast(paid ? `${bill.name} marked as paid` : `${bill.name} unmarked`, 'success');
 } catch {
 // Revert optimistic update on failure
 setExpectedBills(prev => prev.map(b => b.bill_key === billKey ? { ...b, paid: !paid } : b));
 showToast('Could not update bill status', 'error');
 }
 };

 // More FAC Handlers
 const fetchFac = async () => {
 setFacLoading(true);
 try {
 const res = await fetch('/api/money-hub/fac');
 const d = await res.json();
 if (!d.error) {
 // Align Money Hub's "active subscriptions" list with Dashboard Overview
 // and the Subscriptions page. filterActiveSubscriptions strips finance
 // rows (mortgage/loan/credit card — those belong in the Liabilities
 // section) and dedupes by provider + amount band.
 const filtered = filterActiveSubscriptions((d.items || []) as FacItem[]);
 setFacItems(filtered);
 setFacCounts(d.counts || {});
 }
 } catch { /* silent */ }
 setFacLoading(false);
 };

 const openFacEdit = (item: FacItem) => {
 setFacEditId(item.id);
 setFacEditFields({
 amount: String(item.amount),
 billing_cycle: item.billing_cycle || 'monthly',
 category: item.category || 'other',
 });
 };

 const saveFacEdit = async (id: string) => {
 setFacSaving(true);
 try {
 const res = await fetch(`/api/subscriptions/${id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 amount: parseFloat(facEditFields.amount) || 0,
 billing_cycle: facEditFields.billing_cycle,
 category: facEditFields.category,
 }),
 });
 if (res.ok) {
 setFacItems(prev => prev.map(it => it.id === id ? {
 ...it,
 amount: parseFloat(facEditFields.amount) || 0,
 billing_cycle: facEditFields.billing_cycle,
 category: facEditFields.category,
 } : it));
 setFacEditId(null);
 showToast('Updated', 'success');
 } else {
 showToast('Update failed', 'error');
 }
 } catch { showToast('Update failed', 'error'); }
 setFacSaving(false);
 };

 const dismissFacItem = async (id: string) => {
 try {
 const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
 if (res.ok) {
 setFacItems(prev => prev.filter(it => it.id !== id));
 setFacCounts(prev => ({ ...prev, total: (prev.total || 1) - 1 }));
 showToast('Dismissed', 'info');
 }
 } catch { /* silent */ }
 };

 const markFacPaid = async (id: string) => {
 // Mark needs_review = false so item no longer surfaces as needing action
 try {
 const response = await fetch(`/api/subscriptions/${id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ needs_review: false }),
 });
 if (response.ok) {
 setFacItems(prev => prev.map(it => it.id === id ? { ...it, bankStatus: 'bank_matched' as FacBankStatus } : it));
 setFacEditId(null);
 showToast('Marked as paid', 'success');
 } else {
 showToast('Failed to update — please try again', 'error');
 }
 } catch {
 showToast('Failed to update — please try again', 'error');
 }
 };

 // ─── Initial load ──────────────────────────────────────────────────────

 // Handle ?connected=true redirect after bank reconnection
 useEffect(() => {
 if (searchParams.get('connected') === 'true') {
 setExpiredConnections([]); // Clear expired state immediately
 setBankPromptDismissed(false);
 showToast('Bank connected! Syncing your transactions...', 'success');
 // Trigger a full refresh to pick up new connection and transactions
 refreshData();
 fetchExpectedBills();
 }
 }, [searchParams]);

 useEffect(() => {
 refreshData();
 fetchExpectedBills();
 fetchFac();

 // Fetch deals
 (async () => {
 try {
 const res = await fetch('/api/subscriptions/compare?all=1');
 if (res.ok) {
 const d = await res.json();
 setDeals(d);
 }
 } catch { /* silent */ }
 })();

 // Check FCA banner
 try { if (!localStorage.getItem('pb_fca_banner_dismissed')) setShowFcaBanner(true); } catch { /* silent */ }

 // Restore chat history
 try {
 const saved = localStorage.getItem('pb_moneyhub_chat_history');
 if (saved) setChatMessages(JSON.parse(saved));
 } catch { /* silent */ }

 // User / bank state
 (async () => {
 const { data: { user } } = await supabase.auth.getUser();
 if (user) {
 setUserId(user.id);
 // Include 'revoked' so users can see + remove connections they
 // intentionally disconnected. Without this, revoked Yapily/TrueLayer
 // rows live forever in the DB but are invisible in the UI — no way
 // for the user to clean them up.
 const { data: conns } = await supabase.from('bank_connections')
 .select('id, bank_name, status, account_ids, account_display_names')
 .eq('user_id', user.id)
 .in('status', ['expired', 'token_expired', 'expired_legacy', 'expiring_soon', 'revoked']);
 if (conns?.length) setExpiredConnections(conns);
 else setExpiredConnections([]); // Clear if all now active

 // Fetch active connections too
 const { data: activeConns } = await supabase.from('bank_connections')
 .select('id, bank_name, status, account_ids, account_display_names, last_synced_at')
 .eq('user_id', user.id)
 .eq('status', 'active');
 setActiveConnections(activeConns || []);

 const stored = localStorage.getItem('bank_prompt_dismissed_at');
 if (stored) {
 const daysSince = (Date.now() - new Date(stored).getTime()) / 86_400_000;
 setBankPromptDismissed(daysSince < 30);
 }
 }
 })();

 // Hide global chat widget on this page for Pro users
 document.body.dataset.hideChat = 'true';
 return () => { delete document.body.dataset.hideChat; };
 }, []);

 useEffect(() => {
 const handler = () => refreshData();
 window.addEventListener('paybacker:dashboard_refresh', handler);
 return () => window.removeEventListener('paybacker:dashboard_refresh', handler);
 }, [refreshData]);

 // ─── Sync ──────────────────────────────────────────────────────────────

 const handleSync = async () => {
 setSyncing(true);
 try {
 const res = await fetch('/api/bank/sync-now', { method: 'POST' });
 if (res.status === 429) { const d = await res.json(); showToast(d.error || 'Rate limited.', 'error'); setSyncing(false); return; }
 if (res.status === 403) { showToast('Manual sync requires a Pro plan.', 'error'); setSyncing(false); return; }
 if (res.status === 401) { showToast('Bank connection expired. Please reconnect.', 'error'); setSyncing(false); return; }
 if (!res.ok) { showToast('Sync failed.', 'error'); setSyncing(false); return; }
 const d = await res.json();
 await fetch('/api/money-hub/sync', { method: 'POST' }).catch(() => {});
 await fetch('/api/gmail/scan', { method: 'POST' }).catch(() => {});
 localStorage.setItem('pb_last_gmail_scan', Date.now().toString());
 // Wipe the Money Hub cache — data has just changed on the server
 // and stale-while-revalidate would otherwise show the pre-sync
 // numbers for a beat before the refetch lands.
 cacheRef.current.clear();
 await refreshData();
 await fetchExpectedBills();
 const synced = d.synced || 0;
 showToast(synced > 0 ? `Synced ${synced} transaction${synced !== 1 ? 's' : ''}` : 'Up to date', synced > 0 ? 'success' : 'info');
 } catch {
 showToast('Sync failed.', 'error');
 }
 setSyncing(false);
 };

 // ─── Disconnect Bank ──────────────────────────────────────────────────
 // The browser confirm() prompt was replaced with DisconnectBankModal,
 // which gives the user three explicit choices about what to do with
 // the existing transaction history (keep / soft-delete / erase). The
 // legacy confirm() defaulted to keep_history but didn't make that
 // visible — users couldn't request deletion without contacting support.

 // The disconnect modal now supports per-account scoping. The `accounts`
 // array is passed verbatim from connection.account_ids/display_names so
 // a multi-account consent (Yapily/TrueLayer with current + savings, or
 // Paul's modelo-sandbox with three accounts) renders a scope picker
 // letting the user disconnect ONE account without dropping the others.
 const [disconnectModal, setDisconnectModal] = useState<{
   connectionId: string;
   bankName: string;
   accounts: Array<{ id: string; name: string }>;
 } | null>(null);

 const openDisconnectModal = (
   connectionId: string,
   bankName: string,
   accounts: Array<{ id: string; name: string }> = [],
 ) => {
   setDisconnectModal({ connectionId, bankName: bankName || 'this bank', accounts });
 };

 const handleDisconnectConfirmed = async (
   mode: 'keep_history' | 'delete_transactions' | 'erase_all',
   txAffected: number,
   accountId: string | null,
 ) => {
   if (!disconnectModal) return;
   const { connectionId, bankName, accounts } = disconnectModal;
   const scopedAccountName = accountId ? (accounts.find((a) => a.id === accountId)?.name ?? 'account') : null;
   const isAccountScoped = accountId !== null;
   const remainingAccountsAfter = isAccountScoped ? accounts.length - 1 : 0;
   const connectionRemoved = !isAccountScoped || remainingAccountsAfter === 0;

   if (connectionRemoved) {
     // Whole connection went — drop from the on-screen lists.
     setActiveConnections(activeConnections.filter(c => c.id !== connectionId));
     setExpiredConnections(expiredConnections.filter(c => c.id !== connectionId));
   }

   const subject = scopedAccountName ?? bankName;
   const message = mode === 'erase_all'
     ? `${subject} erased — ${txAffected} transactions deleted permanently`
     : mode === 'delete_transactions'
       ? `${subject} disconnected — ${txAffected} transactions binned (recoverable for 30 days)`
       : `${subject} disconnected — transaction history kept`;
   showToast(message, 'success');
   setDisconnectModal(null);
   await refreshData();
 };

 // Compatibility shim — keeps the old call sites working while the modal
 // takes over. Routes everything through the new modal, building the
 // per-account list from the connection's account_ids/display_names.
 const disconnectBank = (connectionId: string, bankName: string) => {
   const conn = activeConnections.find(c => c.id === connectionId)
              ?? expiredConnections.find(c => c.id === connectionId);
   const ids: string[] = Array.isArray((conn as { account_ids?: string[] })?.account_ids)
     ? ((conn as { account_ids?: string[] }).account_ids as string[])
     : [];
   const names: string[] = Array.isArray(conn?.account_display_names) ? conn!.account_display_names : [];
   const accounts = ids.map((id, i) => ({ id, name: names[i] || `Account ${i + 1}` }));
   openDisconnectModal(connectionId, bankName, accounts);
 };

 // ─── AI Chat ──────────────────────────────────────────────────────────

 const sendChatMessage = async () => {
 if (!chatInput.trim() || chatLoading) return;
 const msg = chatInput.trim();
 const updated = [...chatMessages, { role: 'user', content: msg }];
 setChatMessages(updated);
 setChatInput('');
 setChatLoading(true);
 try {
 const res = await fetch('/api/chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ messages: updated, tier: 'pro' }),
 });
 const d = await res.json();
 if (d.reply) {
 if (d.toolsUsed || d.reply.includes('recategorised') || d.reply.includes('Updated') || d.reply.includes('Dismissed')) refreshData();
 const clean = d.reply.replace(/:::dashboard_refresh:::/g, '').replace(/:::dashboard\s*\{[\s\S]*?\}\s*:::/g, '').replace(/\[WIDGET:[\s\S]*?\]/g, '').trim();
 const newMsgs = [...updated, { role: 'assistant', content: clean }];
 setChatMessages(newMsgs);
 try { localStorage.setItem('pb_moneyhub_chat_history', JSON.stringify(newMsgs)); } catch { /* silent */ }
 } else if (d.error) {
 setChatMessages([...updated, { role: 'assistant', content: d.error }]);
 }
 } catch {
 setChatMessages([...updated, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
 }
 setChatLoading(false);
 };

 useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, chatLoading]);

 // ─── Email scan ────────────────────────────────────────────────────────

 const scanInbox = async (silent = false) => {
 if (!silent) {
   setScanning(true);
   setScanCaption(0);
 }
 // Rotate the humorous caption every 3s while the scan runs — gives the
 // user something to watch so they know it didn't silently freeze.
 const captionTimer = !silent
   ? setInterval(() => setScanCaption((prev) => (prev + 1) % SCAN_CAPTIONS.length), 3000)
   : null;
 try {
   const res = await fetch('/api/gmail/scan', { method: 'POST' });
   if (!res.ok) throw new Error('Scan failed');
   const payload = await res.json();
   await refreshData();
   if (!silent) {
     const parts: string[] = [];
     const ops = Array.isArray(payload?.opportunities) ? payload.opportunities : [];
     const byType = ops.reduce((acc: Record<string, number>, o: any) => {
       const k = String(o?.type || 'other');
       acc[k] = (acc[k] || 0) + 1;
       return acc;
     }, {});
     if (byType.subscription) parts.push(`${byType.subscription} new subscription${byType.subscription === 1 ? '' : 's'}`);
     if (byType.price_increase) parts.push(`${byType.price_increase} price alert${byType.price_increase === 1 ? '' : 's'}`);
     if (byType.bill) parts.push(`${byType.bill} bill${byType.bill === 1 ? '' : 's'}`);
     if (byType.contract) parts.push(`${byType.contract} contract update${byType.contract === 1 ? '' : 's'}`);
     if (byType.dispute_response) parts.push(`${byType.dispute_response} dispute repl${byType.dispute_response === 1 ? 'y' : 'ies'}`);
     if (byType.cancellation) parts.push(`${byType.cancellation} cancellation${byType.cancellation === 1 ? '' : 's'}`);
     const scanned = typeof payload?.emailsScanned === 'number' ? payload.emailsScanned : null;
     const summary = parts.length
       ? `Scanned ${scanned ?? 'your'} email${scanned === 1 ? '' : 's'} · Found ${parts.join(', ')}.`
       : scanned
         ? `Scanned ${scanned} email${scanned === 1 ? '' : 's'} · Nothing new to surface — you're all caught up.`
         : 'Inbox scan complete — nothing new.';
     showToast(summary, 'success');
   }
 }
 catch {
   if (!silent) showToast('Scan failed. Check your email connection in Profile.', 'error');
 }
 if (captionTimer) clearInterval(captionTimer);
 if (!silent) setScanning(false);
 };

 // ─── Auto-scan ────────────────────────────────────────────────────────
 // Background inbox scan — runs silently on Money Hub mount, capped to
 // once per 24h via localStorage. Previously the condition included
 // `alerts.length === 0` which short-circuited the timestamp guard:
 // every page load with empty alerts kicked off a fresh /api/gmail/scan,
 // a 10-30s Claude call that hung networkidle and noticeably slowed
 // mobile loads. The 24h timestamp is the only signal we need — empty
 // alerts is the steady state for users who've already actioned them.
 useEffect(() => {
 if (data && data.tier === 'pro') {
 const lastScan = localStorage.getItem('pb_last_gmail_scan');
 const now = Date.now();
 const stale = !lastScan || now - parseInt(lastScan, 10) > 24 * 60 * 60 * 1000;
 if (stale) {
 localStorage.setItem('pb_last_gmail_scan', now.toString());
 scanInbox(true);
 }
 }
 }, [data?.tier]);

 // ─── Tier-aware Space locking — MUST run before any early return ───
 // PLAN_LIMITS gives Free + Essential maxSpaces=1 (just the default
 // "Everything") and Pro unlimited. Default Space is always unlocked
 // since it's the catch-all required for the page to render.
 //
 // This useMemo lives ABOVE the loading/error/empty early returns so
 // the hook count is stable across renders. Hoisting it below produced
 // React #310 ("rendered more hooks than during the previous render")
 // when a fresh Yapily connect landed at /dashboard/money-hub?connected=true
 // — the empty-state branch returned before the hook ran on first
 // render, then once data arrived the hook started running and React
 // tripped (2026-04-28).
 const lockedSpaceIds = useMemo(() => {
   const tierMaxSpaces = data?.tier === 'pro' ? null : 1;
   if (tierMaxSpaces === null) return new Set<string>();
   const ordered = [...spaces].sort((a, b) => {
     if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
     const aT = a.created_at ? new Date(a.created_at).getTime() : 0;
     const bT = b.created_at ? new Date(b.created_at).getTime() : 0;
     return aT - bT;
   });
   const locked = new Set<string>();
   let unlocked = 0;
   for (const s of ordered) {
     if (unlocked < tierMaxSpaces) { unlocked++; continue; }
     locked.add(s.id);
   }
   return locked;
 }, [spaces, data?.tier]);

 // ─── Loading / Error / Empty states ───────────────────────────────────

 if (loading && !data) {
 return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 text-emerald-600 animate-spin" /></div>;
 }

 if (error) {
 return (
 <div className="max-w-2xl mx-auto py-20 text-center">
 <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8">
 <p className="text-red-400 font-semibold mb-2">Money Hub failed to load</p>
 <p className="text-slate-600 text-sm mb-4">{error}</p>
 <button onClick={() => { setLoading(true); setError(null); refreshData(); }} className="bg-orange-500 hover:bg-amber-300 text-black font-semibold px-4 py-2 rounded-xl text-sm">Retry</button>
 </div>
 </div>
 );
 }

 if (!data?.accounts?.length) {
 return (
 <div className="max-w-7xl">
 <div className="text-center py-10 mb-8">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-200 mb-4">
 <Wallet className="h-8 w-8 text-emerald-600" />
 </div>
 <h2 className="text-3xl font-bold text-slate-900 mb-2 font-[family-name:var(--font-heading)]">Connect your bank to unlock Money Hub</h2>
 <p className="text-slate-600 max-w-md mx-auto mb-6">
 We analyse your Open Banking transactions to build a complete financial picture — spending, income, subscriptions, budgets, and savings goals.
 </p>
 <button onClick={() => { if (!connectBankDirect()) setShowBankPicker(true); }} className="inline-flex items-center gap-2 cta transition-all">
 <Building2 className="h-5 w-5" /> Connect Bank Account
 </button>
 <p className="text-slate-500 text-xs mt-3">FCA regulated via Yapily · Read-only access · Takes 2 minutes</p>
 </div>
 {/* Demo preview */}
 <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 text-center">Preview — your data will look like this</p>
 <div className="relative rounded-2xl overflow-hidden">
 <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/60 to-white z-10 pointer-events-none" />
 <div className="blur-sm pointer-events-none select-none">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
 {[
 { label: 'Monthly income', value: '£3,200', color: 'text-green-400' },
 { label: 'Monthly outgoings', value: '£2,140', color: 'text-red-400' },
 { label: 'Savings rate', value: '33.1%', color: 'text-emerald-600' },
 { label: 'Subscriptions', value: '£127/mo', color: 'text-amber-600' },
 ].map(item => (
 <div key={item.label} className="card">
 <p className={`text-3xl font-bold ${item.color}`}>{item.value}</p>
 <p className="text-slate-600 text-sm mt-1">{item.label}</p>
 </div>
 ))}
 </div>
 </div>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
 {[
 { icon: '📊', title: '20+ spending categories', desc: 'See exactly where your money goes each month' },
 { icon: '🔔', title: 'Price increase alerts', desc: 'Know the moment any bill goes up' },
 { icon: '🎯', title: 'Budget planner', desc: 'Set limits and get alerts when approaching them' },
 ].map(f => (
 <div key={f.title} className="card">
 <span className="text-2xl">{f.icon}</span>
 <p className="font-semibold text-sm mt-2">{f.title}</p>
 <p className="text-slate-600 text-xs mt-1">{f.desc}</p>
 </div>
 ))}
 </div>
 {showBankPicker && <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />}
 </div>
 );
 }

 // ─── Derived values ──────────────────────────────────────────────────

 const isTestUser = process.env.NODE_ENV === 'development' || (data && data.accounts && data.tier === 'free'); // We will just check if we can reliably inject via API
 // data.tier is the effectiveTier returned by /api/money-hub, so trial users
 // and the hardcoded test user already come through as 'pro'. No need for
 // a separate isTestUserOverride branch — the API never populates that flag.
 const isPaid = (data && data.tier === 'essential') || (data && data.tier === 'pro');
 const isPro = (data && data.tier === 'pro');

 const hasLockedSpaces = lockedSpaceIds.size > 0;

 const lastSyncedAt = data.accounts.reduce((latest: string | null, acc: any) => {
 if (!acc.last_synced_at) return latest;
 if (!latest) return acc.last_synced_at;
 return new Date(acc.last_synced_at) > new Date(latest) ? acc.last_synced_at : latest;
 }, null as string | null);

 const lastManualSyncAt = data.accounts.reduce((latest: string | null, acc: any) => {
 if (!acc.last_manual_sync_at) return latest;
 if (!latest) return acc.last_manual_sync_at;
 return new Date(acc.last_manual_sync_at) > new Date(latest) ? acc.last_manual_sync_at : latest;
 }, null as string | null);

 const lastSyncMins = lastSyncedAt ? Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000) : null;
 // Cooldown gate must mirror the server: it is keyed on the last *manual* sync,
 // not the cron-driven last_synced_at — otherwise a recent cron run disables the button.
 const lastManualSyncMins = lastManualSyncAt ? Math.round((Date.now() - new Date(lastManualSyncAt).getTime()) / 60000) : null;
 const syncCooldownMinsLeft = (() => {
 if (lastManualSyncMins === null) return 0;
 return Math.max(0, 360 - lastManualSyncMins);
 })();
 const canSync = (() => {
 if (syncing) return false;
 if (data.tier !== 'pro') return false;
 return syncCooldownMinsLeft === 0;
 })();
 const syncButtonTitle = (() => {
 if (data.tier !== 'pro') return 'Manual sync is a Pro feature';
 if (syncCooldownMinsLeft === 0) return 'Sync now';
 const h = Math.floor(syncCooldownMinsLeft / 60);
 const m = syncCooldownMinsLeft % 60;
 return `Next manual sync available in ${h > 0 ? `${h}h ` : ''}${m}m`;
 })();

 const syncTierText = (() => {
 const stamp = lastSyncedAt ? ` · Last synced: ${formatTimeAgo(lastSyncedAt)} (${formatAbsoluteDateTime(lastSyncedAt)})` : '';
 if (data.tier === 'pro') return `Auto-syncs up to 4× daily${stamp}`;
 if (data.tier === 'essential') return `Auto-syncs daily${stamp}`;
 return 'Manual sync · 1× per day';
 })();

 // Actionable alerts
 const alerts = data.alerts || [];
 const priceIncreasAlerts = alerts.filter((a: any) => (a.alert_type || '').includes('price_increase'));

 // Expected bills unpaid
 const unpaidBills = expectedBills.filter(b => !b.paid);

 // ─── Render ──────────────────────────────────────────────────────────

 return (
 <div className="max-w-7xl space-y-6">
 {/* Toast */}
 {toast && (
 <div className={`fixed top-4 right-4 z-[100] max-w-sm px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 animate-[slideIn_0.3s_ease] ${
 toast.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-300' :
 toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-300' :
 'bg-blue-500/20 border-blue-500/30 text-blue-300'
 }`}>
 <p className="text-sm">{toast.message}</p>
 <button onClick={() => setToast(null)} className="hover:opacity-70"><X className="h-4 w-4" /></button>
 </div>
 )}

 <PlanLimitsBanner />

 {/* HEADER */}
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div>
 <h1 className="text-3xl md:text-4xl font-bold text-slate-900 font-[family-name:var(--font-heading)] flex items-center gap-3">
 <Wallet className="h-9 w-9 text-emerald-600" /> Money Hub
 </h1>
 <p className="text-slate-600 mt-1 text-sm">{syncTierText}</p>
 <div className="flex items-center gap-3 mt-2 flex-wrap">
 <a
 href="/dashboard/insights/annual"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
 >
 View annual insights →
 </a>
 <a
 href="/dashboard/money-hub/transactions"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
 >
 Browse all transactions →
 </a>
 </div>
 </div>

 <div className="flex items-center gap-2 flex-wrap">
 {/* Space switcher + manage button. Always visible so users can
  discover Spaces even before they\'ve created their first one. */}
 {spaces.length > 1 ? (
 <div className="relative flex flex-col items-end gap-1">
 <div className="relative">
 <select
 value={activeSpaceId ?? data.activeSpace?.id ?? ''}
 disabled={switching}
 onChange={(e) => {
 const next = e.target.value || null;
 // Tier gate — if the user clicks a Space their plan no longer
 // covers (e.g. Pro → Essentials downgrade leaves orphan Spaces),
 // bounce them to /pricing instead of firing /api/money-hub
 // and letting the server silently re-route them to the default
 // (which is what produced the spin-then-revert behaviour).
 if (next && lockedSpaceIds.has(next)) {
 if (typeof window !== 'undefined' && confirm('Multiple Spaces are a Pro feature. Upgrade to use this Space?')) {
 window.location.href = '/pricing';
 }
 e.target.value = activeSpaceId ?? data.activeSpace?.id ?? '';
 return;
 }
 setActiveSpaceId(next);
 refreshData(undefined, next);
 }}
 className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-800 font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-60 disabled:cursor-wait"
 title={hasLockedSpaces ? 'Some Spaces are locked — upgrade to Pro to use them' : 'Filter by Space'}
 >
 {spaces.map((s) => {
 const locked = lockedSpaceIds.has(s.id);
 return (
 <option key={s.id} value={s.id}>
 {locked ? '🔒 ' : ''}{s.emoji ? `${s.emoji} ` : ''}{s.name}{locked ? ' (Pro)' : ''}
 </option>
 );
 })}
 </select>
 {switching && (
 <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600 animate-spin pointer-events-none" />
 )}
 </div>
 {hasLockedSpaces && (
 <Link href="/pricing" className="text-[11px] text-amber-700 hover:text-amber-900 font-medium">
 {lockedSpaceIds.size} Space{lockedSpaceIds.size === 1 ? '' : 's'} locked · Upgrade →
 </Link>
 )}
 </div>
 ) : null}
 <Link
 href="/dashboard/settings/spaces"
 className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200/50 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium transition-colors"
 title="Group personal + business accounts into Spaces"
 >
 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
 <span>{spaces.length > 1 ? 'Manage' : 'Spaces'}</span>
 </Link>
 {/* Month nav — grouped so the prev/select/next cluster stays together on mobile wrap */}
 <div className="inline-flex items-center gap-1">
 <button
 onClick={() => {
 const months = Array.from({ length: 12 }, (_, i) => {
 const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (i + 1));
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
 });
 const cur = selectedMonth ? months.indexOf(selectedMonth) : -1;
 const next = cur < months.length - 1 ? months[cur + 1] : months[months.length - 1];
 setSelectedMonth(next); refreshData(next); fetchExpectedBills(next);
 }}
 className="text-slate-600 hover:text-slate-900 inline-flex items-center justify-center h-10 w-10 rounded transition-colors active:bg-slate-100"
 aria-label="Previous month"
 title="Previous month"
 >
 <ArrowLeft className="h-4 w-4" />
 </button>
 <select
 value={selectedMonth || data.selectedMonth}
 onChange={(e) => { setSelectedMonth(e.target.value); refreshData(e.target.value); fetchExpectedBills(e.target.value); }}
 className="bg-slate-100 border border-slate-200/50 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
 >
 <option value="">This month</option>
 {Array.from({ length: 12 }, (_, i) => {
 const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (i + 1));
 const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
 return <option key={val} value={val}>{d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>;
 })}
 </select>
 <button
 onClick={() => {
 if (!selectedMonth) return;
 const months = ['', ...Array.from({ length: 12 }, (_, i) => {
 const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (i + 1));
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
 })];
 const cur = months.indexOf(selectedMonth);
 if (cur > 0) { setSelectedMonth(months[cur - 1]); refreshData(months[cur - 1]); fetchExpectedBills(months[cur - 1]); }
 }}
 disabled={!selectedMonth}
 className="text-slate-600 hover:text-slate-900 inline-flex items-center justify-center h-10 w-10 rounded transition-colors active:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
 aria-label="Next month"
 title="Next month"
 >
 <ArrowRight className="h-4 w-4" />
 </button>
 </div>

 <button
 onClick={handleSync}
 disabled={syncing || !canSync}
 title={syncButtonTitle}
 className="flex items-center gap-2 cta-ghost transition-all"
 >
 <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
 {syncing ? 'Syncing...' : !canSync && data.tier === 'pro' && syncCooldownMinsLeft > 0
 ? `Sync · ${Math.floor(syncCooldownMinsLeft / 60)}h ${syncCooldownMinsLeft % 60}m`
 : 'Sync'}
 </button>
 </div>
 </div>

 {/* FCA Banner */}
 {showFcaBanner && (
 <div className="bg-sky-500/10 border border-sky-400/20 rounded-xl p-3 flex items-start gap-3 relative">
 <Shield className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
 <p className="text-sky-300 text-sm flex-1">
 Your financial data is powered by FCA-regulated Open Banking. Read-only access ensures your accounts stay secure. Balances are not shown for regulatory compliance.
 </p>
 <button onClick={() => { setShowFcaBanner(false); try { localStorage.setItem('pb_fca_banner_dismissed', 'true'); } catch { /* silent */ } }} className="text-slate-500 hover:text-slate-900">
 <X className="h-4 w-4" />
 </button>
 </div>
 )}

 {/* Expired / revoked bank connection list — per-bank reconnect or remove.
      NOT gated on bankPromptDismissed: that flag was meant to hide a
      separate "connect more banks" CTA, but was suppressing the real
      expired connection list too — meaning a user who clicked X once
      couldn't see (or remove) their broken connections for 30 days.
      The dismiss X is also gone from this card; the only way to clear
      a row is to act on it (reconnect or remove) which is what the
      user actually wants. */}
 {expiredConnections.length > 0 && (
 <div className="bg-orange-500/10 border border-amber-200 rounded-xl p-4">
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-2">
 <AlertTriangle className="h-5 w-5 text-amber-600" />
 <p className="text-amber-700 font-semibold text-sm">Bank connection{expiredConnections.length > 1 ? 's' : ''} need attention</p>
 </div>
 </div>
 <div className="space-y-2">
 {expiredConnections.flatMap((conn) => {
 const names: string[] = (conn.account_display_names && conn.account_display_names.length > 0)
 ? conn.account_display_names
 : [];
 const rows = names.length > 0 ? names : [null];
 return rows.map((accName, i) => (
 <div key={`${conn.id}-${i}`} className="flex items-center justify-between bg-slate-50/40 rounded-lg px-3 py-2">
 <div className="flex items-center gap-2">
 <Building2 className="h-4 w-4 text-amber-600" />
 <span className="text-slate-900 text-sm font-medium">{conn.bank_name || 'Bank'}</span>
 {accName && names.length > 1 && <span className="text-slate-500 text-xs">· {accName}</span>}
 <span className="text-slate-500 text-xs">· {conn.status === 'revoked' ? 'disconnected' : 'expired'}</span>
 </div>
 <div className="flex items-center gap-2">
 {i === 0 && (
 <>
 {/* Restore data button — calls /api/bank/restore which un-soft-
     deletes any transactions deleted within the last 30 days for
     this connection. The endpoint returns the count restored;
     0 means there was nothing to recover (either the row was
     keep_history disconnect, or the 30-day window has expired
     and the purge cron has already cleaned up). */}
 <button
   onClick={async () => {
     try {
       const res = await fetch('/api/bank/restore', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ connectionId: conn.id }),
       });
       const data = await res.json();
       if (!res.ok) {
         showToast(data?.error || 'Restore failed', 'error');
         return;
       }
       const n = data?.transactionsRestored ?? 0;
       showToast(
         n > 0
           ? `Restored ${n} transaction${n === 1 ? '' : 's'} from ${conn.bank_name || 'bank'}`
           : 'Nothing to restore (transactions weren\'t soft-deleted, or 30-day window has passed)',
         n > 0 ? 'success' : 'info',
       );
       if (n > 0) await refreshData();
     } catch {
       showToast('Restore failed', 'error');
     }
   }}
   className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 font-semibold px-3 py-1 rounded-lg text-xs border border-emerald-200"
   title="Restore transactions deleted in the last 30 days"
 >
   Restore data
 </button>
 <button onClick={() => { if (!connectBankDirect()) setShowBankPicker(true); }} className="bg-orange-500 hover:bg-orange-600 text-black font-semibold px-3 py-1 rounded-lg text-xs">Reconnect</button>
 <button onClick={() => disconnectBank(conn.id, conn.bank_name)} disabled={disconnectingId === conn.id} className="text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
 <Trash2 className="h-4 w-4" />
 </button>
 </>
 )}
 </div>
 </div>
 ));
 })}
 </div>
 <p className="text-slate-500 text-xs mt-2">
   <strong>Reconnect</strong> resumes new-transaction sync. <strong>Restore data</strong> brings back transactions you previously deleted (within the 30-day recovery window). The trash removes the connection row entirely.
 </p>
 </div>
 )}

 {/* Active bank connections — one row per connection (the unit you can
      revoke). Multi-account consents (e.g. NatWest current + business on
      one TrueLayer consent) cannot be partially revoked, so previously
      rendering one row per account with the trash gated to i===0 misled
      users into thinking they could remove a single account. */}
 {activeConnections.length > 0 && (
 <div className="card">
 <div className="flex items-center justify-between mb-3">
 <div className="flex items-center gap-2">
 <Building2 className="h-5 w-5 text-green-400" />
 <p className="text-green-300 font-semibold text-sm">Active bank connection{activeConnections.length > 1 ? 's' : ''}</p>
 </div>
 </div>
 <div className="space-y-2">
 {activeConnections.map((conn) => {
 const names: string[] = (conn.account_display_names && conn.account_display_names.length > 0)
 ? conn.account_display_names
 : [];
 return (
 <div key={conn.id} className="flex items-center justify-between bg-slate-50/40 rounded-lg px-3 py-2">
 <div className="flex items-center gap-2 flex-wrap">
 <Building2 className="h-4 w-4 text-green-400" />
 <span className="text-slate-900 text-sm font-medium">{conn.bank_name || 'Bank'}</span>
 {names.length === 1 && (
 <span className="text-slate-500 text-xs">· {names[0]}</span>
 )}
 {names.length > 1 && (
 <span className="text-slate-500 text-xs" title={names.join(' · ')}>
 · {names.length} accounts ({names.join(', ')})
 </span>
 )}
 <span className="text-slate-500 text-xs">· active</span>
 {conn.last_synced_at && (
 <span className="text-slate-500 text-xs" title={`Last synced ${formatTimeAgo(conn.last_synced_at)}`}>
 · Last synced {formatAbsoluteDateTime(conn.last_synced_at)}
 </span>
 )}
 </div>
 <button onClick={() => disconnectBank(conn.id, conn.bank_name)} disabled={disconnectingId === conn.id} className="text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title={names.length > 1 ? `Disconnect both accounts on this consent` : 'Disconnect this bank'}>
 <Trash2 className="h-4 w-4" />
 </button>
 </div>
 );
 })}
 </div>
 <p className="text-slate-500 text-xs mt-2">
   Click the trash icon to disconnect a bank. Multi-account consents (e.g. one bank with current + business) revoke as a pair — re-add only the accounts you want.
 </p>
 </div>
 )}

 {/* Next 7 days widget — only relevant when viewing the current
      month. Past months (e.g. "March 2026" when today is April)
      have nothing upcoming by definition, so showing the card
      just adds noise. */}
 {(() => {
   const now = new Date();
   const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
   const viewingMonth = selectedMonth || data.selectedMonth || currentMonth;
   if (viewingMonth !== currentMonth) return null;
   return (
     <div style={{ marginBottom: 14 }}>
       <UpcomingWidget />
     </div>
   );
 })()}

 {/* OVERVIEW (Summary cards + Income breakdown + Monthly trends) */}
 <OverviewPanel data={data} refreshData={refreshData} selectedMonth={selectedMonth || data.selectedMonth} />

 {/* MAIN GRID: Spending + Budgets & Goals */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <SpendingPanel data={data} isPro={isPro} refreshData={refreshData} selectedMonth={selectedMonth || data.selectedMonth} />
 <GoalsAndBudgetsPanel data={data} isPro={isPro} refreshData={refreshData} selectedMonth={selectedMonth || data.selectedMonth} />
 </div>

 {/* Expected Bills (for the selected month) */}
 {expectedBills.length > 0 && (
 <div className="card">
 <div className="flex items-center justify-between mb-4">
 <h3 className="font-semibold text-lg flex items-center gap-2">
 <Clock className="h-5 w-5 text-amber-600" />
 Expected Bills
 <span className="text-slate-500 text-sm font-normal">£{fmtNum(expectedBillsTotal)} expected</span>
 </h3>
 <div className="flex items-center gap-3 text-xs text-slate-500">
 <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full" /> Paid</span>
 <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full" /> Past due</span>
 <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full" /> Upcoming</span>
 </div>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
 {(showAllBills ? expectedBills : expectedBills.slice(0, 12)).map((bill: any) => {
 const statusColor = bill.paid
 ? 'border-green-500/30 bg-green-500/5'
 : bill.past_due
 ? 'border-red-500/30 bg-red-500/5'
 : 'border-slate-200';
 const amountColor = bill.paid ? 'text-green-400' : bill.past_due ? 'text-red-400' : 'text-amber-600';
 const catLabel = bill.category !== 'other' ? bill.category.replace(/_/g, ' ') : '';
 return (
 <div key={bill.bill_key || bill.name} className={`rounded-xl p-3 border ${statusColor}`}>
 <div className="flex items-center justify-between">
 <div className="min-w-0 flex-1">
 <p className={`text-sm font-medium truncate ${bill.paid ? 'text-slate-600 line-through' : 'text-slate-900'}`}>{bill.name}</p>
 <div className="flex items-center gap-2 mt-0.5">
 {bill.billing_day > 0 && <span className="text-[10px] text-slate-500">Due ~{ordinal(bill.billing_day)}</span>}
 {catLabel && <span className="text-[10px] text-slate-500 capitalize">{catLabel}</span>}
 {bill.paid && <span className="text-[10px] text-green-400 font-medium">✓ Paid</span>}
 {bill.past_due && !bill.paid && <span className="text-[10px] text-red-400 font-medium">⚠ Not seen</span>}
 </div>
 </div>
 <div className="flex items-center gap-1.5 ml-2 shrink-0">
 <span className={`text-sm font-semibold whitespace-nowrap ${amountColor}`}>£{fmtNum(bill.expected_amount)}</span>
 {!bill.paid && bill.bill_key && (
 <button
 onClick={() => dismissBill(bill)}
 className="text-slate-600 hover:text-slate-600 transition-colors p-0.5"
 title="Dismiss this expected bill"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 )}
 </div>
 </div>
 <div className="w-full flex justify-end">
 {bill.bill_key && !bill.paid && (
 <button
 onClick={() => markBillPaid(bill, true)}
 className="mt-2 text-[10px] text-slate-500 hover:text-green-400 transition-colors underline underline-offset-2"
 >
 Mark as paid
 </button>
 )}
 {bill.bill_key && bill.paid && (
 <button
 onClick={() => markBillPaid(bill, false)}
 className="mt-2 text-[10px] text-slate-600 hover:text-slate-600 transition-colors underline underline-offset-2"
 >
 Unmark paid
 </button>
 )}
 </div>
 </div>
 );
 })}
 </div>
 {expectedBills.length > 12 && (
 <button
 onClick={() => setShowAllBills(v => !v)}
 className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:text-emerald-600 py-2 mt-1 transition-colors"
 >
 {showAllBills
 ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
 : <><ChevronDown className="h-3.5 w-3.5" /> Show all {expectedBills.length} bills ({expectedBills.length - 12} more)</>}
 </button>
 )}
 </div>
 )}

 {/* Price Increase Alerts */}
 {priceIncreasAlerts.length > 0 && (
 <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
 <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
 <AlertTriangle className="h-5 w-5 text-red-400" />
 Price Increases Detected
 </h3>
 <div className="space-y-2">
 {priceIncreasAlerts.slice(0, 5).map((alert: any) => (
 <div key={alert.id} className="bg-slate-50/50 rounded-xl p-3 border border-slate-200 flex items-center justify-between">
 <div className="min-w-0">
 <p className="text-sm text-slate-900 font-medium">{alert.title || 'Price increase'}</p>
 <p className="text-xs text-slate-500">{alert.details || alert.description || ''}</p>
 </div>
 {alert.value_gbp > 0 && (
 <span className="text-red-400 text-sm font-semibold whitespace-nowrap ml-2">+£{fmtNum(alert.value_gbp)}/yr</span>
 )}
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Contracts + Net Worth row */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <ContractsPanel data={data} isPro={isPro} />
 <NetWorthPanel data={data} isPro={isPro} refreshData={refreshData} />
 </div>

 {/* Ask Paybacker about your money — MCP prompt strip */}
 <div className="card">
 <div className="flex items-start justify-between gap-4 mb-4">
 <div className="min-w-0">
 <h3 className="font-semibold text-lg flex items-center gap-2 flex-wrap">
 <MessageCircle className="h-5 w-5 text-emerald-600" />
 Ask Paybacker about your money
 <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-500/10 border border-emerald-200">
 Pro
 </span>
 </h3>
 <p className="text-slate-600 text-sm mt-1">
 Connect the Paybacker Assistant to your desktop AI app and ask plain-English questions about your own transactions, subscriptions, budgets, and disputes. Read-only — it can&apos;t move money or change anything.
 </p>
 </div>
 <Link
 href={isPro ? '/dashboard/settings/mcp' : '/docs/paybacker-assistant'}
 className="whitespace-nowrap text-xs bg-emerald-500/10 border border-emerald-200 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-500 px-3 py-1.5 rounded-full transition-colors"
 >
 {isPro ? 'Generate token →' : 'Setup guide →'}
 </Link>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
 {[
 'How much did I spend on food and drink last month?',
 'Which subscriptions have I paid for but not used?',
 'Am I over budget on anything this month?',
 'How close am I to my holiday savings goal?',
 'Did I pay British Gas twice in March?',
 'List every open dispute and the total amount I\u2019m trying to recover.',
 ].map((q) => (
 <div
 key={q}
 className="bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700"
 >
 &ldquo;{q}&rdquo;
 </div>
 ))}
 </div>
 {!isPro && (
 <p className="text-xs text-slate-500 mt-4">
 The Paybacker Assistant is a Pro feature.{' '}
 <Link href="/pricing" className="text-emerald-600 hover:text-emerald-500">
 Upgrade for £9.99/mo
 </Link>{' '}
 to unlock it.
 </p>
 )}
 </div>

 {/* Financial Action Centre (Pro) */}
 {isPro && (
 <div className="card">
 <div className="flex items-center justify-between mb-4">
 <h3 className="font-semibold text-lg flex items-center gap-2">
 <Zap className="h-5 w-5 text-amber-600" />
 Financial Action Centre
 {facItems.length > 0 && (
 <span className="text-xs font-normal text-slate-600 ml-1">
 {facCounts.overdue > 0 && <span className="text-red-400 font-semibold">{facCounts.overdue} overdue · </span>}
 {facCounts.due_soon > 0 && <span className="text-amber-600 font-semibold">{facCounts.due_soon} due soon · </span>}
 {facItems.length} tracked
 </span>
 )}
 </h3>
 <Link href="/dashboard/deals" className="text-emerald-600 hover:text-emerald-500 text-sm font-medium">Browse deals →</Link>
 </div>

 {/* Email scan results / alerts */}
 <div className="mb-5">
 <div className="flex items-center justify-between mb-2">
 <p className="text-xs text-slate-600 uppercase tracking-wider font-semibold flex items-center gap-1.5">
 <Mail className="h-3.5 w-3.5 text-purple-400" /> Inbox Scan
 </p>
 <button
 onClick={() => scanInbox(false)}
 disabled={scanning}
 className="text-xs text-emerald-600 hover:text-emerald-500 font-medium disabled:opacity-50 flex items-center gap-1.5"
 >
 {scanning ? (
   <>
     <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
       <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
       <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
     </svg>
     Scanning...
   </>
 ) : (alerts.length > 0 ? 'Re-scan' : 'Scan Now')}
 </button>
 </div>
 {scanning ? (
 <div className="bg-gradient-to-br from-emerald-50 to-emerald-50/30 border border-emerald-200 rounded-xl p-5 text-center">
 <div className="relative mx-auto w-14 h-14 mb-3">
 <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
 <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
 <span className="absolute inset-0 flex items-center justify-center text-2xl">
 {SCAN_CAPTIONS[scanCaption].icon}
 </span>
 </div>
 <p className="text-slate-900 font-semibold text-sm">{SCAN_CAPTIONS[scanCaption].text}</p>
 <p className="text-slate-500 text-xs mt-1">Usually under 30 seconds · read-only, Google-verified access</p>
 </div>
 ) : alerts.length > 0 ? (
 <div className="space-y-2">
 {alerts.slice(0, 5).map((a: any) => (
 <div key={a.id} className="flex items-center justify-between bg-slate-50/50 rounded-lg p-3 border border-slate-200">
 <div className="min-w-0">
 <p className="text-sm text-slate-900 font-medium truncate">{a.title}</p>
 {a.details && <p className="text-xs text-slate-500 truncate">{a.details}</p>}
 </div>
 {a.value_gbp > 0 && <span className="text-emerald-600 text-sm font-semibold whitespace-nowrap ml-2">Save £{fmtNum(a.value_gbp)}</span>}
 </div>
 ))}
 </div>
 ) : (
 <p className="text-slate-500 text-xs">No alerts found. Scan your inbox to detect overcharges and price increases.</p>
 )}
 </div>

 {/* Subscriptions with bank deduplication */}
 <div className="mb-4">
 <div className="flex items-center justify-between mb-2">
 <p className="text-xs text-slate-600 uppercase tracking-wider font-semibold flex items-center gap-1.5">
 <Building2 className="h-3.5 w-3.5 text-amber-600" /> Tracked Subscriptions
 </p>
 <div className="flex items-center gap-3">
 {facLoading && <Loader2 className="h-3 w-3 text-slate-500 animate-spin" />}
 <Link href="/dashboard/subscriptions" className="text-xs text-emerald-600 hover:text-emerald-500 font-medium">View all →</Link>
 </div>
 </div>

 {facItems.length === 0 && !facLoading && (
 <p className="text-slate-500 text-xs py-2">No active subscriptions tracked.</p>
 )}

 {facItems.length > 0 && (() => {
 const displayItems = facShowAll ? facItems : facItems.slice(0, 8);
 return (
 <div className="space-y-2">
 {displayItems.map((item) => {
 const isEditing = facEditId === item.id;
 const cycleLabel = (c: string | null) => c === 'yearly' ? 'yr' : c === 'quarterly' ? 'qtr' : c === 'weekly' ? 'wk' : 'mo';
 const statusBadge = (() => {
 if (item.bankStatus === 'bank_matched') return (
 <span className="inline-flex items-center gap-1 text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5 whitespace-nowrap">
 <Check className="h-2.5 w-2.5" /> In bank data
 </span>
 );
 if (item.bankStatus === 'overdue') return (
 <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 whitespace-nowrap">
 <AlertTriangle className="h-2.5 w-2.5" /> Overdue
 </span>
 );
 if (item.bankStatus === 'due_soon') return (
 <span className="inline-flex items-center gap-1 text-[10px] bg-orange-500/10 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
 <Clock className="h-2.5 w-2.5" /> Due soon
 </span>
 );
 return (
 <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5 whitespace-nowrap">
 Not in bank
 </span>
 );
 })();

 return (
 <div key={item.id} className={`rounded-lg border transition-colors ${isEditing ? 'bg-slate-100 border-emerald-500/40' : 'bg-slate-50/50 border-slate-200'}`}>
 <div className="flex items-center gap-2 p-3">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-sm text-slate-900 font-medium truncate">{item.provider_name}</span>
 {statusBadge}
 </div>
 {item.matchedTxn && (
 <p className="text-[10px] text-slate-500 mt-0.5 truncate">
 Last seen: £{fmtNum(item.matchedTxn.amount)} on {new Date(item.matchedTxn.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
 </p>
 )}
 {item.next_billing_date && item.bankStatus !== 'bank_matched' && (
 <p className="text-[10px] text-slate-500 mt-0.5">
 Due: {new Date(item.next_billing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
 </p>
 )}
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
 <span className={`text-sm font-semibold whitespace-nowrap ${item.bankStatus === 'overdue' ? 'text-red-400' : 'text-amber-600'}`}>
 £{fmtNum(item.amount)}/{cycleLabel(item.billing_cycle)}
 </span>
 <button
 onClick={() => isEditing ? setFacEditId(null) : openFacEdit(item)}
 className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors"
 title="Edit"
 >
 <Pencil className="h-3.5 w-3.5" />
 </button>
 <button
 onClick={() => dismissFacItem(item.id)}
 className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
 title="Dismiss"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 </div>
 </div>

 {/* Inline edit form */}
 {isEditing && (
 <div className="px-3 pb-3 border-t border-slate-200 pt-3">
 <div className="grid grid-cols-3 gap-2 mb-2">
 <div>
 <label className="text-[10px] text-slate-600 uppercase tracking-wider block mb-1">Amount (£)</label>
 <input
 type="number"
 step="0.01"
 min="0"
 value={facEditFields.amount}
 onChange={e => setFacEditFields(f => ({ ...f, amount: e.target.value }))}
 className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
 />
 </div>
 <div>
 <label className="text-[10px] text-slate-600 uppercase tracking-wider block mb-1">Frequency</label>
 <select
 value={facEditFields.billing_cycle}
 onChange={e => setFacEditFields(f => ({ ...f, billing_cycle: e.target.value }))}
 className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
 >
 <option value="weekly">Weekly</option>
 <option value="monthly">Monthly</option>
 <option value="quarterly">Quarterly</option>
 <option value="yearly">Yearly</option>
 <option value="one-time">One-off</option>
 </select>
 </div>
 <div>
 <label className="text-[10px] text-slate-600 uppercase tracking-wider block mb-1">Category</label>
 <select
 value={facEditFields.category}
 onChange={e => setFacEditFields(f => ({ ...f, category: e.target.value }))}
 className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
 >
 {['streaming', 'software', 'fitness', 'broadband', 'mobile', 'utility', 'insurance', 'loan', 'credit_card', 'mortgage', 'council_tax', 'transport', 'shopping', 'charity', 'other'].map(c => (
 <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
 ))}
 </select>
 </div>
 </div>
 <div className="flex gap-2 justify-end">
 {item.bankStatus !== 'bank_matched' && (
 <button
 onClick={() => markFacPaid(item.id)}
 className="text-xs text-green-400 hover:text-green-300 font-medium px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 rounded-lg transition-colors"
 >
 Already paid
 </button>
 )}
 <button
 onClick={() => setFacEditId(null)}
 className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={() => saveFacEdit(item.id)}
 disabled={facSaving}
 className="text-xs font-semibold px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg transition-colors"
 >
 {facSaving ? 'Saving...' : 'Save'}
 </button>
 </div>
 </div>
 )}
 </div>
 );
 })}

 {facItems.length > 8 && (
 <button
 onClick={() => setFacShowAll(v => !v)}
 className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 py-2 transition-colors"
 >
 {facShowAll ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {facItems.length} subscriptions</>}
 </button>
 )}
 </div>
 );
 })()}
 </div>

 {/* Better Deals Section */}
 {(() => {
 // Filter deals through isDealValid to exclude mortgages, loans, council tax etc.
 // This ensures the total here matches the dashboard hero figure
 const validDeals = (deals?.subscriptions || []).flatMap((sub: any) =>
 (sub.comparisons || []).map((c: any) => ({
 subscriptionName: sub.subscriptionName || sub.providerName || 'Unknown',
 currentPrice: c.currentPrice,
 dealProvider: c.dealProvider,
 dealPrice: c.dealPrice,
 annualSaving: c.annualSaving,
 dealUrl: c.dealUrl,
 category: sub.category || '',
 }))
 ).filter((d: any) => d.annualSaving > 0 && isDealValid(d));
 const filteredTotal = validDeals.reduce((sum: number, d: any) => sum + (d.annualSaving || 0), 0);
 
 if (validDeals.length > 0) {
 return (
 <div className="mb-4">
 <div className="flex items-center justify-between mb-2">
 <p className="text-xs text-slate-600 uppercase tracking-wider font-semibold flex items-center gap-1.5">
 <Zap className="h-3.5 w-3.5 text-green-400" /> Cheaper Alternatives Found
 </p>
 <span className="text-xs text-emerald-600 font-medium">Save £{fmtNum(filteredTotal)}/year</span>
 </div>
 <p className="text-xs text-slate-500 mb-3">We found cheaper deals for {validDeals.length} of your subscriptions. Click &quot;Switch&quot; to go directly to the provider.</p>
 <div className="max-h-[300px] overflow-y-auto space-y-2 custom-scrollbar">
 {validDeals
 .sort((a: any, b: any) => (b.annualSaving || 0) - (a.annualSaving || 0))
 .map((deal: any, idx: number) => (
 <div key={`deal-${idx}`} className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <p className="text-sm text-slate-900 font-medium truncate">{deal.subscriptionName}</p>
 <p className="text-xs text-slate-600">£{fmtNum(deal.currentPrice)}/mo → £{fmtNum(deal.dealPrice)}/mo via {deal.dealProvider}</p>
 </div>
 <div className="text-right shrink-0">
 <p className="text-green-400 text-sm font-semibold">Save £{fmtNum(deal.annualSaving)}/yr</p>
 {deal.dealUrl ? (
 <a href={deal.dealUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:text-emerald-500 font-medium flex items-center gap-1 justify-end mt-1">
 Switch <ExternalLink className="h-3 w-3" />
 </a>
 ) : null}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
 } else {
 return (
 <div className="mb-4">
 <p className="text-xs text-slate-500 text-center py-3">No cheaper alternatives found for your subscriptions right now.</p>
 </div>
 );
 }
 })()}

 {/* Manage Subscriptions quick link */}
 <Link href="/dashboard/subscriptions" className="bg-slate-50/50 border border-slate-200 rounded-xl p-3 text-left hover:border-emerald-200 transition-all flex items-center gap-3">
 <Building2 className="h-5 w-5 text-amber-600 shrink-0" />
 <div>
 <p className="text-slate-900 font-medium text-sm">{facItems.length > 0 ? `Manage ${facItems.length} subscriptions` : 'Subscription Audit'}</p>
 <p className="text-slate-500 text-xs">Review, cancel, or switch</p>
 </div>
 </Link>
 </div>
 )}

 {/* Bank accounts info removed — shown in expired banner and header sync area */}

 {/* PRO UPGRADE NUDGE */}
 {!isPro && (
 <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <MessageCircle className="h-5 w-5 text-purple-400" />
 <p className="text-slate-700 text-sm">Unlock the AI Financial Assistant, email scanning, and unlimited budgets & goals.</p>
 </div>
 <Link href="/pricing" className="text-purple-400 hover:text-purple-300 text-sm font-semibold whitespace-nowrap">Upgrade to Pro</Link>
 </div>
 )}

 {/* AI Chat Bubble (Pro only) */}
 {isPro && (
 <>
 <button
 onClick={() => setChatOpen(!chatOpen)}
 className="fixed bottom-6 right-6 z-50 bg-gradient-to-br from-purple-500 to-blue-600 hover:from-purple-400 hover:to-blue-500 text-slate-900 p-4 rounded-full shadow-2xl transition-all"
 title="Financial AI Assistant"
 >
 <MessageCircle className="h-6 w-6" />
 </button>

 {chatOpen && (
 <div className="fixed bottom-20 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] card shadow-2xl flex flex-col" style={{ height: '480px' }}>
 <div className="p-4 border-b border-slate-200 flex items-center justify-between">
 <div>
 <h3 className="font-semibold text-sm">AI Financial Assistant</h3>
 <p className="text-slate-500 text-[10px]">Ask about your finances, recategorise transactions, and more</p>
 </div>
 <button onClick={() => setChatOpen(false)} className="text-slate-500 hover:text-slate-900"><X className="h-4 w-4" /></button>
 </div>
 <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
 {chatMessages.length === 0 && (
 <div className="text-center py-8">
 <MessageCircle className="h-8 w-8 text-purple-400 mx-auto mb-3" />
 <p className="text-slate-600 text-sm">Ask me anything about your finances.</p>
 <div className="flex flex-wrap gap-2 justify-center mt-4">
 {['Where am I spending the most?', 'Show my income breakdown', 'How can I save more?'].map(q => (
 <button key={q} onClick={() => { setChatInput(q); }} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors">{q}</button>
 ))}
 </div>
 </div>
 )}
 {chatMessages.map((m, i) => (
 <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
 <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-purple-500/20 text-purple-100' : 'bg-slate-100 text-slate-700'}`}>
 {m.content}
 </div>
 </div>
 ))}
 {chatLoading && (
 <div className="flex justify-start">
 <div className="bg-slate-100 px-3 py-2 rounded-xl"><Loader2 className="h-4 w-4 text-emerald-600 animate-spin" /></div>
 </div>
 )}
 <div ref={chatEndRef} />
 </div>
 <div className="p-3 border-t border-slate-200">
 <div className="flex gap-2">
 <input
 value={chatInput}
 onChange={(e) => setChatInput(e.target.value)}
 onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
 placeholder="Ask about your finances..."
 className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-400"
 />
 <button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()} className="bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-slate-900 p-2 rounded-lg transition-colors">
 <Send className="h-4 w-4" />
 </button>
 </div>
 </div>
 </div>
 )}
 </>
 )}

 {showBankPicker && <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />}
 {disconnectModal && (
   <DisconnectBankModal
     open={!!disconnectModal}
     bankName={disconnectModal.bankName}
     connectionId={disconnectModal.connectionId}
     accounts={disconnectModal.accounts}
     onClose={() => setDisconnectModal(null)}
     onConfirmed={handleDisconnectConfirmed}
   />
 )}
 </div>
 );
}
