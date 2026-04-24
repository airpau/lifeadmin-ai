'use client';


import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CreditCard, Calendar, TrendingDown, X, Mail, Copy, CheckCircle, Plus, Loader2, Inbox, Sparkles, Pencil, Building2, RefreshCw, Wifi, WifiOff, AlertTriangle, MoreHorizontal, FileText, Upload, Bell, CalendarClock, Shield, Phone, Trash2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import { capture } from '@/lib/posthog';
import { formatGBP } from '@/lib/format';
import UpgradeTrigger from '@/components/UpgradeTrigger';
import ShareWinModal from '@/components/share/ShareWinModal';
import CreditScoreWarning from '@/components/subscriptions/CreditScoreWarning';
import { shouldShowShareModal, hasSharedThisSession } from '@/lib/share-triggers';
import { isCreditProduct } from '@/lib/credit-product-detector';
import ComparisonCard from '@/components/subscriptions/ComparisonCard';
import { cleanMerchantName } from '@/lib/merchant-utils';
import { countActiveSubscriptions } from '@/lib/subscriptions/active-count';
import { SORTED_CATEGORIES, SUBSCRIPTION_FILTER_CATEGORIES, getCategoryLabel, getCategoryColor, getCategoryBgColor, getCategoryIcon } from '@/lib/category-config';
import { createClient } from '@/lib/supabase/client';
import BankPickerModal, { connectBankDirect } from '@/components/BankPickerModal';

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
  status: 'active' | 'pending_cancellation' | 'cancelled' | 'expired' | 'dismissed' | 'flagged';
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
  last_manual_sync_at: string | null;
  connected_at: string;
  account_ids: string[] | null;
  bank_name: string | null;
  account_display_names: string[] | null;
}

interface BankTierInfo {
  tier: 'free' | 'essential' | 'pro';
  maxConnections: number | null; // null = unlimited
  manualSyncAllowed: boolean;
  manualSyncDailyLimit: number;
  manualSyncCooldownHours: number;
  manualSyncsToday: number;
}

