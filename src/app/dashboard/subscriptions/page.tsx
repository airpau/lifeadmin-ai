'use client';


import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CreditCard, Calendar, TrendingDown, X, Mail, Copy, CheckCircle, Plus, Loader2, Inbox, Sparkles, Pencil, Building2, RefreshCw, Wifi, WifiOff, AlertTriangle, MoreHorizontal, FileText, Upload, Bell, CalendarClock, Shield } from 'lucide-react';
import Image from 'next/image';
import { capture } from '@/lib/posthog';
import { formatGBP } from '@/lib/format';
import ShareWinModal from '@/components/share/ShareWinModal';
import CreditScoreWarning from '@/components/subscriptions/CreditScoreWarning';
import { shouldShowShareModal, hasSharedThisSession } from '@/lib/share-triggers';
import { isCreditProduct } from '@/lib/credit-product-detector';
import ComparisonCard from '@/components/subscriptions/ComparisonCard';
import { cleanMerchantName } from '@/lib/merchant-utils';
import { SORTED_CATEGORIES, getCategoryLabel, getCategoryColor, getCategoryBgColor, getCategoryIcon } from '@/lib/category-config';

interface ContractAlert {
  id: string;
  subscription_id: string;
  user_id: string;
  provider_name: string;
  category: string | null;
  contract_end_date: string;
  current_amount: number | null;
  alert_type: string;
  alert_channel: string;
  status: string;
  matched_deal_id: string | null;
  potential_saving_monthly: number | null;
  potential_saving_annual: number | null;
  created_at: string;
}

interface Subscription {
  id: string;
  provider_name: string;
  category: string | null;
  amount: number;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  next_billing_date: string | null;
  last_used_date: string | null;
  usage_frequency: string | null;
  status: 'active' | 'pending_cancellation' | 'cancelled' | 'expired' | 'dismissed';
  account_email: string | null;
  cancel_requested_at: string | null;
  source?: 'manual' | 'email' | 'bank' | 'bank_and_email';
  bank_description?: string | null;
  notes?: string | null;
  contract_type?: string | null;
  contract_end_date?: string | null;
  contract_start_date?: string | null;
  contract_term_months?: number | null;
  auto_renews?: boolean | null;
  early_exit_fee?: number | null;
  provider_type?: string | null;
  current_tariff?: string | null;
  alerts_enabled?: boolean;
  alert_before_days?: number;
  contract_end_source?: string | null;
  logo_url?: string | null;
  needs_review?: boolean;
}

interface BankConnection {
  id: string;
  provider_id: string | null;
  status: string;
  last_synced_at: string | null;
  connected_at: string;
  account_ids: string[] | null;
  bank_name: string | null;
  account_display_names: string[] | null;
}

interface CancellationEmail {
  subject: string;
  body: string;
}

const CATEGORIES = ['streaming', 'software', 'fitness', 'news', 'shopping', 'gaming', 'energy', 'broadband', 'mobile', 'insurance', 'mortgage', 'loan', 'council_tax', 'water', 'tv', 'other'];
const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly', 'one-time'];

/** Normalise a raw bank merchant name (e.g. "DELIVEROO PLUS SUBS") to a clean display name */
function normaliseProviderName(raw: string): string {
  return cleanMerchantName(raw);
}
const STATUTORY_KEYWORDS = ['council', 'testvalley', 'winchester', 'lbh', 'l.b.hounslow', 'dvla', 'hmrc'];

function isStatutoryService(name: string): boolean {
  const lower = name.toLowerCase();
  return STATUTORY_KEYWORDS.some(kw => lower.includes(kw));
}

const CONTRACT_TYPES = ['subscription', 'fixed_contract', 'mortgage', 'loan', 'insurance', 'lease', 'membership', 'utility', 'other'];
const PROVIDER_TYPES = ['energy', 'broadband', 'mobile', 'tv', 'insurance', 'mortgage', 'loan', 'credit_card', 'streaming', 'software', 'fitness', 'council_tax', 'water', 'other'];

export default function SubscriptionsPage() {
  const searchParams = useSearchParams();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [cancelInfo, setCancelInfo] = useState<{ email?: string; phone?: string; url?: string; method: string; tips?: string } | null>(null);
  const [cancellationEmail, setCancellationEmail] = useState<CancellationEmail | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingSubscription, setAddingSubscription] = useState(false);
  const [detectingFromInbox, setDetectingFromInbox] = useState(false);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [detectedSubs, setDetectedSubs] = useState<any[]>([]);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState({
    provider_name: '',
    category: 'other',
    amount: '',
    billing_cycle: 'monthly',
    next_billing_date: '',
    account_email: '',
    contract_type: '',
    contract_end_date: '',
    contract_start_date: '',
    contract_term_months: '' as string,
    auto_renews: true,
    early_exit_fee: '' as string,
    provider_type: '',
    current_tariff: '',
    alerts_enabled: true,
    alert_before_days: '30',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [newSub, setNewSub] = useState({
    provider_name: '',
    category: 'streaming',
    amount: '',
    billing_cycle: 'monthly',
    next_billing_date: '',
    account_email: '',
    usage_frequency: 'sometimes',
    contract_type: '',
    contract_end_date: '',
    contract_start_date: '',
    contract_term_months: '' as string,
    auto_renews: true,
    early_exit_fee: '' as string,
    provider_type: '',
    current_tariff: '',
    alerts_enabled: true,
    alert_before_days: '30',
    source: 'manual',
  });

  // Contract alerts state
  const [contractAlerts, setContractAlerts] = useState<ContractAlert[]>([]);
  const [billUploadSubId, setBillUploadSubId] = useState<string | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [uploadingBill, setUploadingBill] = useState(false);
  const [billToast, setBillToast] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState<{ open: boolean; amount: number; provider: string }>({ open: false, amount: 0, provider: '' });
  const [creditWarning, setCreditWarning] = useState<{ open: boolean; productType: string; providerName: string; warningContent: string; sub: Subscription | null }>({ open: false, productType: '', providerName: '', warningContent: '', sub: null });
  const [bankConnections, setBankConnections] = useState<BankConnection[]>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [bankToast, setBankToast] = useState<string | null>(null);
  const [subComparisons, setSubComparisons] = useState<Record<string, any[]>>({});

  // Fetch contract renewal alerts
  const fetchContractAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/contract-alerts');
      if (res.ok) {
        const data = await res.json();
        setContractAlerts(data);
      }
    } catch (e) {
      console.error('Error fetching contract alerts:', e);
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data);
      }
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const [expiredBanks, setExpiredBanks] = useState<BankConnection[]>([]);
  const fetchBankConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/bank/connection');
      if (res.ok) {
        const data = await res.json();
        setBankConnections(data.connections || []);
        setExpiredBanks(data.expired || []);
      }
    } catch (error) {
      console.error('Error fetching bank connection:', error);
    } finally {
      setBankLoading(false);
    }
  }, []);

  const fetchComparisons = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions/compare', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.comparisons) {
          setSubComparisons(data.comparisons);
        }
      }
    } catch {} // Non-critical
  }, []);

  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('price_desc');
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());

  // Initialize from searchParams
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) setFilterCategory(cat);

    const isNew = searchParams.get('new');
    if (isNew === '1') {
      const provider = searchParams.get('provider');
      const amount = searchParams.get('amount');
      
      setNewSub(prev => ({
        ...prev,
        provider_name: provider || '',
        amount: amount || '',
        category: 'streaming',
      }));
      setShowAddForm(true);
      // Clean up the URL to prevent re-opening on refresh
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('new');
      newUrl.searchParams.delete('provider');
      newUrl.searchParams.delete('amount');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [searchParams]);

  // Update URL
  useEffect(() => {
    const url = new URL(window.location.href);
    if (filterCategory !== 'All') url.searchParams.set('category', filterCategory);
    else url.searchParams.delete('category');
    window.history.replaceState({}, '', url.toString());
  }, [filterCategory]);

  useEffect(() => {
    fetchSubscriptions();
    fetchBankConnection();
    fetchComparisons();
    fetchContractAlerts();
  }, [fetchSubscriptions, fetchBankConnection, fetchComparisons, fetchContractAlerts]);

  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      setBankToast('Bank connected! We\'ve synced your last 12 months of transactions.');
      capture('bank_connected');
      const t = setTimeout(() => setBankToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // Filter out loans, mortgages, credit cards from subscriptions view
  // These are shown in Money Hub / Spending Insights instead
  const DEBT_KEYWORDS = ['mortgage', 'loan', 'finance', 'lendinvest', 'skipton', 'santander loan', 'natwest loan', 'novuna', 'ca auto', 'auto finance', 'funding circle', 'zopa'];
  const CREDIT_CARD_KEYWORDS = ['barclaycard', 'mbna', 'halifax credit', 'hsbc bank visa', 'virgin money', 'capital one', 'american express', 'amex', 'securepay', 'credit card'];
  const COUNCIL_TAX_KEYWORDS = ['council', 'testvalley', 'winchester city', 'hounslow', 'lbh', 'l.b.'];

  const isFinancePayment = (name: string) => {
    const lower = name.toLowerCase();
    return DEBT_KEYWORDS.some(kw => lower.includes(kw)) ||
      CREDIT_CARD_KEYWORDS.some(kw => lower.includes(kw));
  };

  // Subscriptions = everything except loans, mortgages, credit cards
  // Also deduplicate by normalised name (e.g. "LBH" and "L.B.Hounslow" are the same)
  const baseSubscriptions = (() => {
    const filtered = subscriptions.filter(s => !isFinancePayment(s.provider_name));
    const seen = new Map<string, boolean>();
    return filtered.filter(s => {
      const normName = cleanMerchantName(s.provider_name).toLowerCase();
      if (seen.has(normName)) return false;
      seen.set(normName, true);
      return true;
    });
  })();
  const hiddenFinanceCount = subscriptions.filter(s => s.status === 'active' && isFinancePayment(s.provider_name)).length;

  const displaySubscriptions = (() => {
    let result = [...baseSubscriptions];

    if (filterCategory !== 'All') {
      result = result.filter(s => s.category === filterCategory);
    }

    result.sort((a, b) => {
      if (sortBy === 'price_desc') {
        const amtA = a.billing_cycle === 'yearly' ? a.amount / 12 : a.amount;
        const amtB = b.billing_cycle === 'yearly' ? b.amount / 12 : b.amount;
        return (amtB || 0) - (amtA || 0);
      }
      if (sortBy === 'price_asc') {
        const amtA = a.billing_cycle === 'yearly' ? a.amount / 12 : a.amount;
        const amtB = b.billing_cycle === 'yearly' ? b.amount / 12 : b.amount;
        return (amtA || 0) - (amtB || 0);
      }
      if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
      if (sortBy === 'date_added') return new Date(b.last_used_date || 0).getTime() - new Date(a.last_used_date || 0).getTime();
      return 0;
    });

    return result;
  })();

  const [mergingDuplicates, setMergingDuplicates] = useState(false);
  const [showDuplicateDetails, setShowDuplicateDetails] = useState(false);
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());
  const [groupAmountOverrides, setGroupAmountOverrides] = useState<Record<string, string>>({});
  const duplicateGroups = (() => {
    const groups: Record<string, Subscription[]> = {};
    subscriptions.filter(s => !isFinancePayment(s.provider_name) && s.status === 'active').forEach(s => {
      const key = `${cleanMerchantName(s.provider_name).toLowerCase()}|${s.category}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return Object.values(groups).filter(g => g.length > 1);
  })();

  // Sort group so the best entry to keep is first:
  // 1. Prefer bank-sourced (bank/bank_and_email) — real transaction data
  // 2. Prefer non-zero amount over zero
  // 3. Then highest amount wins
  const rankForKeep = (s: Subscription) => {
    const bankScore = (s.source === 'bank' || s.source === 'bank_and_email') ? 2 : 0;
    const nonZeroScore = (s.amount && s.amount > 0) ? 1 : 0;
    return bankScore + nonZeroScore;
  };

  const handleMergeDuplicates = async (singleGroup?: Subscription[], groupKey?: string) => {
    setMergingDuplicates(true);
    let deletedCount = 0;
    const groups = singleGroup ? [singleGroup] : duplicateGroups;
    for (const group of groups) {
      const sorted = [...group].sort((a, b) => rankForKeep(b) - rankForKeep(a) || b.amount - a.amount);
      const keep = sorted[0];
      const duplicates = sorted.slice(1);

      // Apply amount override if user edited it
      const key = groupKey || `${cleanMerchantName(group[0].provider_name).toLowerCase()}|${group[0].category}`;
      const overrideVal = groupAmountOverrides[key];
      if (overrideVal !== undefined) {
        const parsed = parseFloat(overrideVal);
        if (!isNaN(parsed) && parsed !== keep.amount) {
          await fetch(`/api/subscriptions/${keep.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: parsed }),
          });
        }
      }

      for (const dup of duplicates) {
        await fetch(`/api/subscriptions/${dup.id}`, { method: 'DELETE' });
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      await fetchSubscriptions();
    }
    setMergingDuplicates(false);
  };

  const handleDismissGroup = (key: string) => {
    setDismissedGroups(prev => new Set([...prev, key]));
  };

  const activeDuplicateGroups = duplicateGroups.filter(g => {
    const key = `${cleanMerchantName(g[0].provider_name).toLowerCase()}|${g[0].category}`;
    return !dismissedGroups.has(key);
  });

  const statutoryTotalMonthly = baseSubscriptions
    .filter(s => s.status === 'active' && s.billing_cycle !== 'one-time' && isStatutoryService(normaliseProviderName(s.provider_name)))
    .reduce((sum, s) => {
      let monthlyAmt = parseFloat(String(s.amount)) || 0;
      if (s.billing_cycle === 'yearly') monthlyAmt = monthlyAmt / 12;
      else if (s.billing_cycle === 'quarterly') monthlyAmt = monthlyAmt / 3;
      return sum + monthlyAmt;
    }, 0);

  const flexibleTotalMonthly = baseSubscriptions
    .filter(s => s.status === 'active' && s.billing_cycle !== 'one-time' && !isStatutoryService(normaliseProviderName(s.provider_name)))
    .reduce((sum, s) => {
      let monthlyAmt = parseFloat(String(s.amount)) || 0;
      if (s.billing_cycle === 'yearly') monthlyAmt = monthlyAmt / 12;
      else if (s.billing_cycle === 'quarterly') monthlyAmt = monthlyAmt / 3;
      return sum + monthlyAmt;
    }, 0);

  const totalMonthly = statutoryTotalMonthly + flexibleTotalMonthly;

  const handleToggleBulk = (id: string) => {
    const newSet = new Set(selectedForBulk);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedForBulk(newSet);
  };

  const handleDetectFromInbox = async () => {
    setDetectingFromInbox(true);
    setDetectedSubs([]);
    try {
      const res = await fetch('/api/gmail/detect-subscriptions', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        // Filter out already-tracked ones
        const tracked = subscriptions.map((s) => s.provider_name.toLowerCase());
        const novel = (data.subscriptions || []).filter(
          (s: any) => !tracked.includes(s.provider_name.toLowerCase())
        );
        setDetectedSubs(novel);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetectingFromInbox(false);
    }
  };

  const handleAddDetected = (detected: any) => {
    setNewSub({
      provider_name: detected.provider_name,
      category: detected.category || 'other',
      amount: detected.amount ? detected.amount.toString() : '',
      billing_cycle: detected.billing_cycle || 'monthly',
      next_billing_date: '',
      account_email: '',
      usage_frequency: 'sometimes',
      contract_type: '',
      contract_end_date: '',
      contract_start_date: '',
      contract_term_months: '',
      auto_renews: true,
      early_exit_fee: '',
      provider_type: '',
      current_tariff: '',
      alerts_enabled: true,
      alert_before_days: '30',
      source: 'email',
    });
    setDetectedSubs((prev) => prev.filter((s) => s.provider_name !== detected.provider_name));
    setShowAddForm(true);
  };

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingSubscription(true);
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: newSub.provider_name,
          category: newSub.category,
          amount: parseFloat(newSub.amount),
          billing_cycle: newSub.billing_cycle,
          usage_frequency: newSub.usage_frequency,
          next_billing_date: newSub.next_billing_date || null,
          account_email: newSub.account_email || null,
          contract_type: newSub.contract_type || null,
          contract_end_date: newSub.contract_end_date || null,
          contract_start_date: newSub.contract_start_date || null,
          contract_term_months: newSub.contract_term_months ? parseInt(newSub.contract_term_months) : null,
          auto_renews: newSub.auto_renews,
          early_exit_fee: newSub.early_exit_fee ? parseFloat(newSub.early_exit_fee) : null,
          provider_type: newSub.provider_type || null,
          current_tariff: newSub.current_tariff || null,
          alerts_enabled: newSub.alerts_enabled,
          alert_before_days: parseInt(newSub.alert_before_days) || 30,
          contract_end_source: newSub.contract_end_date ? 'manual' : null,
          source: newSub.source || 'manual',
        }),
      });
      if (res.ok) {
        await fetchSubscriptions();
        setShowAddForm(false);
        setNewSub({
          provider_name: '',
          category: 'streaming',
          amount: '',
          billing_cycle: 'monthly',
          next_billing_date: '',
          account_email: '',
          usage_frequency: 'sometimes',
          contract_type: '',
          contract_end_date: '',
          contract_start_date: '',
          contract_term_months: '',
          auto_renews: true,
          early_exit_fee: '',
          provider_type: '',
          current_tariff: '',
          alerts_enabled: true,
          alert_before_days: '30',
          source: 'manual',
        });
        
        // Auto-dismiss the task that triggered this
        const taskId = searchParams.get('taskId');
        if (taskId) {
           await fetch('/api/tasks/dismiss', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ taskId })
           });
           const newUrl = new URL(window.location.href);
           newUrl.searchParams.delete('taskId');
           window.history.replaceState({}, '', newUrl.toString());
        }
      }
    } catch (error) {
      console.error('Error adding subscription:', error);
    } finally {
      setAddingSubscription(false);
    }
  };

  const [cancelFeedback, setCancelFeedback] = useState('');
  const [showCancelFeedback, setShowCancelFeedback] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const attemptMarkCancelled = (sub: Subscription) => {
    const credit = isCreditProduct(sub.provider_name, sub.category || undefined);
    if (credit.isCreditProduct) {
      setCreditWarning({
        open: true,
        productType: credit.productType,
        providerName: sub.provider_name,
        warningContent: credit.warningContent,
        sub,
      });
      return;
    }
    handleMarkCancelled(sub);
  };

  const handleMarkCancelled = async (sub: Subscription) => {
    // Auto-calculate annual saving for the share modal
    const annualSaving = sub.billing_cycle === 'yearly'
      ? parseFloat(String(sub.amount))
      : sub.billing_cycle === 'quarterly'
        ? parseFloat(String(sub.amount)) * 4
        : (parseFloat(String(sub.amount)) || 0) * 12;

    const monthlyAmt = sub.billing_cycle === 'yearly'
      ? parseFloat(String(sub.amount)) / 12
      : sub.billing_cycle === 'quarterly'
        ? parseFloat(String(sub.amount)) / 3
        : parseFloat(String(sub.amount)) || 0;

    try {
      await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          money_saved: parseFloat(monthlyAmt.toFixed(2)),
        }),
      });
      await fetchSubscriptions();

      // Show share modal if the saving is substantial
      if (shouldShowShareModal('cancellation', annualSaving) && !hasSharedThisSession()) {
        setShareModal({ open: true, amount: Math.round(annualSaving), provider: sub.provider_name });
      }
    } catch (err) {
      console.error('Failed to mark as cancelled:', err);
    }
  };

  const handleCancelRequest = async (subscription: Subscription, feedback?: string, previousEmail?: string) => {
    setSelectedSub(subscription);
    if (!feedback) {
      setGenerating(true);
      setCancellationEmail(null);
    } else {
      setRegenerating(true);
    }
    setCancellationError(null);

    try {
      const res = await fetch('/api/subscriptions/cancellation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscription.id,
          providerName: subscription.provider_name,
          amount: subscription.amount,
          billingCycle: subscription.billing_cycle,
          accountEmail: subscription.account_email || cancelInfo?.email,
          category: subscription.category,
          cancelMethod: cancelInfo?.method,
          cancelEmail: cancelInfo?.email,
          cancelPhone: cancelInfo?.phone,
          feedback,
          previousEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCancellationError(data.error || 'Failed to generate cancellation email. Please try again.');
      } else {
        setCancellationEmail(data);
        setCancelFeedback('');
        setShowCancelFeedback(false);
        capture('cancellation_email_generated', { provider: subscription.provider_name, category: subscription.category });
        await fetchSubscriptions();
      }
    } catch (error: any) {
      setCancellationError(error.message || 'Failed to generate cancellation email. Please try again.');
    } finally {
      setGenerating(false);
      setRegenerating(false);
    }
  };

  const openEditModal = (sub: Subscription) => {
    setEditSub(sub);
    setEditForm({
      provider_name: sub.provider_name,
      category: sub.category || 'other',
      amount: sub.amount.toString(),
      billing_cycle: sub.billing_cycle,
      next_billing_date: sub.next_billing_date ? sub.next_billing_date.split('T')[0] : '',
      account_email: sub.account_email || '',
      contract_type: sub.contract_type || '',
      contract_end_date: sub.contract_end_date ? sub.contract_end_date.split('T')[0] : '',
      contract_start_date: sub.contract_start_date ? sub.contract_start_date.split('T')[0] : '',
      contract_term_months: sub.contract_term_months ? String(sub.contract_term_months) : '',
      auto_renews: sub.auto_renews !== false,
      early_exit_fee: sub.early_exit_fee ? String(sub.early_exit_fee) : '',
      provider_type: sub.provider_type || '',
      current_tariff: sub.current_tariff || '',
      alerts_enabled: sub.alerts_enabled !== false,
      alert_before_days: String(sub.alert_before_days || 30),
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSub) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/subscriptions/${editSub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: editForm.provider_name,
          category: editForm.category,
          amount: parseFloat(editForm.amount),
          billing_cycle: editForm.billing_cycle,
          next_billing_date: editForm.next_billing_date || null,
          account_email: editForm.account_email || null,
          contract_type: editForm.contract_type || null,
          contract_end_date: editForm.contract_end_date || null,
          contract_start_date: editForm.contract_start_date || null,
          contract_term_months: editForm.contract_term_months ? parseInt(editForm.contract_term_months) : null,
          auto_renews: editForm.auto_renews,
          early_exit_fee: editForm.early_exit_fee ? parseFloat(editForm.early_exit_fee) : null,
          provider_type: editForm.provider_type || null,
          current_tariff: editForm.current_tariff || null,
          alerts_enabled: editForm.alerts_enabled,
          alert_before_days: parseInt(editForm.alert_before_days) || 30,
          contract_end_source: editForm.contract_end_date ? 'manual' : null,
        }),
      });
      if (res.ok) {
        await fetchSubscriptions();
        setEditSub(null);
      }
    } catch (error) {
      console.error('Error updating subscription:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSubscription = async (id: string) => {
    try {
      await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSub?.id === id) {
        setSelectedSub(null);
        setCancellationEmail(null);
      }
    } catch (error) {
      console.error('Error deleting subscription:', error);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncBank = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/bank/sync', { method: 'POST' });
      if (res.ok) {
        await fetchBankConnection();
        await fetchSubscriptions();
        setBankToast('Sync complete!');
        capture('bank_synced');
        setTimeout(() => setBankToast(null), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setBankToast(`Sync failed: ${data.error || 'Please try again.'}`);
        setTimeout(() => setBankToast(null), 5000);
      }
    } catch {
      setBankToast('Sync failed. Please check your connection and try again.');
      setTimeout(() => setBankToast(null), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectBank = async (connectionId?: string) => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/bank/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        setBankConnections((prev) => prev.filter((c) => c.id !== connectionId));
      }
    } catch (err) {
      console.error('Disconnect failed:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ sub: Subscription; email: any; error?: string }[] | null>(null);

  const handleBulkCancel = async () => {
    setBulkGenerating(true);
    setBulkResults(null);
    const results: { sub: Subscription; email: any; error?: string }[] = [];
    
    for (const id of Array.from(selectedForBulk)) {
      const sub = subscriptions.find(s => s.id === id);
      if (!sub) continue;
      try {
        const res = await fetch('/api/subscriptions/cancellation-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptionId: sub.id,
            providerName: sub.provider_name,
            amount: sub.amount,
            billingCycle: sub.billing_cycle,
            accountEmail: sub.account_email,
            category: sub.category,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          results.push({ sub, email: null, error: data.error || 'Failed' });
        } else {
          results.push({ sub, email: data });
        }
      } catch (err: any) {
        results.push({ sub, email: null, error: err.message });
      }
    }
    setBulkResults(results);
    setBulkGenerating(false);
    setSelectedForBulk(new Set());
    await fetchSubscriptions();
  };

  const [inlineRecatSub, setInlineRecatSub] = useState<string | null>(null);

  const handleInlineRecategorise = async (sub: Subscription, newCategory: string) => {
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory }),
      });
      if (res.ok) {
        // Also update merchant rules conceptually
        setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, category: newCategory } : s));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setInlineRecatSub(null);
    }
  };

  const getSourceBadges = (source?: string) => {
    if (!source || source === 'manual') {
      return <span className="text-xs bg-navy-700/50 text-slate-400 px-1.5 py-0.5 rounded" title="Manually added">✏️</span>;
    }
    return (
      <span className="flex gap-1">
        {(source === 'bank' || source === 'bank_and_email') && (
          <span className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded" title="Detected from bank">🏦</span>
        )}
        {(source === 'email' || source === 'bank_and_email') && (
          <span className="text-xs bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded" title="Detected from email">📧</span>
        )}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded font-medium">Active</span>;
      case 'pending_cancellation':
        return <span className="text-xs bg-mint-400/10 text-mint-400 px-2 py-1 rounded font-medium">Cancelling</span>;
      case 'cancelled':
        return <span className="text-xs bg-slate-500/10 text-slate-400 px-2 py-1 rounded font-medium">Cancelled</span>;
      default:
        return null;
    }
  };

  // Contract badge component
  const ContractBadge = ({ contractEndDate }: { contractEndDate: string | null | undefined }) => {
    if (!contractEndDate) return null;
    const daysLeft = Math.ceil((new Date(contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400">
          Out of contract
        </span>
      );
    }
    if (daysLeft <= 7) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
          <AlertTriangle className="h-3 w-3" /> {daysLeft}d left
        </span>
      );
    }
    if (daysLeft <= 30) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
          {daysLeft}d left
        </span>
      );
    }
    if (daysLeft <= 90) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400">
          {daysLeft}d left
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
        In contract
      </span>
    );
  };

  // Handle bill upload for contract extraction
  const handleBillUpload = async (subId: string) => {
    if (!billFile) return;
    setUploadingBill(true);
    try {
      const fd = new FormData();
      fd.append('file', billFile);
      fd.append('subscriptionId', subId);

      const res = await fetch('/api/contracts/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      const extraction = await res.json();
      const endDate = extraction.contract_end_date;
      setBillToast(endDate
        ? `Contract end date extracted: ${new Date(endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : 'Contract uploaded and analysed successfully'
      );
      await fetchSubscriptions();
      setBillUploadSubId(null);
      setBillFile(null);
      setTimeout(() => setBillToast(null), 5000);
    } catch (err: any) {
      setBillToast(`Upload failed: ${err.message}`);
      setTimeout(() => setBillToast(null), 5000);
    } finally {
      setUploadingBill(false);
    }
  };

  // Dismiss a contract renewal alert
  const handleDismissAlert = async (alertId: string) => {
    try {
      await fetch('/api/contract-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, status: 'dismissed' }),
      });
      setContractAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (e) {
      console.error('Failed to dismiss alert:', e);
    }
  };

  // Track deal click from contract alert
  const handleAlertDealClick = async (alertId: string) => {
    try {
      await fetch('/api/contract-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, status: 'clicked' }),
      });
    } catch (e) {
      console.error('Failed to track alert click:', e);
    }
  };

  // Count of active subs without contract end date
  const subsWithoutContractEnd = baseSubscriptions.filter(s => s.status === 'active' && !s.contract_end_date).length;
  const hasAnyContractEndDate = baseSubscriptions.some(s => s.contract_end_date);

  // Auto-calculate contract end date for edit form
  useEffect(() => {
    if (editForm.contract_start_date && editForm.contract_term_months && !editForm.contract_end_date) {
      const start = new Date(editForm.contract_start_date);
      start.setMonth(start.getMonth() + parseInt(editForm.contract_term_months));
      setEditForm(prev => ({ ...prev, contract_end_date: start.toISOString().split('T')[0] }));
    }
  }, [editForm.contract_start_date, editForm.contract_term_months]);

  // Auto-calculate contract end date for new sub form
  useEffect(() => {
    if (newSub.contract_start_date && newSub.contract_term_months && !newSub.contract_end_date) {
      const start = new Date(newSub.contract_start_date);
      start.setMonth(start.getMonth() + parseInt(newSub.contract_term_months));
      setNewSub(prev => ({ ...prev, contract_end_date: start.toISOString().split('T')[0] }));
    }
  }, [newSub.contract_start_date, newSub.contract_term_months]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {/* Share Win Modal */}
      <ShareWinModal
        open={shareModal.open}
        onClose={() => setShareModal((m) => ({ ...m, open: false }))}
        amount={shareModal.amount}
        type="cancellation"
        providerName={shareModal.provider}
      />

      {/* Credit Score Warning Modal */}
      <CreditScoreWarning
        open={creditWarning.open}
        onClose={() => setCreditWarning((m) => ({ ...m, open: false }))}
        productType={creditWarning.productType}
        providerName={creditWarning.providerName}
        warningContent={creditWarning.warningContent}
        onProceed={() => {
          setCreditWarning((m) => ({ ...m, open: false }));
          if (creditWarning.sub) handleMarkCancelled(creditWarning.sub);
        }}
      />

      {/* Bulk Results Modal */}
      {bulkResults && (
        <div className="fixed inset-0 bg-navy-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 lg:p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2 font-[family-name:var(--font-heading)] flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-mint-400" /> Bulk Cancellation Complete
                </h2>
                <p className="text-slate-400">We've drafted cancellation emails for {bulkResults.length} subscriptions.</p>
              </div>
              <button
                onClick={() => setBulkResults(null)}
                className="text-slate-400 hover:text-white p-2 rounded-lg transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {bulkResults.map((result, i) => (
                <div key={i} className="bg-navy-950 border border-navy-700/50 rounded-xl p-5">
                  <h3 className="text-lg font-semibold text-white mb-2">{result.sub.provider_name}</h3>
                  {result.error ? (
                    <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                      Error: {result.error}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-300 mb-2 border-b border-navy-800 pb-2">
                        Subject: {result.email.subject}
                      </p>
                      <div className="bg-navy-800/50 rounded-lg p-3 max-h-48 overflow-y-auto text-sm text-slate-300 font-mono text-xs whitespace-pre-wrap">
                        {result.email.body}
                      </div>
                      <button
                        onClick={() => handleCopy(result.email.body)}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-navy-800 hover:bg-navy-700 text-slate-300 rounded-lg text-sm transition-all"
                      >
                        {copied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied' : 'Copy Email Body'}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setBulkResults(null)}
                className="px-6 py-3 bg-navy-800 hover:bg-navy-700 text-white rounded-xl transition-all font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank toast (success or error) */}
      {bankToast && (
        <div className={`fixed top-6 right-6 z-50 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${bankToast.toLowerCase().includes('fail') || bankToast.toLowerCase().includes('error') ? 'bg-red-600' : 'bg-green-500'}`}>
          <CheckCircle className="h-5 w-5" />
          {bankToast}
        </div>
      )}

      {/* Bank connections */}
      {!bankLoading && (
        <div className="mb-8 space-y-3">
          {/* Show each connected bank */}
          {bankConnections.map((conn) => (
            <div key={conn.id} className="bg-navy-900 backdrop-blur-sm border border-green-500/30 rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="bg-green-500/10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                  <Wifi className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-green-400 font-semibold text-sm">
                      {conn.bank_name || 'Bank connected'}
                    </span>
                    <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded">Active</span>
                    {conn.account_ids && conn.account_ids.length > 1 && (
                      <span className="text-xs text-slate-500">{conn.account_ids.length} accounts</span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs">
                    {conn.account_display_names && conn.account_display_names.length > 0 && (
                      <span>{conn.account_display_names.join(', ')} · </span>
                    )}
                    {conn.last_synced_at
                      ? `Last synced: ${(() => {
                          const diff = Date.now() - new Date(conn.last_synced_at).getTime();
                          const mins = Math.floor(diff / 60000);
                          if (mins < 1) return 'just now';
                          if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
                          const hours = Math.floor(mins / 60);
                          if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
                          const days = Math.floor(hours / 24);
                          return `${days} day${days > 1 ? 's' : ''} ago`;
                        })()}`
                      : 'Never synced'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSyncBank}
                    disabled={syncing}
                    className="flex items-center gap-2 bg-navy-800 hover:bg-navy-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-all text-sm"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button
                    onClick={() => handleDisconnectBank(conn.id)}
                    disabled={disconnecting}
                    className="flex items-center gap-2 text-slate-500 hover:text-red-400 disabled:opacity-50 text-sm transition-all"
                  >
                    <WifiOff className="h-4 w-4" />
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Expired bank connections */}
          {expiredBanks.length > 0 && bankConnections.length === 0 && (
            expiredBanks.map((conn) => (
              <div key={conn.id} className="bg-navy-900 backdrop-blur-sm border border-mint-400/30 rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="bg-mint-400/10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                    <WifiOff className="h-5 w-5 text-mint-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-mint-400 font-semibold text-sm">{conn.bank_name || 'Bank'}</span>
                      <span className="text-xs bg-mint-400/10 text-mint-400 px-2 py-0.5 rounded">Expired</span>
                    </div>
                    <p className="text-slate-500 text-xs">
                      Connection expired. Your existing data is safe. Reconnect to resume auto-sync.
                    </p>
                  </div>
                  <a
                    href="/api/auth/truelayer"
                    className="flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reconnect
                  </a>
                </div>
              </div>
            ))
          )}

          {/* Add another bank button */}
          <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  {bankConnections.length === 0 && expiredBanks.length === 0
                    ? 'Connect your bank for automatic detection'
                    : 'Connect another bank account'}
                </h3>
                <p className="text-slate-400 text-sm mb-1">
                  We use TrueLayer (FCA regulated) to securely read your transactions. We never store your credentials.
                </p>
                {bankConnections.length === 0 && expiredBanks.length === 0 && (
                  <p className="text-slate-500 text-xs">
                    Supported banks: Barclays, HSBC, Lloyds, NatWest, Santander, Monzo, Starling, and more
                  </p>
                )}
              </div>
              <a
                href="/api/auth/truelayer"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-xl transition-all text-sm shrink-0"
              >
                <Building2 className="h-4 w-4" />
                {bankConnections.length === 0 ? 'Connect Bank Account' : 'Add Bank'}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Bill upload toast */}
      {billToast && (
        <div className={`fixed top-6 right-6 z-50 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${billToast.toLowerCase().includes('fail') ? 'bg-red-600' : 'bg-green-500'}`}>
          <CheckCircle className="h-5 w-5" />
          {billToast}
        </div>
      )}

      {/* In-app contract renewal alerts */}
      {contractAlerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {contractAlerts.map(alert => {
            const daysLeft = Math.ceil((new Date(alert.contract_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const timeLabel = daysLeft > 0 ? `in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'has expired';
            return (
              <div key={alert.id} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Bell className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-white text-sm">
                      {alert.provider_name} contract ends {timeLabel}
                    </p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Ends {new Date(alert.contract_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {alert.current_amount ? ` · ${formatGBP(alert.current_amount)}/mo` : ''}
                    </p>
                    {alert.potential_saving_monthly && alert.potential_saving_monthly > 0 && (
                      <p className="text-sm text-green-400 mt-1">
                        💰 We found a deal that could save you {formatGBP(alert.potential_saving_monthly)}/month
                        <Link
                          href={`/dashboard/deals${alert.category ? `?category=${alert.category}` : ''}`}
                          className="ml-2 underline text-green-300 hover:text-green-200"
                          onClick={() => handleAlertDealClick(alert.id)}
                        >
                          View deals →
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={() => handleDismissAlert(alert.id)} className="text-slate-500 hover:text-slate-300 p-1 shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state: no contract end dates set */}
      {!hasAnyContractEndDate && baseSubscriptions.filter(s => s.status === 'active').length > 0 && (
        <div className="bg-blue-500/5 rounded-2xl p-6 text-center border border-blue-500/20 mb-6">
          <CalendarClock className="h-10 w-10 text-blue-400 mx-auto mb-3 opacity-80" />
          <h3 className="font-semibold text-white text-lg">Never miss a contract end date</h3>
          <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
            Add your contract end dates and we&apos;ll alert you before they expire —
            so you can switch to a better deal instead of being stuck on expensive out-of-contract rates.
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Upload a bill and we&apos;ll extract the dates automatically, or enter them manually via the edit button.
          </p>
        </div>
      )}

      {/* Bill upload modal */}
      {billUploadSubId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setBillUploadSubId(null); setBillFile(null); }} />
          <div className="relative bg-navy-900 border border-navy-700/50 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-navy-700/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="h-5 w-5 text-mint-400" />
                Upload Bill / Contract
              </h2>
              <button onClick={() => { setBillUploadSubId(null); setBillFile(null); }} className="text-slate-400 hover:text-white p-1"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-400 text-sm">
                Upload a bill, contract, or letter and we&apos;ll extract the contract end date and key terms automatically.
              </p>
              <div>
                {billFile ? (
                  <div className="flex items-center justify-between bg-mint-400/10 border border-mint-400/20 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-mint-400" />
                      <span className="text-mint-400 text-xs font-medium truncate max-w-[200px]">{billFile.name}</span>
                    </div>
                    <button onClick={() => setBillFile(null)} className="text-slate-500 hover:text-white text-xs">Remove</button>
                  </div>
                ) : (
                  <label className="flex items-center gap-3 w-full px-4 py-6 bg-navy-950 border-2 border-dashed border-mint-400/30 rounded-lg text-slate-400 hover:border-mint-400/50 hover:text-slate-300 cursor-pointer transition-all text-sm text-center justify-center">
                    <Upload className="h-6 w-6 text-mint-400" />
                    <span>Drop your bill here or click to browse</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          if (f.size > 10 * 1024 * 1024) { alert('Maximum 10MB.'); return; }
                          setBillFile(f);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                <p className="text-[11px] text-slate-600 mt-2">PDF, JPG, or PNG. We&apos;ll extract contract end date, early exit fee, and other key terms.</p>
              </div>
              <button
                onClick={() => billUploadSubId && handleBillUpload(billUploadSubId)}
                disabled={!billFile || uploadingBill}
                className="w-full bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploadingBill ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Extracting contract details...</>
                ) : (
                  <><FileText className="h-4 w-4" /> Upload and extract</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Subscriptions</h1>
          <p className="text-slate-400">Track and cancel subscriptions costing you money</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDetectFromInbox}
            disabled={detectingFromInbox}
            className="flex items-center gap-2 bg-navy-800 hover:bg-navy-700 disabled:opacity-50 text-white font-medium px-4 py-3 rounded-lg transition-all text-sm"
          >
            {detectingFromInbox
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Inbox className="h-4 w-4" />}
            {detectingFromInbox ? 'Scanning...' : 'Detect from Inbox'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-3 rounded-lg transition-all text-sm"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Detected subscriptions from inbox */}
      {detectedSubs.length > 0 && (
        <div className="bg-mint-400/5 border border-mint-400/30 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-mint-400" />
            <h2 className="text-white font-semibold">Detected from your inbox ({detectedSubs.length})</h2>
          </div>
          <div className="space-y-3">
            {detectedSubs.map((s) => (
              <div key={s.provider_name} className="flex items-center justify-between bg-navy-900 rounded-xl px-4 py-3">
                <div>
                  <p className="text-white font-medium">{normaliseProviderName(s.provider_name)}</p>
                  <p className="text-slate-400 text-sm capitalize">
                    {s.category} · {s.amount > 0 ? formatGBP(s.amount) : '£?'}/{s.billing_cycle}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddDetected(s)}
                    className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                  >
                    Track
                  </button>
                  <button
                    onClick={() => setDetectedSubs((prev) => prev.filter((d) => d.provider_name !== s.provider_name))}
                    className="text-slate-500 hover:text-slate-300 px-2 py-2 text-sm"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Needs Review Banner */}
      {(() => {
        const reviewCount = baseSubscriptions.filter(s => s.needs_review && s.status === 'active').length;
        if (reviewCount === 0) return null;
        return (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <div>
                  <h2 className="text-white font-semibold">{reviewCount} new subscription{reviewCount > 1 ? 's' : ''} detected — review now</h2>
                  <p className="text-slate-400 text-sm">Auto-detected from your bank transactions. Confirm they&apos;re yours or dismiss.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  // Scroll to first needs_review subscription
                  const el = document.querySelector('[data-needs-review="true"]');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-medium px-4 py-2 rounded-lg text-sm transition-all whitespace-nowrap"
              >
                Review
              </button>
            </div>
          </div>
        );
      })()}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-5">
          <p className="text-slate-400 text-xs mb-1">Flexible (cancellable)</p>
          <h3 className="text-2xl font-bold text-white">{formatGBP(flexibleTotalMonthly)}<span className="text-sm text-slate-500 font-normal">/mo</span></h3>
          <p className="text-slate-500 text-xs mt-1">Savings opportunity</p>
        </div>

        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-5">
          <p className="text-slate-400 text-xs mb-1">Fixed / Statutory</p>
          <h3 className="text-xl font-bold text-slate-300">{formatGBP(statutoryTotalMonthly)}<span className="text-sm text-slate-500 font-normal">/mo</span></h3>
          <p className="text-slate-500 text-xs mt-1">Council tax, water, etc</p>
        </div>

        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-5 md:col-span-2 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs mb-1">Active Subscriptions</p>
            <h3 className="text-2xl font-bold text-white">
              {displaySubscriptions.filter((s) => s.status === 'active').length}
            </h3>
            <p className="text-slate-500 text-xs mt-1">Tracked active payments</p>
          </div>
          <div className="text-right">
             <p className="text-slate-400 text-xs mb-1">Total Annual Cost</p>
             <h3 className="text-2xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">{formatGBP(totalMonthly * 12)}</h3>
          </div>
        </div>
      </div>

      {/* Filtering and Sorting Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide w-full max-w-full">
          <button
            onClick={() => setFilterCategory('All')}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm transition-all ${filterCategory === 'All' ? 'bg-mint-400 text-navy-950 font-semibold' : 'bg-navy-800 text-slate-300 hover:bg-navy-700'}`}
          >
            All
          </button>
          {SORTED_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-full text-sm transition-all ${filterCategory === cat.value ? 'bg-mint-400 text-navy-950 font-semibold' : 'bg-navy-800 text-slate-300 hover:bg-navy-700'}`}
            >
              {(() => {
                 const Icon = getCategoryIcon(cat.value);
                 return <Icon className="w-3.5 h-3.5 opacity-70" />;
              })()}
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-navy-900 border border-navy-700/50 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-mint-400"
          >
            <option value="price_desc">Price: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="category">Category</option>
            <option value="date_added">Recently Used</option>
          </select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedForBulk.size >= 2 && (
        <div className="bg-mint-400/10 border border-mint-400/30 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-4">
          <p className="text-mint-400 font-medium ml-2">{selectedForBulk.size} items selected</p>
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              onClick={() => setSelectedForBulk(new Set())}
              className="text-slate-400 hover:text-white px-3 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkCancel}
              disabled={bulkGenerating}
              className="w-full sm:w-auto bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-5 py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {bulkGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate {selectedForBulk.size} Cancellation Emails
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Subscriptions list */}
        <div className="space-y-4">
          {activeDuplicateGroups.length > 0 && (
            <div className="bg-navy-900 border border-amber-500/30 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Possible Duplicate Subscriptions</p>
                    <p className="text-slate-400 text-xs">{activeDuplicateGroups.length} provider{activeDuplicateGroups.length !== 1 ? 's' : ''} — review before merging</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDuplicateDetails(v => !v)}
                  className="text-xs text-amber-400 hover:text-amber-300 underline whitespace-nowrap"
                >
                  {showDuplicateDetails ? 'Hide details' : 'Review duplicates'}
                </button>
              </div>

              {showDuplicateDetails && (
                <div className="space-y-3 mt-2">
                  {activeDuplicateGroups.map((group) => {
                    const sorted = [...group].sort((a, b) => rankForKeep(b) - rankForKeep(a) || b.amount - a.amount);
                    const keep = sorted[0];
                    const remove = sorted.slice(1);
                    const groupKey = `${cleanMerchantName(group[0].provider_name).toLowerCase()}|${group[0].category}`;
                    const overrideAmt = groupAmountOverrides[groupKey] ?? String(keep.amount);
                    return (
                      <div key={groupKey} className="bg-navy-950/80 border border-navy-700/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white text-sm font-semibold">{cleanMerchantName(keep.provider_name)}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDismissGroup(groupKey)}
                              className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded transition-colors"
                              title="Not a duplicate — dismiss"
                            >
                              Dismiss
                            </button>
                            <button
                              onClick={() => handleMergeDuplicates(group, groupKey)}
                              disabled={mergingDuplicates}
                              className="text-xs bg-amber-500 hover:bg-amber-600 text-navy-950 font-semibold px-3 py-1 rounded transition-colors disabled:opacity-50"
                            >
                              Merge
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            <span className="w-14 text-green-400 font-medium shrink-0">Keep:</span>
                            <span className="text-slate-200">{keep.provider_name}</span>
                            <span className="text-slate-500">at</span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-slate-400">£</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={overrideAmt}
                                onChange={e => setGroupAmountOverrides(prev => ({ ...prev, [groupKey]: e.target.value }))}
                                className="w-20 bg-navy-800 border border-navy-600 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-amber-400"
                              />
                              <span className="text-slate-500">/{keep.billing_cycle}</span>
                            </span>
                            {keep.source && <span className="text-slate-500">({keep.source})</span>}
                          </div>
                          {remove.map(r => (
                            <div key={r.id} className="flex items-center gap-2 text-xs">
                              <span className="w-14 text-red-400 font-medium shrink-0">Remove:</span>
                              <span className="text-slate-400 line-through">{r.provider_name}</span>
                              <span className="text-slate-500">— £{r.amount}/{r.billing_cycle}</span>
                              {r.source && <span className="text-slate-500">({r.source})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {activeDuplicateGroups.length > 1 && (
                    <button
                      onClick={() => handleMergeDuplicates()}
                      disabled={mergingDuplicates}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-navy-950 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {mergingDuplicates ? 'Merging...' : `Merge all ${activeDuplicateGroups.reduce((acc, g) => acc + g.length - 1, 0)} duplicates`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {hiddenFinanceCount > 0 && (
            <div className="bg-navy-900/50 border border-navy-700/30 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
              <p className="text-slate-500 text-xs">{hiddenFinanceCount} loan/mortgage/credit card payment{hiddenFinanceCount !== 1 ? 's' : ''} hidden. These are tracked in your <a href="/dashboard/money-hub" className="text-mint-400 hover:text-mint-300">Money Hub</a>.</p>
            </div>
          )}

          {displaySubscriptions.length === 0 ? (
            <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-12 text-center">
              <CreditCard className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">No subscriptions tracked yet</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-lg transition-all"
              >
                Add your first subscription
              </button>
            </div>
          ) : (
            displaySubscriptions.map((sub) => (
              <div
                key={sub.id}
                data-needs-review={sub.needs_review ? 'true' : undefined}
                className={`bg-navy-900 backdrop-blur-sm border rounded-2xl p-6 transition-all cursor-pointer ${
                  selectedSub?.id === sub.id
                    ? 'border-mint-400/50'
                    : sub.needs_review
                    ? 'border-amber-500/40 hover:border-amber-500/60'
                    : 'border-navy-700/50 hover:border-navy-700/50'
                }`}
                onClick={() => {
                  setSelectedSub(sub);
                  setCancellationEmail(null);
                  setCancelInfo(null);
                  fetch(`/api/subscriptions/cancel-info?provider=${encodeURIComponent(sub.provider_name)}`)
                    .then(r => r.json())
                    .then(d => setCancelInfo(d.info || null))
                    .catch(() => {});
                }}
              >
                <div className="flex items-start">
                  <div className="pt-1 pr-4" onClick={(e) => { e.stopPropagation(); handleToggleBulk(sub.id); }}>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${selectedForBulk.has(sub.id) ? 'bg-mint-400 border-mint-400' : 'border-slate-500 hover:border-mint-400'}`}>
                      {selectedForBulk.has(sub.id) && <svg className="w-3.5 h-3.5 text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1 relative">
                      <div className="flex items-center gap-3 mb-2">
                        {sub.logo_url ? (
                          <>
                            <Image
                              src={sub.logo_url}
                              alt={sub.provider_name}
                              width={24}
                              height={24}
                              className="rounded-md shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                            />
                            <span className="w-6 h-6 rounded-md bg-mint-400/20 text-mint-400 flex items-center justify-center text-xs font-bold shrink-0 hidden">
                              {normaliseProviderName(sub.provider_name).charAt(0).toUpperCase()}
                            </span>
                          </>
                        ) : (
                          <span className="w-6 h-6 rounded-md bg-mint-400/20 text-mint-400 flex items-center justify-center text-xs font-bold shrink-0">
                            {normaliseProviderName(sub.provider_name).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <h3 className="text-lg font-semibold text-white">{normaliseProviderName(sub.provider_name)}</h3>
                        {getStatusBadge(sub.status)}
                        {getSourceBadges(sub.source)}
                        {sub.needs_review && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            Needs review
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mb-2">
                        <div className="relative group inline-block" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setInlineRecatSub(inlineRecatSub === sub.id ? null : sub.id)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors font-medium border ${sub.category ? `${getCategoryColor(sub.category)} ${getCategoryBgColor(sub.category)} border-transparent hover:border-opacity-30` : 'text-slate-400 bg-navy-800 border-navy-700 hover:border-navy-600'}`}
                          >
                            {(() => {
                               const Icon = sub.category ? getCategoryIcon(sub.category) : MoreHorizontal;
                               return <Icon className="w-3 h-3" />;
                            })()}
                            <span>{sub.category ? getCategoryLabel(sub.category) : 'Uncategorised'}</span>
                          </button>
                          {inlineRecatSub === sub.id && (
                            <div className="absolute top-full left-0 mt-1 w-48 bg-navy-800 border border-navy-700 rounded-lg shadow-xl z-20 max-h-64 overflow-y-auto">
                              {SORTED_CATEGORIES.map(cat => (
                                <button
                                  key={cat.value}
                                  onClick={() => handleInlineRecategorise(sub, cat.value)}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-navy-700 flex items-center gap-2 ${sub.category === cat.value ? 'text-mint-400 bg-mint-400/5' : 'text-slate-300'}`}
                                >
                                  {(() => {
                                     const Icon = getCategoryIcon(cat.value);
                                     return <Icon className="w-3.5 h-3.5 opacity-70" />;
                                  })()}
                                  {cat.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <span>{formatGBP(sub.amount)}/{sub.billing_cycle === 'one-time' ? 'once' : sub.billing_cycle}</span>
                        {sub.next_billing_date && (
                          <span>Next: {new Date(sub.next_billing_date).toLocaleDateString('en-GB')}</span>
                        )}
                      <ContractBadge contractEndDate={sub.contract_end_date} />
                      {sub.contract_type && sub.contract_type !== 'subscription' && (
                        <span className="text-xs bg-navy-700/50 text-slate-400 px-1.5 py-0.5 rounded capitalize">{sub.contract_type.replace('_', ' ')}</span>
                      )}
                      {sub.auto_renews === false && (
                        <span className="text-xs bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">No auto-renew</span>
                      )}
                    </div>
                    {sub.source === 'bank' && (
                      <p className="text-xs text-slate-500 mt-1 truncate max-w-md" title={sub.bank_description || ''}>
                        <Building2 className="h-3 w-3 inline mr-1" />
                        {sub.bank_description || 'Detected from bank account'}
                      </p>
                    )}
                    {sub.source === 'manual' && (
                      <p className="text-xs text-slate-500 mt-1">
                        <Pencil className="h-3 w-3 inline mr-1" />Added manually
                      </p>
                    )}
                    {sub.source === 'email' && (
                      <p className="text-xs text-slate-500 mt-1">
                        <Mail className="h-3 w-3 inline mr-1" />Detected from email
                      </p>
                    )}
                    {sub.last_used_date && (
                      <p className="text-xs text-slate-500 mt-1">
                        Last used: {new Date(sub.last_used_date).toLocaleDateString('en-GB')}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-xl font-bold text-white">{formatGBP(sub.amount)}</p>
                      <p className="text-xs text-slate-500">{sub.billing_cycle}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBillUploadSubId(sub.id);
                        }}
                        className="text-slate-600 hover:text-purple-400 transition-all"
                        title="Upload bill to extract contract dates"
                      >
                        <Upload className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(sub);
                        }}
                        className="text-slate-600 hover:text-mint-400 transition-all"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSubscription(sub.id);
                        }}
                        className="text-slate-600 hover:text-red-400 transition-all"
                        title="Delete"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {sub.needs_review && sub.status === 'active' && (
                <div className="mt-4 pt-4 border-t border-amber-500/30 flex flex-wrap gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/subscriptions/${sub.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ needs_review: false }),
                      }).then(() => {
                        setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, needs_review: false } : s));
                      });
                    }}
                    className="flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-4 py-2 rounded-lg text-sm transition-all border border-green-500/30"
                  >
                    <CheckCircle className="h-4 w-4" />
                    This is mine
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/subscriptions/${sub.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ needs_review: false, status: 'dismissed', dismissed_at: new Date().toISOString() }),
                      }).then(() => {
                        setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, needs_review: false, status: 'dismissed' as const } : s));
                      });
                    }}
                    className="flex items-center gap-2 bg-navy-800 hover:bg-navy-700 text-slate-300 px-4 py-2 rounded-lg text-sm transition-all"
                  >
                    <X className="h-4 w-4" />
                    Not a subscription
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open('https://www.actionfraud.police.uk/', '_blank');
                      fetch(`/api/subscriptions/${sub.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ needs_review: false, notes: 'Flagged as unrecognised — check with bank' }),
                      }).then(() => {
                        setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, needs_review: false } : s));
                      });
                    }}
                    className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm transition-all border border-red-500/30"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    I don&apos;t recognise this
                  </button>
                </div>
              )}

              {sub.status === 'active' && !sub.needs_review && (
                  <div className="mt-4 pt-4 border-t border-navy-700/50 flex flex-wrap gap-2">
                    {isStatutoryService(sub.provider_name) ? (
                      <span className="flex items-center gap-2 bg-slate-500/10 text-slate-400 px-4 py-2 rounded-lg text-sm border border-slate-500/20">
                        <AlertTriangle className="h-4 w-4" />
                        Statutory charge
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelRequest(sub);
                          }}
                          className="flex items-center gap-2 bg-navy-800 hover:bg-navy-700 text-white px-4 py-2 rounded-lg transition-all text-sm"
                        >
                          <Mail className="h-4 w-4" />
                          Generate Cancellation Email
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            attemptMarkCancelled(sub);
                          }}
                          className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg transition-all text-sm border border-red-500/20"
                        >
                          <X className="h-4 w-4" />
                          Mark as Cancelled
                        </button>
                      </>
                    )}
                    {sub.provider_type && ['energy', 'broadband', 'mobile', 'insurance', 'mortgage', 'loan'].includes(sub.provider_type) && !subComparisons[sub.id] && (
                      <a
                        href={`/deals/${sub.provider_type === 'mortgage' ? 'mortgages' : sub.provider_type === 'loan' ? 'loans' : sub.provider_type}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 px-4 py-2 rounded-lg transition-all text-sm border border-green-500/20"
                      >
                        <TrendingDown className="h-4 w-4" />
                        Find Better Deal
                      </a>
                    )}
                  </div>
                )}

                {/* Smart Bill Comparison */}
                {sub.status === 'active' && subComparisons[sub.id] && subComparisons[sub.id].length > 0 && (
                  <ComparisonCard
                    subscription={sub}
                    comparisons={subComparisons[sub.id]}
                    category={sub.provider_type === 'mortgage' ? 'mortgages' : sub.provider_type === 'loan' ? 'loans' : sub.provider_type || undefined}
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* Cancellation email panel */}
        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Mail className="h-5 w-5 text-mint-400" />
            Cancellation Email
          </h2>

          {cancellationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
              {cancellationError}
            </div>
          )}

          {generating ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 text-mint-400 animate-spin mb-4" />
              <p className="text-slate-400">Writing your cancellation email...</p>
            </div>
          ) : cancellationEmail ? (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2 text-xs text-green-400">
                <CheckCircle className="h-3.5 w-3.5" />
                Saved to your complaint history
              </div>

              <div className="bg-navy-950 rounded-lg p-4 border border-navy-700/50">
                <p className="text-xs text-slate-500 mb-1">Subject</p>
                <p className="text-white font-medium">{cancellationEmail.subject}</p>
              </div>

              <div className="bg-navy-950 rounded-lg p-4 border border-navy-700/50 max-h-72 overflow-y-auto">
                <p className="text-xs text-slate-500 mb-2">Email body</p>
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">
                  {cancellationEmail.body}
                </pre>
              </div>

              {/* Edit/Feedback section */}
              {showCancelFeedback ? (
                <div className="space-y-2">
                  <textarea
                    value={cancelFeedback}
                    onChange={(e) => setCancelFeedback(e.target.value)}
                    placeholder="Tell the AI what to change (e.g. 'Make it more formal', 'Add reference to my 2 year contract ending', 'Include my account number 12345')"
                    className="w-full px-3 py-2 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 text-sm"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => selectedSub && handleCancelRequest(selectedSub, cancelFeedback, cancellationEmail.body)}
                      disabled={!cancelFeedback.trim() || regenerating}
                      className="flex-1 flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 disabled:opacity-50 text-navy-950 font-semibold py-2 rounded-lg transition-all text-sm"
                    >
                      {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {regenerating ? 'Regenerating...' : 'Regenerate'}
                    </button>
                    <button
                      onClick={() => { setShowCancelFeedback(false); setCancelFeedback(''); }}
                      className="px-4 py-2 bg-navy-800 hover:bg-navy-700 text-white rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelFeedback(true)}
                  className="w-full flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-slate-300 py-2 rounded-lg transition-all text-sm"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Request changes
                </button>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() =>
                    handleCopy(
                      `Subject: ${cancellationEmail.subject}\n\n${cancellationEmail.body}`
                    )
                  }
                  className="flex-1 flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white py-3 rounded-lg transition-all"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Email
                    </>
                  )}
                </button>
                {selectedSub?.account_email && (
                  <a
                    href={`mailto:${selectedSub.account_email}?subject=${encodeURIComponent(cancellationEmail.subject)}&body=${encodeURIComponent(cancellationEmail.body)}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-lg transition-all"
                  >
                    <Mail className="h-4 w-4" />
                    Open in Email
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cancellation method info */}
              {selectedSub && cancelInfo && (
                <div className="bg-navy-950 rounded-xl p-5 border border-navy-700/50">
                  <h4 className="text-sm font-semibold text-mint-400 mb-3">How to cancel {selectedSub.provider_name}</h4>
                  <p className="text-sm text-slate-300 mb-3">{cancelInfo.method}</p>
                  {cancelInfo.tips && (
                    <p className="text-xs text-slate-400 mb-3">{cancelInfo.tips}</p>
                  )}
                  <div className="space-y-2">
                    {cancelInfo.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-slate-500" />
                        <a href={`mailto:${cancelInfo.email}`} className="text-mint-400 hover:text-mint-300 underline">{cancelInfo.email}</a>
                      </div>
                    )}
                    {cancelInfo.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 text-xs">Tel</span>
                        <a href={`tel:${cancelInfo.phone.split('/')[0].trim().replace(/\s/g, '')}`} className="text-mint-400 hover:text-mint-300">{cancelInfo.phone}</a>
                      </div>
                    )}
                    {cancelInfo.url && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 text-xs">Web</span>
                        <a href={cancelInfo.url} target="_blank" rel="noopener noreferrer" className="text-mint-400 hover:text-mint-300 underline truncate">{cancelInfo.url.replace('https://', '')}</a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedSub && !cancelInfo && (
                <div className="bg-navy-950 rounded-xl p-5 border border-navy-700/50">
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Cancel {selectedSub.provider_name}</h4>
                  <p className="text-xs text-slate-500">Generate a cancellation letter below. Our AI will suggest the best approach based on the subscription type.</p>
                </div>
              )}

              {!selectedSub && (
                <div className="text-center py-12">
                  <Mail className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">
                    Select a subscription to see cancellation options and generate a cancellation letter
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit subscription modal */}
      {editSub && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-navy-700/50 rounded-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Edit Subscription</h2>
              <button onClick={() => setEditSub(null)} className="text-slate-400 hover:text-white transition-all">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Provider Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.provider_name}
                  onChange={(e) => setEditForm({ ...editForm, provider_name: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Amount (£) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                    placeholder="9.99"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Billing Cycle *</label>
                  <select
                    value={editForm.billing_cycle}
                    onChange={(e) => setEditForm({ ...editForm, billing_cycle: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                  >
                    {BILLING_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Next Billing Date</label>
                  <input
                    type="date"
                    value={editForm.next_billing_date}
                    onChange={(e) => setEditForm({ ...editForm, next_billing_date: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Support Email</label>
                <input
                  type="email"
                  value={editForm.account_email}
                  onChange={(e) => setEditForm({ ...editForm, account_email: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                  placeholder="support@provider.com"
                />
              </div>

              {/* Contract Details Section */}
              <details className="border border-navy-700/50 rounded-lg" open={!!editForm.contract_end_date}>
                <summary className="px-4 py-3 text-sm font-medium text-slate-300 cursor-pointer hover:text-white flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Contract Details
                  <span className="text-xs text-slate-500 font-normal">(enables end-of-contract alerts)</span>
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  {/* Contract End Date — THE KEY FIELD */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Contract End Date</label>
                    <input
                      type="date"
                      value={editForm.contract_end_date}
                      onChange={(e) => setEditForm({ ...editForm, contract_end_date: e.target.value })}
                      className="w-full px-4 py-3 bg-navy-950 border border-mint-400/30 rounded-lg text-white focus:outline-none focus:border-mint-400"
                    />
                    <p className="text-xs text-slate-500 mt-1">We&apos;ll alert you before this date so you can switch to a better deal</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract Start Date</label>
                      <input
                        type="date"
                        value={editForm.contract_start_date}
                        onChange={(e) => setEditForm({ ...editForm, contract_start_date: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract Length</label>
                      <select
                        value={editForm.contract_term_months}
                        onChange={(e) => setEditForm({ ...editForm, contract_term_months: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      >
                        <option value="">Not sure</option>
                        <option value="1">1 month (rolling)</option>
                        <option value="12">12 months</option>
                        <option value="18">18 months</option>
                        <option value="24">24 months</option>
                        <option value="36">36 months</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract Type</label>
                      <select
                        value={editForm.contract_type}
                        onChange={(e) => setEditForm({ ...editForm, contract_type: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      >
                        <option value="">Select...</option>
                        {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Provider Type</label>
                      <select
                        value={editForm.provider_type}
                        onChange={(e) => setEditForm({ ...editForm, provider_type: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      >
                        <option value="">Select...</option>
                        {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Current Tariff */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Current Plan/Tariff Name</label>
                    <input
                      type="text"
                      value={editForm.current_tariff}
                      onChange={(e) => setEditForm({ ...editForm, current_tariff: e.target.value })}
                      className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                      placeholder="e.g. Sky Superfast 80Mbps"
                    />
                  </div>

                  {/* Early Exit Fee */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Early Exit Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-3.5 text-slate-500">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.early_exit_fee}
                        onChange={(e) => setEditForm({ ...editForm, early_exit_fee: e.target.value })}
                        className="w-full pl-7 px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Auto-renews */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-slate-300">Auto-renews?</label>
                      <p className="text-xs text-slate-500">Most UK contracts auto-renew at a higher rate</p>
                    </div>
                    <input
                      type="checkbox"
                      id="auto_renews_edit"
                      checked={editForm.auto_renews}
                      onChange={(e) => setEditForm({ ...editForm, auto_renews: e.target.checked })}
                      className="w-5 h-5 rounded border-navy-700/50 bg-navy-950 text-mint-400 focus:ring-mint-400"
                    />
                  </div>

                  {/* Alert preferences */}
                  <div className="border-t border-navy-700/50 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-slate-300">Contract end alerts</label>
                        <p className="text-xs text-slate-500">Email me before this contract ends</p>
                      </div>
                      <input
                        type="checkbox"
                        id="alerts_enabled_edit"
                        checked={editForm.alerts_enabled}
                        onChange={(e) => setEditForm({ ...editForm, alerts_enabled: e.target.checked })}
                        className="w-5 h-5 rounded border-navy-700/50 bg-navy-950 text-mint-400 focus:ring-mint-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Alert me this many days before</label>
                      <select
                        value={editForm.alert_before_days}
                        onChange={(e) => setEditForm({ ...editForm, alert_before_days: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      >
                        <option value="14">14 days</option>
                        <option value="30">30 days (recommended)</option>
                        <option value="60">60 days</option>
                      </select>
                    </div>
                  </div>

                  {/* Upload bill shortcut */}
                  <button
                    type="button"
                    onClick={() => { setEditSub(null); setBillUploadSubId(editSub.id); }}
                    className="w-full flex items-center justify-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 py-2.5 rounded-lg transition-all text-sm border border-purple-500/20"
                  >
                    <Upload className="h-4 w-4" /> Upload a bill to auto-fill contract dates
                  </button>
                </div>
              </details>

              <button
                type="submit"
                disabled={savingEdit}
                className="w-full bg-mint-400 hover:bg-mint-500 disabled:opacity-50 text-navy-950 font-semibold py-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {savingEdit ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add subscription modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-navy-700/50 rounded-2xl p-8 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Add Subscription</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-white transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleAddSubscription} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Provider Name *
                </label>
                <input
                  type="text"
                  required
                  value={newSub.provider_name}
                  onChange={(e) => setNewSub({ ...newSub, provider_name: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                  placeholder="e.g. Netflix, Adobe, Spotify"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Amount (£) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newSub.amount}
                    onChange={(e) => setNewSub({ ...newSub, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                    placeholder="9.99"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Billing Cycle *
                  </label>
                  <select
                    value={newSub.billing_cycle}
                    onChange={(e) => setNewSub({ ...newSub, billing_cycle: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                  >
                    {BILLING_CYCLES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Category
                  </label>
                  <select
                    value={newSub.category}
                    onChange={(e) => setNewSub({ ...newSub, category: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    How often used?
                  </label>
                  <select
                    value={newSub.usage_frequency}
                    onChange={(e) => setNewSub({ ...newSub, usage_frequency: e.target.value })}
                    className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                  >
                    <option value="never">Never</option>
                    <option value="rarely">Rarely</option>
                    <option value="sometimes">Sometimes</option>
                    <option value="often">Often</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Next Billing Date
                </label>
                <input
                  type="date"
                  value={newSub.next_billing_date}
                  onChange={(e) => setNewSub({ ...newSub, next_billing_date: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Support Email (for mailto link)
                </label>
                <input
                  type="email"
                  value={newSub.account_email}
                  onChange={(e) => setNewSub({ ...newSub, account_email: e.target.value })}
                  className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                  placeholder="support@provider.com"
                />
              </div>

              {/* Contract Details Section */}
              <details className="border border-navy-700/50 rounded-lg">
                <summary className="px-4 py-3 text-sm font-medium text-slate-300 cursor-pointer hover:text-white flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Contract Details
                  <span className="text-xs text-slate-500 font-normal">(enables end-of-contract alerts)</span>
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  {/* Contract End Date — THE KEY FIELD */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Contract End Date</label>
                    <input
                      type="date"
                      value={newSub.contract_end_date}
                      onChange={(e) => setNewSub({ ...newSub, contract_end_date: e.target.value })}
                      className="w-full px-4 py-3 bg-navy-950 border border-mint-400/30 rounded-lg text-white focus:outline-none focus:border-mint-400"
                    />
                    <p className="text-xs text-slate-500 mt-1">We&apos;ll alert you before this date so you can switch to a better deal</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract Start Date</label>
                      <input
                        type="date"
                        value={newSub.contract_start_date}
                        onChange={(e) => setNewSub({ ...newSub, contract_start_date: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract Length</label>
                      <select
                        value={newSub.contract_term_months}
                        onChange={(e) => setNewSub({ ...newSub, contract_term_months: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      >
                        <option value="">Not sure</option>
                        <option value="1">1 month (rolling)</option>
                        <option value="12">12 months</option>
                        <option value="18">18 months</option>
                        <option value="24">24 months</option>
                        <option value="36">36 months</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contract Type</label>
                      <select
                        value={newSub.contract_type}
                        onChange={(e) => setNewSub({ ...newSub, contract_type: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      >
                        <option value="">Select...</option>
                        {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Provider Type</label>
                      <select
                        value={newSub.provider_type}
                        onChange={(e) => setNewSub({ ...newSub, provider_type: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      >
                        <option value="">Select...</option>
                        {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Current Plan/Tariff Name</label>
                    <input
                      type="text"
                      value={newSub.current_tariff}
                      onChange={(e) => setNewSub({ ...newSub, current_tariff: e.target.value })}
                      className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                      placeholder="e.g. Sky Superfast 80Mbps"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Early Exit Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-3.5 text-slate-500">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newSub.early_exit_fee}
                        onChange={(e) => setNewSub({ ...newSub, early_exit_fee: e.target.value })}
                        className="w-full pl-7 px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-slate-300">Auto-renews?</label>
                      <p className="text-xs text-slate-500">Most UK contracts auto-renew at a higher rate</p>
                    </div>
                    <input
                      type="checkbox"
                      id="auto_renews_new"
                      checked={newSub.auto_renews}
                      onChange={(e) => setNewSub({ ...newSub, auto_renews: e.target.checked })}
                      className="w-5 h-5 rounded border-navy-700/50 bg-navy-950 text-mint-400 focus:ring-mint-400"
                    />
                  </div>

                  {/* Alert preferences */}
                  <div className="border-t border-navy-700/50 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-slate-300">Contract end alerts</label>
                        <p className="text-xs text-slate-500">Email me before this contract ends</p>
                      </div>
                      <input
                        type="checkbox"
                        id="alerts_enabled_new"
                        checked={newSub.alerts_enabled}
                        onChange={(e) => setNewSub({ ...newSub, alerts_enabled: e.target.checked })}
                        className="w-5 h-5 rounded border-navy-700/50 bg-navy-950 text-mint-400 focus:ring-mint-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Alert me this many days before</label>
                      <select
                        value={newSub.alert_before_days}
                        onChange={(e) => setNewSub({ ...newSub, alert_before_days: e.target.value })}
                        className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-lg text-white focus:outline-none focus:border-mint-400"
                      >
                        <option value="14">14 days</option>
                        <option value="30">30 days (recommended)</option>
                        <option value="60">60 days</option>
                      </select>
                    </div>
                  </div>
                </div>
              </details>

              <button
                type="submit"
                disabled={addingSubscription}
                className="w-full bg-mint-400 hover:bg-mint-500 disabled:opacity-50 text-navy-950 font-semibold py-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {addingSubscription ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    Add Subscription
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