interface CancellationEmail {
  subject: string;
  body: string;
}

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
  const router = useRouter();
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [userTier, setUserTier] = useState('free');
  const [tierLoaded, setTierLoaded] = useState(false);
  const [unrecognisedSub, setUnrecognisedSub] = useState<Subscription | null>(null);
  const [fraudStep, setFraudStep] = useState<'initial' | 'fraud_guidance'>('initial');
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [cancelInfo, setCancelInfo] = useState<{
    email?: string;
    phone?: string;
    url?: string;
    method: string;
    tips?: string;
    freshness?: string | null;
    confidence?: 'high' | 'medium' | 'low';
    data_source?: 'seed' | 'ai' | 'admin' | 'perplexity';
  } | null>(null);
  const [cancellationEmail, setCancellationEmail] = useState<CancellationEmail | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [addingSubscription, setAddingSubscription] = useState(false);
  const [detectingFromInbox, setDetectingFromInbox] = useState(false);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [rpcTotals, setRpcTotals] = useState<{
    monthly_total: number; subscriptions_monthly: number; subscriptions_count: number;
    mortgages_monthly: number; mortgages_count: number;
    loans_monthly: number; loans_count: number;
    council_tax_monthly: number; council_tax_count: number;
  } | null>(null);
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
  const [connectionsCollapsed, setConnectionsCollapsed] = useState(true);
  const [bankToast, setBankToast] = useState<string | null>(null);
  const [bankTierInfo, setBankTierInfo] = useState<BankTierInfo>({
    tier: 'free',
    maxConnections: 1,
    manualSyncAllowed: false,
    manualSyncDailyLimit: 0,
    manualSyncCooldownHours: 0,
    manualSyncsToday: 0,
  });
  const [subComparisons, setSubComparisons] = useState<Record<string, any[]>>({});
  const [bankPromptDismissed, setBankPromptDismissed] = useState(false);

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
      const [subsRes, totalsRes] = await Promise.all([
        fetch('/api/subscriptions'),
        (async () => {
          const sb = createClient();
          const { data: { user } } = await sb.auth.getUser();
          if (!user) return null;
          const { data } = await sb.rpc('get_subscription_total', { p_user_id: user.id });
          return data;
        })(),
      ]);
      if (subsRes.ok) {
        const data = await subsRes.json();
        setSubscriptions(data);
      }
      if (totalsRes) {
        setRpcTotals(totalsRes);
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
        setBankTierInfo({
          tier: data.tier || 'free',
          maxConnections: data.maxConnections,
          manualSyncAllowed: data.manualSyncAllowed ?? false,
          manualSyncDailyLimit: data.manualSyncDailyLimit ?? 0,
          manualSyncCooldownHours: data.manualSyncCooldownHours ?? 0,
          manualSyncsToday: data.manualSyncsToday ?? 0,
        });
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

    // Auto-open bank picker if redirected from profile
    const connectBank = searchParams.get('connectBank');
    if (connectBank === 'true') {
      if (!connectBankDirect()) setShowBankPicker(true);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('connectBank');
      window.history.replaceState({}, '', cleanUrl.toString());
    }

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
    // Fetch tier for upgrade trigger
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('subscription_tier, bank_prompt_dismissed_at').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.subscription_tier) setUserTier(data.subscription_tier);
          setTierLoaded(true);
          if (data?.bank_prompt_dismissed_at) {
            const dismissedAt = new Date(data.bank_prompt_dismissed_at).getTime();
            const daysSince = (Date.now() - dismissedAt) / 86_400_000;
            setBankPromptDismissed(daysSince < 30);
          }
        });
    });

    const storedDismissed = localStorage.getItem('bank_prompt_dismissed_at');
    if (storedDismissed) {
      const dismissedAt = new Date(storedDismissed).getTime();
      const daysSince = (Date.now() - dismissedAt) / 86_400_000;
      setBankPromptDismissed(daysSince < 30);
    }
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
  // Deduplicate by normalised name + amount band (e.g. "LBH" and "L.B.Hounslow"
  // collapse to one, but two separate council-tax DDs at different amounts stay
  // as distinct entries).
  const baseSubscriptions = (() => {
    const filtered = subscriptions.filter(s => !isFinancePayment(s.provider_name));
    const seen = new Map<string, boolean>();
    return filtered.filter(s => {
      const normName = cleanMerchantName(s.provider_name).toLowerCase();
      const band = Math.round(Math.log(Math.max(Math.abs(parseFloat(String(s.amount)) || 0), 0.01)) / Math.log(1.1));
      const key = `${normName}|${band}`;
      if (seen.has(key)) return false;
      seen.set(key, true);
      return true;
    });
  })();
  const hiddenFinanceCount = subscriptions.filter(s => s.status === 'active' && isFinancePayment(s.provider_name)).length;

  const displaySubscriptions = (() => {
    let result = [...baseSubscriptions];

    if (filterCategory !== 'All') {
      const group = SUBSCRIPTION_FILTER_CATEGORIES.find(g => g.value === filterCategory);
      if (group) {
        if (group.matches.length === 0) {
          // 'other' catch-all: everything not covered by named groups
          const allGroupedCategories = SUBSCRIPTION_FILTER_CATEGORIES
            .filter(g => g.matches.length > 0)
            .flatMap(g => g.matches);
          result = result.filter(s => !s.category || !allGroupedCategories.includes(s.category));
        } else {
          result = result.filter(s => s.category != null && group.matches.includes(s.category));
        }
      } else {
        // Fallback: exact category match (e.g. legacy URL params)
        result = result.filter(s => s.category === filterCategory);
      }
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
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('paybacker_dismissed_merge_groups');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
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
    setDismissedGroups(prev => {
      const next = new Set([...prev, key]);
      try { localStorage.setItem('paybacker_dismissed_merge_groups', JSON.stringify([...next])); } catch {}
      return next;
    });
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

  // Total across ALL subscriptions (including hidden finance payments) for annual cost
  const allActiveMonthly = subscriptions
    .filter(s => s.status === 'active')
    .reduce((sum, s) => {
      let monthlyAmt = parseFloat(String(s.amount)) || 0;
      if (s.billing_cycle === 'yearly') monthlyAmt = monthlyAmt / 12;
      else if (s.billing_cycle === 'quarterly') monthlyAmt = monthlyAmt / 3;
      return sum + monthlyAmt;
    }, 0);
  const allActiveCount = subscriptions.filter(s => s.status === 'active').length;

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
      // Step 1: Create a dispute record for this cancellation
      let disputeId: string | null = null;
      try {
        const disputeRes = await fetch('/api/subscriptions/create-dispute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId: subscription.id }),
        });
        if (disputeRes.ok) {
          const disputeData = await disputeRes.json();
          disputeId = disputeData.dispute_id || null;
        }
      } catch (disputeErr) {
        // Non-blocking: continue with email generation even if dispute creation fails
        console.error('Failed to create dispute:', disputeErr);
      }

      // Step 2: Generate the cancellation email
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

        // Step 3: Save the generated letter to the dispute if we have a dispute_id
        if (disputeId && data.subject && data.body) {
          try {
            await fetch('/api/disputes/save-letter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                disputeId,
                title: data.subject,
                content: data.body,
              }),
            });
          } catch (saveErr) {
            console.error('Failed to save letter to dispute:', saveErr);
          }
        }

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
      // Optimistic update for instant UI feedback
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSub?.id === id) {
        setSelectedSub(null);
        setCancellationEmail(null);
      }
      // Refetch to ensure totals and all derived state are consistent
      await fetchSubscriptions();
    } catch (error) {
      console.error('Error deleting subscription:', error);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncBank = async (connectionId?: string) => {
    setSyncing(true);
    try {
      const res = await fetch('/api/bank/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        await fetchBankConnection();
        await fetchSubscriptions();
        setBankToast('Sync complete!');
        capture('bank_synced_manual');
        setTimeout(() => setBankToast(null), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setBankToast(data.error || 'Sync failed. Please try again.');
        setTimeout(() => setBankToast(null), 6000);
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

  const handleDismissBankPrompt = () => {
    setBankPromptDismissed(true);
    localStorage.setItem('bank_prompt_dismissed_at', new Date().toISOString());
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

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedForBulk);
    for (const id of ids) {
      await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
    }
    setSelectedForBulk(new Set());
    await fetchSubscriptions();
  };

  const handleBulkMarkCancelled = async () => {
    for (const id of Array.from(selectedForBulk)) {
      const sub = subscriptions.find(s => s.id === id);
      if (!sub) continue;
      const monthlyAmt = sub.billing_cycle === 'yearly'
        ? parseFloat(String(sub.amount)) / 12
        : sub.billing_cycle === 'quarterly'
          ? parseFloat(String(sub.amount)) / 3
          : parseFloat(String(sub.amount)) || 0;
      await fetch(`/api/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          money_saved: parseFloat(monthlyAmt.toFixed(2)),
        }),
      });
    }
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
      return <span className="text-xs bg-slate-50/50 text-slate-600 px-1.5 py-0.5 rounded" title="Manually added">✏️</span>;
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
        return <span className="text-xs bg-emerald-500/10 text-emerald-600 px-2 py-1 rounded font-medium">Cancelling</span>;
      case 'cancelled':
        return <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">Cancelled</span>;
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-600">
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
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-md p-6 relative">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Subscription</h3>
            <p className="text-slate-600 text-sm mb-6">Are you sure you want to delete this subscription? This action cannot be undone.</p>
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 hover:bg-white text-slate-600 rounded-lg transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm) {
                    handleDeleteSubscription(deleteConfirm);
                  }
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-slate-900 font-semibold rounded-lg transition-all text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 lg:p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2 font-[family-name:var(--font-heading)] flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-emerald-600" /> Bulk Cancellation Complete
                </h2>
                <p className="text-slate-600">We've drafted cancellation emails for {bulkResults.length} subscriptions.</p>
              </div>
              <button
                onClick={() => setBulkResults(null)}
                className="text-slate-600 hover:text-slate-900 p-2 rounded-lg transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {bulkResults.map((result, i) => (
                <div key={i} className="bg-white border border-slate-200/50 rounded-xl p-5">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{result.sub.provider_name}</h3>
                  {result.error ? (
                    <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                      Error: {result.error}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-600 mb-2 border-b border-slate-200 pb-2">
                        Subject: {result.email.subject}
                      </p>
                      <div className="bg-white/50 rounded-lg p-3 max-h-48 overflow-y-auto text-sm text-slate-600 font-mono text-xs whitespace-pre-wrap">
                        {result.email.body}
                      </div>
                      <button
                        onClick={() => handleCopy(result.email.body)}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-sm transition-all"
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
                className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-900 rounded-xl transition-all font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank toast (success or error) */}
      {bankToast && (
        <div className={`fixed top-6 right-6 z-50 text-slate-900 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${bankToast.toLowerCase().includes('fail') || bankToast.toLowerCase().includes('error') ? 'bg-red-600' : 'bg-green-500'}`}>
          <CheckCircle className="h-5 w-5" />
          {bankToast}
        </div>
      )}

      {/* Bank connections — Compressed */}
      {!bankLoading && (
        <div className="mb-6 card shadow-[--shadow-card] p-4">
          <button
            onClick={() => setConnectionsCollapsed(!connectionsCollapsed)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-blue-400" />
              <div>
                <h2 className="text-slate-900 font-semibold text-sm">Bank Connections</h2>
                <p className="text-slate-600 text-xs">
                 {bankConnections.length > 0
                   ? `${bankConnections.length} bank${bankConnections.length === 1 ? '' : 's'} connected`
                   : expiredBanks.length > 0
                   ? 'Connection expired. Reconnection needed.'
                   : 'Connect your bank to auto-detect subscriptions.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-600 font-medium">
                {connectionsCollapsed ? 'Manage' : 'Hide'}
              </span>
              {connectionsCollapsed ? <ChevronDown className="h-4 w-4 text-slate-600" /> : <ChevronUp className="h-4 w-4 text-slate-600" />}
            </div>
          </button>

          {!connectionsCollapsed && (
            <div className="mt-4 space-y-3 pt-4 border-t border-slate-200/50">
              {/* Free-tier stale data banner */}
              {bankTierInfo.tier === 'free' && bankConnections.length > 0 && (() => {
                const conn = bankConnections[0];
                if (!conn.last_synced_at) return null;
                const daysSinceSync = Math.floor((Date.now() - new Date(conn.last_synced_at).getTime()) / 86_400_000);
                if (daysSinceSync < 1) return null;
                return (
                  <div className="bg-amber-100 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-amber-300 text-xs">
                      Your data was last synced {daysSinceSync} day{daysSinceSync !== 1 ? 's' : ''} ago. Essential members get daily updates.{' '}
                      <a href="/dashboard/upgrade" className="underline hover:text-amber-200 transition-colors">Upgrade</a>
                    </p>
                  </div>
                );
              })()}

              {/* Show each connected bank */}
              {bankConnections.map((conn) => {
                // Compute Pro cooldown state for this connection
                const cooldownMs = bankTierInfo.manualSyncCooldownHours * 3_600_000;
                const cooldownRemaining = conn.last_manual_sync_at
                  ? Math.max(0, new Date(conn.last_manual_sync_at).getTime() + cooldownMs - Date.now())
                  : 0;
                const inCooldown = cooldownRemaining > 0;
                const cooldownH = Math.floor(cooldownRemaining / 3_600_000);
                const cooldownM = Math.floor((cooldownRemaining % 3_600_000) / 60_000);
                const dailyLimitReached = bankTierInfo.manualSyncsToday >= bankTierInfo.manualSyncDailyLimit && bankTierInfo.manualSyncDailyLimit > 0;

                let syncBtnLabel = 'Sync Now';
                let syncBtnDisabled = syncing;
                let syncBtnTitle = '';
                if (syncing) {
                  syncBtnLabel = 'Syncing...';
                } else if (bankTierInfo.tier === 'free') {
                  syncBtnDisabled = true;
                  syncBtnTitle = 'Upgrade to Essential or Pro for more syncs';
                } else if (bankTierInfo.tier === 'essential') {
                  syncBtnDisabled = true;
                  syncBtnLabel = 'Sync Now (Pro only)';
                  syncBtnTitle = 'Upgrade to Pro for on-demand sync';
                } else if (dailyLimitReached) {
                  syncBtnDisabled = true;
                  syncBtnLabel = 'Daily limit reached';
                  syncBtnTitle = `${bankTierInfo.manualSyncDailyLimit} manual syncs used today. Resets at midnight.`;
                } else if (inCooldown) {
                  syncBtnDisabled = true;
                  syncBtnLabel = `Available in ${cooldownH}h ${cooldownM}m`;
                  syncBtnTitle = `Cooldown: ${bankTierInfo.manualSyncCooldownHours}h between manual syncs`;
                }

                return (
                  <div key={conn.id} className="bg-white/50 backdrop-blur-sm border border-green-500/20 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-green-500/10 w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                          <Wifi className="h-4 w-4 text-green-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-slate-900 font-medium text-sm">
                              {conn.bank_name || 'Bank connected'}
                            </span>
                            <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded uppercase tracking-wider">Active</span>
                          </div>
                          <p className="text-slate-500 text-xs">
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
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSyncBank(conn.id)}
                          disabled={syncBtnDisabled}
                          title={syncBtnTitle}
                          className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-900 font-medium px-3 py-1.5 rounded-lg transition-all text-xs border border-slate-200/50"
                        >
                          <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                          {syncBtnLabel}
                        </button>
                        <button
                          onClick={() => handleDisconnectBank(conn.id)}
                          disabled={disconnecting}
                          className="flex items-center gap-1.5 text-slate-500 hover:text-red-400 px-2 py-1.5 transition-all text-xs"
                        >
                          <WifiOff className="h-3 w-3" />
                          Unlink
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Expired bank connections */}
              {expiredBanks.length > 0 && bankConnections.length === 0 && (
                expiredBanks.map((conn) => (
                  <div key={conn.id} className="bg-white/50 backdrop-blur-sm border border-amber-200 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-amber-100 w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                          <WifiOff className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-slate-900 font-medium text-sm">{conn.bank_name || 'Bank'}</span>
                            <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Expired</span>
                          </div>
                          <p className="text-slate-500 text-xs">
                            Connection expired. Reconnect to resume sync.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => { if (!connectBankDirect()) setShowBankPicker(true); }}
                        className="flex items-center gap-1.5 bg-amber-500 hover:bg-orange-600 text-slate-900 font-semibold px-3 py-1.5 rounded-lg transition-all text-xs"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Reconnect
                      </button>
                    </div>
                  </div>
                ))
              )}

              {/* Add another bank */}
              {(() => {
                const atLimit = bankTierInfo.maxConnections !== null && bankConnections.length >= bankTierInfo.maxConnections;
                const isFirst = bankConnections.length === 0 && expiredBanks.length === 0;

                if (atLimit) {
                  return (
                    <div className="bg-white/50 backdrop-blur-sm border border-slate-200/50 rounded-xl p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex text-sm text-slate-600 items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {bankTierInfo.tier === 'free' ? 'Upgrade to connect more accounts.' : 'Upgrade to Pro for unlimited bank connections.'}
                        </div>
                        <a href="/dashboard/upgrade" className="text-xs bg-amber-500 hover:bg-orange-600 text-slate-900 font-semibold px-3 py-1.5 rounded-lg transition-all">
                          Upgrade
                        </a>
                      </div>
                    </div>
                  );
                }

                if (isFirst && bankPromptDismissed) return null;

                return (
                  <div className="bg-white/50 backdrop-blur-sm border border-blue-500/20 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-500/10 w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                          <Building2 className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-slate-900 font-medium text-sm">
                            {isFirst ? 'Connect your bank' : 'Add another bank account'}
                          </p>
                          {isFirst && (
                            <p className="text-slate-500 text-xs">
                              Auto-detect subscriptions. Secure & read-only.
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => { if (!connectBankDirect()) setShowBankPicker(true); }}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-slate-900 font-semibold px-3 py-1.5 rounded-lg transition-all text-xs"
                      >
                        <Building2 className="h-3 w-3" />
                        {isFirst ? 'Connect Bank' : 'Add Bank'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Upgrade trigger: bank scan found subscriptions — only once tier is confirmed free */}
      {tierLoaded && userTier === 'free' && bankConnections.length > 0 && baseSubscriptions.filter(s => s.status === 'active').length > 0 && (
        <UpgradeTrigger
          type="bank_scan"
          subscriptionCount={rpcTotals?.subscriptions_count ?? baseSubscriptions.filter(s => s.status === 'active').length}
          monthlyCost={rpcTotals?.subscriptions_monthly ?? (flexibleTotalMonthly + statutoryTotalMonthly)}
          userTier={userTier ?? undefined}
          className="mb-6"
        />
      )}

      {/* Bill upload toast */}
      {billToast && (
        <div className={`fixed top-6 right-6 z-50 text-slate-900 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${billToast.toLowerCase().includes('fail') ? 'bg-red-600' : 'bg-green-500'}`}>
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
              <div key={alert.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Bell className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-slate-900 text-sm">
                      {alert.provider_name} contract ends {timeLabel}
                    </p>
                    <p className="text-slate-600 text-xs mt-0.5">
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
                <button onClick={() => handleDismissAlert(alert.id)} aria-label="Dismiss alert" className="text-slate-500 hover:text-slate-700 inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors">
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
          <h3 className="font-semibold text-slate-900 text-lg">Never miss a contract end date</h3>
          <p className="text-slate-600 text-sm mt-1 max-w-md mx-auto">
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
          <div className="relative card w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200/50">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-600" />
                Upload Bill / Contract
              </h2>
              <button onClick={() => { setBillUploadSubId(null); setBillFile(null); }} aria-label="Close" className="text-slate-600 hover:text-slate-900 inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-600 text-sm">
                Upload a bill, contract, or letter and we&apos;ll extract the contract end date and key terms automatically.
              </p>
              <div>
                {billFile ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-emerald-600" />
                      <span className="text-emerald-600 text-xs font-medium truncate max-w-[200px]">{billFile.name}</span>
                    </div>
                    <button onClick={() => setBillFile(null)} className="text-slate-500 hover:text-slate-900 text-xs">Remove</button>
                  </div>
                ) : (
                  <label className="flex items-center gap-3 w-full px-4 py-6 bg-white border-2 border-dashed border-emerald-500/30 rounded-lg text-slate-600 hover:border-emerald-500/50 hover:text-slate-700 cursor-pointer transition-all text-sm text-center justify-center">
                    <Upload className="h-6 w-6 text-emerald-600" />
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
                className="w-full cta font-semibold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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

      {/* Variant A header + KPI strip — maps design's top fold to real data.
          Monthly / Yearly totals come from get_subscription_total RPC;
          Flagged = count of detected + review-needed subs;
          Potential savings reads from the inline comparison CTA state below. */}
      {(() => {
        // Single source of truth: get_subscription_total RPC. Using the
        // RPC's count + monthly on both the KPI header and the
        // UpgradeTrigger banner below means users no longer see two
        // different numbers for the same thing ("we found 34 @ £3,431"
        // vs "43 active · £1,208" — same user, same page).
        const monthly = rpcTotals?.subscriptions_monthly ?? 0;
        const yearly = monthly * 12;
        const flaggedCount = (detectedSubs?.length || 0) + subscriptions.filter(s => (s as any).needs_review).length;
        const activeCount = rpcTotals?.subscriptions_count ?? baseSubscriptions.filter(s => s.status === 'active').length;
        return (
          <>
            <div className="page-title-row">
              <div>
                <h1 className="page-title">Subscriptions</h1>
                <p className="page-sub">
                  {activeCount} active · {formatGBP(monthly)}/month
                  {flaggedCount > 0 ? ` · ${flaggedCount} flagged for action` : ''}. Every price change, renewal and unused spend in one place.
                </p>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button
                  onClick={handleDetectFromInbox}
                  disabled={detectingFromInbox}
                  className="cta-ghost"
                  style={{fontSize:12.5}}
                >
                  {detectingFromInbox
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</>
                    : <><Inbox className="h-3.5 w-3.5" /> Inbox scan</>}
                </button>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="cta"
                  style={{fontSize:12.5}}
                >
                  <Plus className="h-3.5 w-3.5" /> Add manually
                </button>
              </div>
            </div>
            <div className="kpi-row c4" style={{marginBottom:16}}>
              <div className="kpi-card">
                <div className="k-label">Monthly total</div>
                <div className="k-val">{formatGBP(monthly)}</div>
                <div className="k-delta">{activeCount} active sub{activeCount===1?'':'s'}</div>
              </div>
              <div className="kpi-card">
                <div className="k-label">Yearly total</div>
                <div className="k-val">{formatGBP(yearly)}</div>
                <div className="k-delta">Projected · incl. annual subs</div>
              </div>
              <div className="kpi-card">
                <div className="k-label">Flagged</div>
                <div className={`k-val ${flaggedCount > 0 ? 'amber' : ''}`}>{flaggedCount}</div>
                <div className="k-delta">Detected &middot; needs review</div>
              </div>
              <div className="kpi-card">
                <div className="k-label">Review savings</div>
                <div className="k-val green">Review list</div>
                <div className="k-delta">Scroll to flagged section</div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Secondary action row — preserved "detect from inbox" CTA for discoverability,
          plus legacy Add button. Kept from the pre-redesign page so nothing is lost. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end mb-8 gap-3">
        <div className="flex gap-3">
          <button
            onClick={handleDetectFromInbox}
            disabled={detectingFromInbox}
            style={{display:'none'}}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-900 font-medium px-4 py-3 rounded-lg transition-all text-sm"
          >
            {detectingFromInbox
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Inbox className="h-4 w-4" />}
            {detectingFromInbox ? 'Scanning...' : 'Inbox Scan'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 cta font-semibold px-4 py-3 rounded-lg transition-all text-sm"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* AI Assistant nudge */}
      {subscriptions.length > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
          <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-slate-600 text-sm flex-1">
            Think a subscription is missing or miscategorised? Ask the AI assistant to find and add it.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('paybacker:open_chat'))}
            className="text-emerald-600 hover:text-emerald-500 text-xs font-medium whitespace-nowrap transition-colors"
          >
            Ask the AI
          </button>
        </div>
      )}

      {/* Detected subscriptions from inbox */}
      {detectedSubs.length > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            <h2 className="text-slate-900 font-semibold">Detected from Inbox Scan ({detectedSubs.length})</h2>
          </div>
          <div className="space-y-3">
            {detectedSubs.map((s) => (
              <div key={s.provider_name} className="flex items-center justify-between bg-white rounded-xl px-4 py-3">
                <div>
                  <p className="text-slate-900 font-medium">{normaliseProviderName(s.provider_name)}</p>
                  <p className="text-slate-600 text-sm capitalize">
                    {s.category} · {s.amount > 0 ? formatGBP(s.amount) : '£?'}/{s.billing_cycle}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddDetected(s)}
                    className="cta font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                  >
                    Track
                  </button>
                  <button
                    onClick={() => setDetectedSubs((prev) => prev.filter((d) => d.provider_name !== s.provider_name))}
                    className="text-slate-500 hover:text-slate-700 px-2 py-2 text-sm"
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
          <div className="bg-amber-100 border border-amber-300 rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <h2 className="text-slate-900 font-semibold">{reviewCount} subscription{reviewCount > 1 ? 's' : ''} need{reviewCount === 1 ? 's' : ''} your review</h2>
                  <p className="text-slate-600 text-sm">Auto-detected from your bank transactions. Confirm they&apos;re yours or dismiss.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const el = document.querySelector('[data-needs-review="true"]');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="bg-amber-200 hover:bg-orange-600/30 text-amber-600 font-medium px-4 py-2 rounded-lg text-sm transition-all whitespace-nowrap"
                >
                  Review Now
                </button>
                <button
                  onClick={async () => {
                    try {
                      const supabase = createClient();
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;
                      await supabase.rpc('confirm_all_subscriptions', { p_user_id: user.id });
                      await fetchSubscriptions();
                    } catch (err) {
                      console.error('Failed to confirm all:', err);
                    }
                  }}
                  className="bg-green-500/20 hover:bg-green-500/30 text-green-400 font-medium px-4 py-2 rounded-lg text-sm transition-all whitespace-nowrap border border-green-500/30"
                >
                  Confirm All as Mine
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Summary — monthly totals from get_subscription_total() RPC;
          active-count computed locally via countActiveSubscriptions so
          every page agrees on "how many subs are active". */}
      {rpcTotals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white backdrop-blur-sm border border-slate-200/50 rounded-2xl shadow-[--shadow-card] p-5">
            <p className="text-slate-600 text-xs mb-1">Subscriptions & Bills</p>
            <h3 className="text-2xl font-bold text-slate-900">{formatGBP(rpcTotals.subscriptions_monthly)}<span className="text-sm text-slate-500 font-normal">/mo</span></h3>
            <p className="text-slate-500 text-xs mt-1">{countActiveSubscriptions(subscriptions)} active</p>
          </div>

          <div className="bg-white backdrop-blur-sm border border-slate-200/50 rounded-2xl shadow-[--shadow-card] p-5">
            <p className="text-slate-600 text-xs mb-1">Mortgages & Loans</p>
            <h3 className="text-xl font-bold text-slate-600">{formatGBP(rpcTotals.mortgages_monthly + rpcTotals.loans_monthly)}<span className="text-sm text-slate-500 font-normal">/mo</span></h3>
            <p className="text-slate-500 text-xs mt-1">{rpcTotals.mortgages_count + rpcTotals.loans_count} active</p>
          </div>

          <div className="bg-white backdrop-blur-sm border border-slate-200/50 rounded-2xl shadow-[--shadow-card] p-5">
            <p className="text-slate-600 text-xs mb-1">Council Tax</p>
            <h3 className="text-xl font-bold text-slate-600">{formatGBP(rpcTotals.council_tax_monthly)}<span className="text-sm text-slate-500 font-normal">/mo</span></h3>
            <p className="text-slate-500 text-xs mt-1">{rpcTotals.council_tax_count} active</p>
          </div>

          <div className="bg-white backdrop-blur-sm border border-slate-200/50 rounded-2xl shadow-[--shadow-card] p-5">
            <p className="text-slate-600 text-xs mb-1">Total All Commitments</p>
            <h3 className="text-2xl font-bold text-slate-900">{formatGBP(rpcTotals.monthly_total)}<span className="text-sm text-slate-500 font-normal">/mo</span></h3>
            <p className="text-slate-500 text-xs mt-1">{formatGBP(rpcTotals.monthly_total * 12)}/year · {countActiveSubscriptions(subscriptions) + rpcTotals.mortgages_count + rpcTotals.loans_count + rpcTotals.council_tax_count} tracked</p>
          </div>
        </div>
      )}

      {/* Filtering and Sorting Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide w-full max-w-full">
          <button
            onClick={() => setFilterCategory('All')}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm transition-all ${filterCategory === 'All' ? 'bg-emerald-500 text-slate-900 font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            All
          </button>
          {SUBSCRIPTION_FILTER_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-full text-sm transition-all ${filterCategory === cat.value ? 'bg-emerald-500 text-slate-900 font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {(() => {
                const Icon = cat.icon;
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
            className="bg-white border border-slate-200/50 text-slate-600 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
          >
            <option value="price_desc">Price: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="category">Category</option>
            <option value="date_added">Recently Used</option>
          </select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedForBulk.size >= 1 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-4">
          <p className="text-emerald-600 font-medium ml-2">{selectedForBulk.size} selected</p>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => setSelectedForBulk(new Set())}
              className="text-slate-600 hover:text-slate-900 px-3 py-2 text-sm transition-colors"
            >
              Deselect
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg text-sm transition-all font-medium"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
            <button
              onClick={handleBulkMarkCancelled}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-lg text-sm transition-all font-medium"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Mark Cancelled
            </button>
            <button
              onClick={() => {
                const ids = Array.from(selectedForBulk);
                const sub = subscriptions.find(s => s.id === ids[0]);
                if (sub) {
                  router.push(`/dashboard/complaints?new=1&company=${encodeURIComponent(sub.provider_name)}&type=complaint&issue=${encodeURIComponent(`Unrecognised or disputed charges from ${ids.length > 1 ? `${ids.length} subscriptions` : sub.provider_name}`)}&outcome=${encodeURIComponent('Refund of disputed charges')}`);
                }
              }}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-lg text-sm transition-all font-medium"
            >
              <Shield className="h-3.5 w-3.5" />
              Dispute
            </button>
            <button
              onClick={handleBulkCancel}
              disabled={bulkGenerating}
              className="flex items-center gap-1.5 cta font-semibold px-4 py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
            >
              {bulkGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Cancel Emails
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Subscriptions list */}
        <div className="space-y-4 min-w-0 overflow-hidden">
          {activeDuplicateGroups.length > 0 && (
            <div className="bg-white border border-amber-300 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-slate-900 font-medium text-sm">Possible Duplicate Subscriptions</p>
                    <p className="text-slate-600 text-xs">{activeDuplicateGroups.length} provider{activeDuplicateGroups.length !== 1 ? 's' : ''} — review before merging</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDuplicateDetails(v => !v)}
                  className="text-xs text-amber-600 hover:text-amber-300 underline whitespace-nowrap"
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
                      <div key={groupKey} className="bg-white/80 border border-slate-200/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-slate-900 text-sm font-semibold">{cleanMerchantName(keep.provider_name)}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDismissGroup(groupKey)}
                              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded transition-colors"
                              title="Not a duplicate — dismiss"
                            >
                              Dismiss
                            </button>
                            <button
                              onClick={() => handleMergeDuplicates(group, groupKey)}
                              disabled={mergingDuplicates}
                              className="text-xs bg-orange-500 hover:bg-orange-700 text-slate-900 font-semibold px-3 py-1 rounded transition-colors disabled:opacity-50"
                            >
                              Merge
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            <span className="w-14 text-green-400 font-medium shrink-0">Keep:</span>
                            <span className="text-slate-700">{keep.provider_name}</span>
                            <span className="text-slate-500">at</span>
                            <span className="inline-flex items-center gap-1">
                              <span className="text-slate-600">£</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={overrideAmt}
                                onChange={e => setGroupAmountOverrides(prev => ({ ...prev, [groupKey]: e.target.value }))}
                                className="w-20 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-900 text-xs focus:outline-none focus:border-amber-300"
                              />
                              <span className="text-slate-500">/{keep.billing_cycle}</span>
                            </span>
                            {keep.source && <span className="text-slate-500">({keep.source})</span>}
                          </div>
                          {remove.map(r => (
                            <div key={r.id} className="flex items-center gap-2 text-xs">
                              <span className="w-14 text-red-400 font-medium shrink-0">Remove:</span>
                              <span className="text-slate-600 line-through">{r.provider_name}</span>
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
                      className="w-full bg-orange-500 hover:bg-orange-700 text-slate-900 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {mergingDuplicates ? 'Merging...' : `Merge all ${activeDuplicateGroups.reduce((acc, g) => acc + g.length - 1, 0)} duplicates`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {hiddenFinanceCount > 0 && (
            <div className="bg-white/50 border border-slate-200/30 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
              <p className="text-slate-500 text-xs">{hiddenFinanceCount} loan/mortgage/credit card payment{hiddenFinanceCount !== 1 ? 's' : ''} hidden. These are tracked in your <a href="/dashboard/money-hub" className="text-emerald-600 hover:text-emerald-500">Money Hub</a>.</p>
            </div>
          )}

          {displaySubscriptions.length === 0 ? (
            <div className="bg-white backdrop-blur-sm border border-slate-200/50 rounded-2xl shadow-[--shadow-card] p-12 text-center">
              <CreditCard className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">No subscriptions tracked yet</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="cta font-semibold px-6 py-3 rounded-lg transition-all"
              >
                Add your first subscription
              </button>
            </div>
          ) : (
            displaySubscriptions.map((sub) => (
              <div
                key={sub.id}
                data-needs-review={sub.needs_review ? 'true' : undefined}
                className={`bg-white backdrop-blur-sm border rounded-2xl p-6 transition-all cursor-pointer active:bg-slate-50 ${
                  selectedSub?.id === sub.id
                    ? 'border-emerald-500/50'
                    : sub.needs_review
                    ? 'border-amber-500/40 hover:border-amber-500/60 active:border-amber-500/70'
                    : 'border-slate-200/50 hover:border-slate-200/50 active:border-emerald-500/40'
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
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${selectedForBulk.has(sub.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500 hover:border-emerald-500'}`}>
                      {selectedForBulk.has(sub.id) && <svg className="w-3.5 h-3.5 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col md:flex-row md:items-start justify-between gap-4 overflow-hidden">
                    <div className="flex-1 min-w-0 relative">
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
                            <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0 hidden">
                              {normaliseProviderName(sub.provider_name).charAt(0).toUpperCase()}
                            </span>
                          </>
                        ) : (
                          <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">
                            {normaliseProviderName(sub.provider_name).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <h3 className="text-lg font-semibold text-slate-900">{normaliseProviderName(sub.provider_name)}</h3>
                        {getStatusBadge(sub.status)}
                        {getSourceBadges(sub.source)}
                        {sub.needs_review && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-200 text-amber-600 border border-amber-300">
                            Needs review
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 mb-2">
                        <div className="relative group inline-block" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setInlineRecatSub(inlineRecatSub === sub.id ? null : sub.id)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors font-medium border ${sub.category ? `${getCategoryColor(sub.category)} ${getCategoryBgColor(sub.category)} border-transparent hover:border-opacity-30` : 'text-slate-600 bg-white border-slate-200 hover:border-slate-200'}`}
                          >
                            {(() => {
                               const Icon = sub.category ? getCategoryIcon(sub.category) : MoreHorizontal;
                               return <Icon className="w-3 h-3" />;
                            })()}
                            <span>{sub.category ? getCategoryLabel(sub.category) : 'Uncategorised'}</span>
                          </button>
                          {inlineRecatSub === sub.id && (
                            <div className="absolute top-full left-0 mt-1 w-48 max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200 rounded-lg shadow-xl z-20 max-h-64 overflow-y-auto">
                              {SORTED_CATEGORIES.map(cat => (
                                <button
                                  key={cat.value}
                                  onClick={() => handleInlineRecategorise(sub, cat.value)}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${sub.category === cat.value ? 'text-emerald-600 bg-emerald-500/5' : 'text-slate-600'}`}
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
                        <span className="text-xs bg-slate-50/50 text-slate-600 px-1.5 py-0.5 rounded capitalize">{sub.contract_type.replace('_', ' ')}</span>
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

                  <div className="flex flex-col items-end gap-2 shrink-0 z-10 relative ml-4">
                    <div className="text-right whitespace-nowrap">
                      <p className="text-xl font-bold text-slate-900">{formatGBP(sub.amount)}</p>
                      <p className="text-xs text-slate-500">{sub.billing_cycle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBillUploadSubId(sub.id);
                        }}
                        className="text-slate-600 hover:text-purple-400 inline-flex items-center justify-center h-10 w-10 rounded-lg active:bg-slate-100 transition-all"
                        title="Upload bill to extract contract dates"
                        aria-label="Upload bill"
                      >
                        <Upload className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(sub);
                        }}
                        className="text-slate-600 hover:text-emerald-600 inline-flex items-center justify-center h-10 w-10 rounded-lg active:bg-slate-100 transition-all"
                        title="Edit"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(sub.id);
                        }}
                        className="text-slate-600 hover:text-red-400 inline-flex items-center justify-center h-10 w-10 rounded-lg active:bg-slate-100 transition-all"
                        title="Delete"
                        aria-label="Delete"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {sub.needs_review && sub.status === 'active' && (
                <div className="mt-4 pt-4 border-t border-amber-300 flex flex-wrap gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/subscriptions/${sub.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ needs_review: false }),
                      }).then(() => fetchSubscriptions());
                    }}
                    className="flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-4 py-2 rounded-lg text-sm transition-all border border-green-500/30"
                  >
                    <CheckCircle className="h-4 w-4" />
                    This Is Mine
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/subscriptions/${sub.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'flagged', needs_review: false, notes: 'User does not recognise this transaction' }),
                      }).then(() => fetchSubscriptions());
                    }}
                    className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm transition-all border border-red-500/30"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    I Don&apos;t Recognise This
                  </button>
                </div>
              )}

              {!sub.needs_review && sub.status === 'active' && (
                  <div className="mt-4 pt-4 border-t border-slate-200/50 flex flex-wrap gap-2">
                    {isStatutoryService(sub.provider_name) ? (
                      <span className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg text-sm border border-slate-200">
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
                          className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 px-4 py-2 rounded-lg transition-all text-sm"
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
                    {/* "I don't recognise this" only for confirmed bank-sourced subs that haven't been reviewed */}

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
        <div className="bg-white backdrop-blur-sm border border-slate-200/50 rounded-2xl shadow-[--shadow-card] p-6 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <h2 style={{fontSize:18,fontWeight:700,letterSpacing:"-.01em",margin:"0 0 10px"}}>
            <Mail className="h-5 w-5 text-emerald-600" />
            Cancellation Email
          </h2>

          {cancellationError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
              {cancellationError}
            </div>
          )}

          {generating ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
              <p className="text-slate-600">Writing your cancellation email...</p>
            </div>
          ) : cancellationEmail ? (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2 text-xs text-green-400">
                <CheckCircle className="h-3.5 w-3.5" />
                Saved to your complaint history
              </div>

              <div className="bg-white rounded-lg p-4 border border-slate-200/50">
                <p className="text-xs text-slate-500 mb-1">Subject</p>
                <p className="text-slate-900 font-medium">{cancellationEmail.subject}</p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-slate-200/50 max-h-72 overflow-y-auto">
                <p className="text-xs text-slate-500 mb-2">Email body</p>
                <pre className="text-sm text-slate-600 whitespace-pre-wrap font-sans">
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
                    className="w-full px-3 py-2 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => selectedSub && handleCancelRequest(selectedSub, cancelFeedback, cancellationEmail.body)}
                      disabled={!cancelFeedback.trim() || regenerating}
                      className="flex-1 flex items-center justify-center gap-2 cta font-semibold py-2 rounded-lg transition-all text-sm"
                    >
                      {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {regenerating ? 'Regenerating...' : 'Regenerate'}
                    </button>
                    <button
                      onClick={() => { setShowCancelFeedback(false); setCancelFeedback(''); }}
                      className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelFeedback(true)}
                  className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-600 py-2 rounded-lg transition-all text-sm"
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
                  className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-900 py-3 rounded-lg transition-all"
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
                {/* Prefer the provider's cancellation address (from the
                    cancel-info DB) over the user's own account_email
                    so the mailto opens pre-addressed to the right
                    recipient. Falls back to account_email for rows
                    where we don't have a provider address yet. */}
                {(cancelInfo?.email || selectedSub?.account_email) && (
                  <a
                    href={`mailto:${cancelInfo?.email || selectedSub?.account_email}?subject=${encodeURIComponent(cancellationEmail.subject)}&body=${encodeURIComponent(cancellationEmail.body)}`}
                    className="flex-1 flex items-center justify-center gap-2 cta font-semibold py-3 rounded-lg transition-all"
                  >
                    <Mail className="h-4 w-4" />
                    Open in Email
                  </a>
                )}
              </div>

              {/* "I've sent it" confirmation — closes the loop without
                  needing Gmail/Outlook send scopes. Flips the
                  subscription to pending_cancellation so the Watchdog
                  cron (already polling the user's inbox for dispute
                  replies) picks up the provider's response and
                  progresses the dispute automatically. */}
              {selectedSub && selectedSub.status !== 'pending_cancellation' && selectedSub.status !== 'cancelled' && (
                <button
                  onClick={async () => {
                    if (!selectedSub) return;
                    try {
                      // Single endpoint call does three things atomically:
                      // flip subscription status, find the open dispute,
                      // and register a domain-scoped watchdog link so the
                      // sync-runner picks up the provider's reply from
                      // the user's inbox without needing the mailto
                      // thread_id (which we never see).
                      const res = await fetch(`/api/subscriptions/${selectedSub.id}/cancellation-sent`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ providerEmail: cancelInfo?.email ?? null }),
                      });
                      if (res.ok) {
                        const data = await res.json().catch(() => ({}));
                        capture('cancellation_marked_sent', {
                          provider: selectedSub.provider_name,
                          watchdog_link_created: !!data.watchdog_link_created,
                          sender_domain: data.sender_domain ?? null,
                        });
                        setSelectedSub({ ...selectedSub, status: 'pending_cancellation' });
                        await fetchSubscriptions();
                        setBankToast(
                          data.watchdog_link_created
                            ? "Marked as sent. We'll track the reply in Disputes."
                            : "Marked as sent. Check Disputes for the reply.",
                        );
                        setTimeout(() => setBankToast(null), 5000);
                      } else {
                        setBankToast('Failed to update — try again');
                        setTimeout(() => setBankToast(null), 5000);
                      }
                    } catch {
                      setBankToast('Failed to update — try again');
                      setTimeout(() => setBankToast(null), 5000);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 py-3 rounded-lg transition-all font-medium"
                >
                  <CheckCircle className="h-4 w-4" />
                  I&apos;ve sent it — track the reply
                </button>
              )}
              {selectedSub?.status === 'pending_cancellation' && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle className="h-4 w-4" />
                  Sent — Watchdog is monitoring your inbox for {selectedSub.provider_name}&apos;s reply
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {selectedSub ? (
                <>
                  {/* Subscription summary */}
                  <div className="bg-white rounded-xl p-5 border border-slate-200/50">
                    <div className="flex items-center gap-3 mb-3">
                      {selectedSub.logo_url ? (
                        <Image
                          src={selectedSub.logo_url}
                          alt={selectedSub.provider_name}
                          width={32}
                          height={32}
                          className="rounded-md shrink-0"
                        />
                      ) : (
                        <span className="w-8 h-8 rounded-md bg-emerald-500/20 text-emerald-600 flex items-center justify-center text-sm font-bold shrink-0">
                          {normaliseProviderName(selectedSub.provider_name).charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <h4 className="text-base font-semibold text-slate-900">{normaliseProviderName(selectedSub.provider_name)}</h4>
                        <p className="text-sm text-slate-600">
                          {selectedSub.billing_cycle === 'one-time'
                            ? `${formatGBP(selectedSub.amount)} one-off`
                            : `${formatGBP(selectedSub.amount)}/${selectedSub.billing_cycle === 'yearly' ? 'year' : selectedSub.billing_cycle === 'quarterly' ? 'quarter' : 'month'}`}
                          {selectedSub.category && ` · ${getCategoryLabel(selectedSub.category)}`}
                        </p>
                      </div>
                    </div>
                    {(selectedSub.contract_type || selectedSub.contract_end_date || (selectedSub.early_exit_fee != null && selectedSub.early_exit_fee > 0)) && (
                      <div className="space-y-1.5 text-xs border-t border-slate-200/50 pt-3 mt-1">
                        {selectedSub.contract_type && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Contract type</span>
                            <span className="text-slate-600 capitalize">{selectedSub.contract_type.replace(/_/g, ' ')}</span>
                          </div>
                        )}
                        {selectedSub.contract_end_date && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Contract ends</span>
                            <span className="text-slate-600">{new Date(selectedSub.contract_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                        )}
                        {selectedSub.early_exit_fee != null && selectedSub.early_exit_fee > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Early exit fee</span>
                            <span className="text-amber-600">{formatGBP(selectedSub.early_exit_fee)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cancellation method info (when available) */}
                  {cancelInfo && (
                    <div className="bg-white rounded-xl p-5 border border-slate-200/50">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-emerald-600">How to cancel</h4>
                        {cancelInfo.freshness && (
                          <span className="text-[11px] text-slate-500">{cancelInfo.freshness}</span>
                        )}
                        {!cancelInfo.freshness && cancelInfo.data_source === 'ai' && (
                          <span className="text-[11px] text-amber-600" title="Automatically suggested — verify before acting on it">AI suggested</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-3">{cancelInfo.method}</p>
                      {cancelInfo.tips && (
                        <p className="text-xs text-slate-600 mb-3">{cancelInfo.tips}</p>
                      )}
                      <div className="space-y-2">
                        {cancelInfo.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-3.5 w-3.5 text-slate-500" />
                            <a href={`mailto:${cancelInfo.email}`} className="text-emerald-600 hover:text-emerald-500 underline">{cancelInfo.email}</a>
                          </div>
                        )}
                        {cancelInfo.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-slate-500 text-xs">Tel</span>
                            <a href={`tel:${cancelInfo.phone.split('/')[0].trim().replace(/\s/g, '')}`} className="text-emerald-600 hover:text-emerald-500">{cancelInfo.phone}</a>
                          </div>
                        )}
                        {cancelInfo.url && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-slate-500 text-xs">Web</span>
                            <a href={cancelInfo.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-500 underline truncate">{cancelInfo.url.replace('https://', '')}</a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Generate button — same eligibility guards as the card-level button */}
                  {selectedSub.needs_review ? (
                    <div className="flex items-center gap-2 bg-amber-100 border border-amber-300 text-amber-600 px-4 py-3 rounded-xl text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Review this subscription before generating a cancellation letter
                    </div>
                  ) : selectedSub.status !== 'active' ? (
                    <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-600 px-4 py-3 rounded-xl text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Cancellation emails are only available for active subscriptions
                    </div>
                  ) : isStatutoryService(selectedSub.provider_name) ? (
                    <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-600 px-4 py-3 rounded-xl text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      This is a statutory charge and cannot be cancelled via letter
                    </div>
                  ) : (
                    <button
                      onClick={() => handleCancelRequest(selectedSub)}
                      className="w-full flex items-center justify-center gap-2 cta font-semibold py-3 rounded-xl transition-all"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate Cancellation Email
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <Mail className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-600">
                    Select a subscription to see cancellation options and generate a cancellation letter
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* "I don't recognise this" modal */}
      {unrecognisedSub && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            {fraudStep === 'initial' ? (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <h2 style={{fontSize:18,fontWeight:700,letterSpacing:"-.01em",margin:"0 0 10px"}}>Don&apos;t recognise this?</h2>
                      <p className="text-slate-600 text-sm">{normaliseProviderName(unrecognisedSub.provider_name)} &middot; {formatGBP(unrecognisedSub.amount)}/{unrecognisedSub.billing_cycle}</p>
                    </div>
                  </div>
                  <button onClick={() => setUnrecognisedSub(null)} aria-label="Close" className="text-slate-600 hover:text-slate-900 inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/50 mb-5">
                  <p className="text-sm text-slate-600 mb-3">Banks often show unfamiliar merchant names on statements. Common examples:</p>
                  <div className="space-y-1.5 text-xs font-mono">
                    {[
                      ['CRV*GOOGLE', 'Google subscription (e.g. Google One, YouTube)'],
                      ['AMZN*Mktp', 'Amazon purchase or Prime'],
                      ['PAY.APPLE.COM', 'Apple subscription (iCloud, App Store)'],
                      ['PAYPAL*NETFLIX', 'Netflix via PayPal'],
                      ['KLARNA*', 'Klarna instalment payment'],
                      ['DD*SPOTIFY', 'Spotify subscription'],
                    ].map(([code, desc]) => (
                      <div key={code} className="flex gap-3">
                        <span className="text-emerald-600 shrink-0 w-36">{code}</span>
                        <span className="text-slate-600">{desc}</span>
                      </div>
                    ))}
                  </div>
                  {unrecognisedSub.bank_description && (
                    <div className="mt-3 pt-3 border-t border-slate-200/50">
                      <p className="text-xs text-slate-500">Bank description for this payment:</p>
                      <p className="text-sm text-slate-900 font-mono mt-0.5">{unrecognisedSub.bank_description}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => setUnrecognisedSub(null)}
                    className="w-full cta font-semibold py-3 rounded-xl transition-all text-sm"
                  >
                    Actually, I recognise it now
                  </button>
                  <button
                    onClick={() => {
                      setUnrecognisedSub(null);
                      router.push(
                        `/dashboard/complaints?new=1` +
                        `&company=${encodeURIComponent(unrecognisedSub.provider_name)}` +
                        `&type=complaint` +
                        `&issue=${encodeURIComponent(`Unrecognised payment of ${formatGBP(unrecognisedSub.amount)} appearing on my bank statement as "${unrecognisedSub.bank_description || unrecognisedSub.provider_name}". I do not recognise this charge.`)}` +
                        `&amount=${unrecognisedSub.amount}` +
                        `&outcome=${encodeURIComponent('Full refund of the unrecognised charge')}`
                      );
                    }}
                    className="w-full bg-white hover:bg-slate-50 text-slate-900 font-medium py-3 rounded-xl transition-all text-sm"
                  >
                    I still don&apos;t recognise it &mdash; dispute this charge
                  </button>
                  <button
                    onClick={() => setFraudStep('fraud_guidance')}
                    className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-medium py-3 rounded-xl transition-all text-sm"
                  >
                    This might be fraud
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
                      <Shield className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                      <h2 style={{fontSize:18,fontWeight:700,letterSpacing:"-.01em",margin:"0 0 10px"}}>Reporting a fraudulent payment</h2>
                      <p className="text-slate-600 text-sm">{formatGBP(unrecognisedSub.amount)} &middot; {unrecognisedSub.bank_description || unrecognisedSub.provider_name}</p>
                    </div>
                  </div>
                  <button onClick={() => setUnrecognisedSub(null)} aria-label="Close" className="text-slate-600 hover:text-slate-900 inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                    <p className="text-sm font-semibold text-slate-900 mb-1">1. Contact your bank immediately</p>
                    <p className="text-sm text-slate-600">Call the fraud team using the number on the back of your card or in your banking app. Tell them the payment is unauthorised and ask them to block further transactions from this merchant. They must investigate within 15 business days under the Payment Services Regulations 2017.</p>
                  </div>
                  <div className="card">
                    <p className="text-sm font-semibold text-slate-900 mb-2">2. Report to Action Fraud</p>
                    <div className="flex flex-col gap-1.5">
                      <a href="tel:03001232040" className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-500">
                        <Phone className="h-4 w-4" />
                        0300 123 2040
                      </a>
                      <a href="https://www.actionfraud.police.uk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-500">
                        <Shield className="h-4 w-4" />
                        actionfraud.police.uk
                      </a>
                    </div>
                  </div>
                  <div className="card">
                    <p className="text-sm font-semibold text-slate-900 mb-1">3. Your rights</p>
                    <div className="space-y-2 text-sm text-slate-600">
                      <p><span className="text-slate-900 font-medium">Credit card:</span> Section 75 of the Consumer Credit Act 1974 gives you the right to claim a refund from your card provider for purchases between £100 and £30,000 where the merchant fails to deliver or commits fraud.</p>
                      <p><span className="text-slate-900 font-medium">Debit card:</span> Ask your bank about chargeback rights. Under Visa/Mastercard rules your bank can reverse the transaction within 120 days.</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setFraudStep('initial')}
                    className="flex-1 bg-white hover:bg-slate-50 text-slate-900 font-medium py-3 rounded-xl transition-all text-sm"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setUnrecognisedSub(null)}
                    className="flex-1 bg-white hover:bg-slate-50 text-slate-600 font-medium py-3 rounded-xl transition-all text-sm"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit subscription modal */}
      {editSub && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Edit Subscription</h2>
              <button onClick={() => setEditSub(null)} className="text-slate-600 hover:text-slate-900 transition-all">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Provider Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.provider_name}
                  onChange={(e) => setEditForm({ ...editForm, provider_name: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Amount (£) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="999999"
                    required
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    placeholder="9.99"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Billing Cycle *</label>
                  <select
                    value={editForm.billing_cycle}
                    onChange={(e) => setEditForm({ ...editForm, billing_cycle: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    {BILLING_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    {!SORTED_CATEGORIES.some((c) => c.value === editForm.category) && editForm.category && (
                      <option key={editForm.category} value={editForm.category}>{editForm.category}</option>
                    )}
                    {SORTED_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Next Billing Date</label>
                  <input
                    type="date"
                    value={editForm.next_billing_date}
                    onChange={(e) => setEditForm({ ...editForm, next_billing_date: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Support Email</label>
                <input
                  type="email"
                  value={editForm.account_email}
                  onChange={(e) => setEditForm({ ...editForm, account_email: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  placeholder="support@provider.com"
                />
              </div>

              {/* Contract Details Section */}
              <details className="border border-slate-200/50 rounded-lg" open={!!editForm.contract_end_date}>
                <summary className="px-4 py-3 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Contract Details
                  <span className="text-xs text-slate-500 font-normal">(enables end-of-contract alerts)</span>
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  {/* Contract End Date — THE KEY FIELD */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Contract End Date</label>
                    <input
                      type="date"
                      value={editForm.contract_end_date}
                      onChange={(e) => setEditForm({ ...editForm, contract_end_date: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-emerald-500/30 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">We&apos;ll alert you before this date so you can switch to a better deal</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Contract Start Date</label>
                      <input
                        type="date"
                        value={editForm.contract_start_date}
                        onChange={(e) => setEditForm({ ...editForm, contract_start_date: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Contract Length</label>
                      <select
                        value={editForm.contract_term_months}
                        onChange={(e) => setEditForm({ ...editForm, contract_term_months: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Contract Type</label>
                      <select
                        value={editForm.contract_type}
                        onChange={(e) => setEditForm({ ...editForm, contract_type: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Select...</option>
                        {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Provider Type</label>
                      <select
                        value={editForm.provider_type}
                        onChange={(e) => setEditForm({ ...editForm, provider_type: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Select...</option>
                        {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Current Tariff */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Current Plan/Tariff Name</label>
                    <input
                      type="text"
                      value={editForm.current_tariff}
                      onChange={(e) => setEditForm({ ...editForm, current_tariff: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. Sky Superfast 80Mbps"
                    />
                  </div>

                  {/* Early Exit Fee */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Early Exit Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-3.5 text-slate-500">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.early_exit_fee}
                        onChange={(e) => setEditForm({ ...editForm, early_exit_fee: e.target.value })}
                        className="w-full pl-7 px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Auto-renews */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-slate-600">Auto-renews?</label>
                      <p className="text-xs text-slate-500">Most UK contracts auto-renew at a higher rate</p>
                    </div>
                    <input
                      type="checkbox"
                      id="auto_renews_edit"
                      checked={editForm.auto_renews}
                      onChange={(e) => setEditForm({ ...editForm, auto_renews: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-200/50 bg-white text-emerald-600 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Alert preferences */}
                  <div className="border-t border-slate-200/50 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-slate-600">Contract end alerts</label>
                        <p className="text-xs text-slate-500">Email me before this contract ends</p>
                      </div>
                      <input
                        type="checkbox"
                        id="alerts_enabled_edit"
                        checked={editForm.alerts_enabled}
                        onChange={(e) => setEditForm({ ...editForm, alerts_enabled: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-200/50 bg-white text-emerald-600 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Alert me this many days before</label>
                      <select
                        value={editForm.alert_before_days}
                        onChange={(e) => setEditForm({ ...editForm, alert_before_days: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
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
                className="w-full cta font-semibold py-4 rounded-lg transition-all flex items-center justify-center gap-2"
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
          <div className="card p-8 w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Add Subscription</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-slate-600 hover:text-slate-900 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleAddSubscription} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Provider Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={newSub.provider_name}
                  onChange={(e) => setNewSub({ ...newSub, provider_name: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. Netflix, Adobe, Spotify"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Amount (£) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10000"
                    required
                    value={newSub.amount}
                    onChange={(e) => setNewSub({ ...newSub, amount: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    placeholder="9.99"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Billing Cycle *
                  </label>
                  <select
                    value={newSub.billing_cycle}
                    onChange={(e) => setNewSub({ ...newSub, billing_cycle: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    {BILLING_CYCLES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    Category
                  </label>
                  <select
                    value={newSub.category}
                    onChange={(e) => setNewSub({ ...newSub, category: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    {!SORTED_CATEGORIES.some((c) => c.value === newSub.category) && newSub.category && (
                      <option key={newSub.category} value={newSub.category}>{newSub.category}</option>
                    )}
                    {SORTED_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">
                    How often used?
                  </label>
                  <select
                    value={newSub.usage_frequency}
                    onChange={(e) => setNewSub({ ...newSub, usage_frequency: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
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
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Next Billing Date
                </label>
                <input
                  type="date"
                  value={newSub.next_billing_date}
                  onChange={(e) => setNewSub({ ...newSub, next_billing_date: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Support Email (for mailto link)
                </label>
                <input
                  type="email"
                  value={newSub.account_email}
                  onChange={(e) => setNewSub({ ...newSub, account_email: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  placeholder="support@provider.com"
                />
              </div>

              {/* Contract Details Section */}
              <details className="border border-slate-200/50 rounded-lg">
                <summary className="px-4 py-3 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Contract Details
                  <span className="text-xs text-slate-500 font-normal">(enables end-of-contract alerts)</span>
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  {/* Contract End Date — THE KEY FIELD */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Contract End Date</label>
                    <input
                      type="date"
                      value={newSub.contract_end_date}
                      onChange={(e) => setNewSub({ ...newSub, contract_end_date: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-emerald-500/30 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">We&apos;ll alert you before this date so you can switch to a better deal</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Contract Start Date</label>
                      <input
                        type="date"
                        value={newSub.contract_start_date}
                        onChange={(e) => setNewSub({ ...newSub, contract_start_date: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Contract Length</label>
                      <select
                        value={newSub.contract_term_months}
                        onChange={(e) => setNewSub({ ...newSub, contract_term_months: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Contract Type</label>
                      <select
                        value={newSub.contract_type}
                        onChange={(e) => setNewSub({ ...newSub, contract_type: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Select...</option>
                        {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Provider Type</label>
                      <select
                        value={newSub.provider_type}
                        onChange={(e) => setNewSub({ ...newSub, provider_type: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Select...</option>
                        {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Current Plan/Tariff Name</label>
                    <input
                      type="text"
                      value={newSub.current_tariff}
                      onChange={(e) => setNewSub({ ...newSub, current_tariff: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. Sky Superfast 80Mbps"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Early Exit Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-3.5 text-slate-500">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newSub.early_exit_fee}
                        onChange={(e) => setNewSub({ ...newSub, early_exit_fee: e.target.value })}
                        className="w-full pl-7 px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm font-medium text-slate-600">Auto-renews?</label>
                      <p className="text-xs text-slate-500">Most UK contracts auto-renew at a higher rate</p>
                    </div>
                    <input
                      type="checkbox"
                      id="auto_renews_new"
                      checked={newSub.auto_renews}
                      onChange={(e) => setNewSub({ ...newSub, auto_renews: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-200/50 bg-white text-emerald-600 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Alert preferences */}
                  <div className="border-t border-slate-200/50 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-slate-600">Contract end alerts</label>
                        <p className="text-xs text-slate-500">Email me before this contract ends</p>
                      </div>
                      <input
                        type="checkbox"
                        id="alerts_enabled_new"
                        checked={newSub.alerts_enabled}
                        onChange={(e) => setNewSub({ ...newSub, alerts_enabled: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-200/50 bg-white text-emerald-600 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-2">Alert me this many days before</label>
                      <select
                        value={newSub.alert_before_days}
                        onChange={(e) => setNewSub({ ...newSub, alert_before_days: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
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
                className="w-full cta font-semibold py-4 rounded-lg transition-all flex items-center justify-center gap-2"
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
      <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />
    </div>
  );
}
