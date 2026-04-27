'use client';


import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import UpgradePrompt from '@/components/UpgradePrompt';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import UpgradeTrigger from '@/components/UpgradeTrigger';
import PlanLimitsBanner from '@/components/PlanLimitsBanner';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  CreditCard, FileText, Building2, BarChart3, CheckCircle, CheckCircle2,
  ArrowRight, Loader2, AlertTriangle, Clock, Sparkles, PiggyBank, TrendingUp, Tag,
  Mail, ScanSearch, RefreshCw, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { formatGBP } from '@/lib/format';
import PriceIncreaseCard from '@/components/alerts/PriceIncreaseCard';
import SavingsOpportunityWidget from '@/components/dashboard/SavingsOpportunityWidget';
import SavingsSkeleton from '@/components/dashboard/SavingsSkeleton';
import SavingsHero from '@/components/dashboard/SavingsHero';
import { cleanMerchantName } from '@/lib/merchant-utils';
import { countActiveSubscriptions } from '@/lib/subscriptions/active-count';
import BankPickerModal, { connectBankDirect } from '@/components/BankPickerModal';
import { calculateTotalSavings, parseComparisonDeals, isPriceAlertValid, priceAlertAnnualImpact } from '@/lib/savings-utils';
import { disputeWinnabilityHook } from '@/lib/category-taxonomy';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [monthlySpend, setMonthlySpend] = useState(0);
  const [spendBreakdown, setSpendBreakdown] = useState<{
    subscriptions_monthly: number; subscriptions_count: number;
    mortgages_monthly: number; mortgages_count: number;
    loans_monthly: number; loans_count: number;
    council_tax_monthly: number; council_tax_count: number;
  } | null>(null);
  const [complaintsGenerated, setComplaintsGenerated] = useState(0);
  const [bankConnected, setBankConnected] = useState(false);
  const [expiringContracts, setExpiringContracts] = useState(0);
  const [userTier, setUserTier] = useState('free');
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [taskFilter, setTaskFilter] = useState('all');
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState<any[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [comparisonSaving, setComparisonSaving] = useState(0);
  const [comparisonCount, setComparisonCount] = useState(0);
  const [comparisonDeals, setComparisonDeals] = useState<Array<{ subscriptionName: string; currentPrice: number; dealProvider: string; dealPrice: number; annualSaving: number; dealUrl: string; category: string }>>([]);
  const [activeSubscriptions, setActiveSubscriptions] = useState<any[]>([]);
  const [emailConnected, setEmailConnected] = useState(false);
  const [emailAddress, setEmailAddress] = useState<string | null>(null);
  const [emailLastScanned, setEmailLastScanned] = useState<string | null>(null);
  const [emailScanning, setEmailScanning] = useState(false);
  const [emailScanResults, setEmailScanResults] = useState<number | null>(null);
  const [emailOpportunities, setEmailOpportunities] = useState<any[]>([]);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSyncing, setBankSyncing] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; bank_name: string | null; account_display_names: string[] | null; status: string }>>([]);
  const [emailAccounts, setEmailAccounts] = useState<Array<{ id: string; email_address: string; provider_type: string }>>([]);
  const [connectionsCollapsed, setConnectionsCollapsed] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const supabase = createClient();
  const searchParams = useSearchParams();

  const potentialSavings = calculateTotalSavings(comparisonDeals, priceAlerts);

  // Disconnect bank function
  const disconnectBank = async (connectionId: string, bankName: string) => {
    if (!confirm(`Disconnect ${bankName || 'this bank'}? This will stop syncing transactions.`)) return;
    try {
      setDisconnectingId(connectionId);
      const res = await fetch('/api/bank/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        // Remove from local state optimistically
        setBankAccounts(bankAccounts.filter(b => b.id !== connectionId));
        setToast({ message: `${bankName || 'Bank'} disconnected`, type: 'success' });
      } else {
        setToast({ message: 'Failed to disconnect bank', type: 'error' });
      }
    } catch {
      setToast({ message: 'Failed to disconnect bank', type: 'error' });
    } finally {
      setDisconnectingId(null);
    }
  };

  // Meta Pixel + Awin tracking for free signups
  useEffect(() => {
    if (searchParams.get('signup') === '1') {
      // Meta Pixel Lead event
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'Lead');
      }
      const ref = sessionStorage.getItem('awin_ref') || '';
      const awc = sessionStorage.getItem('awin_awc') || '';
      sessionStorage.removeItem('awin_ref');
      sessionStorage.removeItem('awin_awc');
      if (!ref) return;

      let fired = false;
      let attempts = 0;
      const fire = () => {
        if (fired) return;
        fired = true;
        const w = window as any;
        w.AWIN = w.AWIN || {};
        w.AWIN.Tracking = w.AWIN.Tracking || {};
        w.AWIN.Tracking.Sale = {
          amount: '1', orderRef: ref, parts: 'LEAD:1',
          voucher: '', currency: 'GBP', channel: 'aw', customerAcquisition: 'NEW',
        };
        if (typeof w.AWIN?.Tracking?.saleSubmit === 'function') {
          w.AWIN.Tracking.saleSubmit();
        } else {
          const pixel = new window.Image(0, 0);
          pixel.src = `https://www.awin1.com/sread.img?tt=ns&tv=2&merchant=125502&amount=1&cr=GBP&ref=${encodeURIComponent(ref)}&parts=LEAD:1&vc=&ch=aw&customeracquisition=NEW${awc ? `&cks=${encodeURIComponent(awc)}` : ''}`;
        }
      };
      const poll = () => {
        const w = window as any;
        if (typeof w.AWIN?.Tracking?.saleSubmit === 'function' || attempts >= 40) { fire(); }
        else { attempts++; setTimeout(poll, 250); }
      };
      poll();
    }
  }, [searchParams]);

  // Sync subscription after Stripe checkout + Awin/Meta conversion tracking
  useEffect(() => {
    if (searchParams.get('success') === 'true' || searchParams.get('upgraded')) {
      // Recall transaction data stored before Stripe redirect
      const savedCheckout = (() => {
        try {
          const raw = sessionStorage.getItem('awin_checkout');
          if (raw) {
            sessionStorage.removeItem('awin_checkout');
            return JSON.parse(raw);
          }
        } catch {}
        return null;
      })();

      fetch('/api/stripe/sync', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.synced && data.tier && data.tier !== 'free') {
            setSyncMessage(`Welcome to Paybacker ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)}!`);
            setTimeout(() => setSyncMessage(null), 5000);

            // Use subscription ID from sync to match S2S tracking ref exactly
            const tier = data.tier;
            const amount = tier === 'pro' ? '9.99' : '4.99';
            const commGroup = tier === 'pro' ? 'PRO' : 'ESSENTIAL';
            const orderRef = data.subscriptionId ? `sub-${data.subscriptionId}` : (savedCheckout?.orderRef || `conversion-${tier}-${Date.now()}`);

            // Meta Pixel Purchase event
            if (typeof (window as any).fbq === 'function') {
              (window as any).fbq('track', 'Purchase', {
                value: parseFloat(amount),
                currency: 'GBP',
              });
            }

            // Push to dataLayer for GTM/Awin
            const w = window as any;
            w.dataLayer = w.dataLayer || [];
            w.dataLayer.push({ event: 'OrderReference', value: orderRef });
            w.dataLayer.push({ event: 'TotalOrderValue', value: amount });
            w.dataLayer.push({ event: 'CommissionGroup', value: commGroup });

            // Awin conversion tracking (client-side via mastertag)
            w.AWIN = w.AWIN || {};
            w.AWIN.Tracking = w.AWIN.Tracking || {};
            w.AWIN.Tracking.Sale = {
              amount,
              orderRef,
              parts: `${commGroup}:${amount}`,
              voucher: '',
              currency: 'GBP',
              channel: 'aw',
              customerAcquisition: 'NEW',
            };
            if (typeof w.AWIN?.Tracking?.saleSubmit === 'function') {
              w.AWIN.Tracking.saleSubmit();
            } else {
              // Fallback image pixel if mastertag hasn't loaded
              const pixel = new window.Image(0, 0);
              pixel.src = `https://www.awin1.com/sread.img?tt=ns&tv=2&merchant=125502&amount=${amount}&cr=GBP&ref=${encodeURIComponent(orderRef)}&parts=${commGroup}:${amount}&vc=&ch=aw&customeracquisition=NEW`;
            }
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      let hasBankConnection = false;
      let hasStoredAlerts = false;

      // Start deals loading in parallel immediately (non-blocking)
      const dealsPromise = (async () => {
        try {
          const compRes = await fetch('/api/subscriptions/compare?all=1', { method: 'GET' });
          if (compRes.ok) {
            const compData = await compRes.json();
            const { saving: filteredSaving, count: filteredCount, deals: dealsList } = parseComparisonDeals(compData);
            const compared = compData.subscriptionsCompared || 0;
            // Throttle the POST refresh — it re-runs comparison-engine
            // (external API calls) and is the slow step on dashboard load.
            // Only allow one refresh per 6 hours unless the cache is
            // genuinely empty.
            const REFRESH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
            // Scope the cooldown key to the current user — Codex P2 #313:
            // shared devices (family laptop, internet cafe) shouldn't
            // inherit a previous user's "we just refreshed" timer and
            // skip the new user's first-load fetch.
            const { data: { user: userForKey } } = await supabase.auth.getUser();
            const cooldownKey = `pb_compare_last_refresh_${userForKey?.id ?? 'anon'}`;
            let lastRefreshAt = 0;
            try { lastRefreshAt = Number(localStorage.getItem(cooldownKey) || '0'); } catch { /* private mode */ }
            const cooldownActive = Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS;
            const cacheEmpty = compared === 0 || filteredCount === 0;
            const shouldRefresh = cacheEmpty || (
              !cooldownActive && (
                (compared > 0 && filteredCount < compared * 0.5) ||
                (compared > 20 && filteredSaving < 500)
              )
            );
            if (shouldRefresh) {
              // Render cached results immediately so the user sees
              // numbers right away, then update in place once the POST
              // refresh comes back. Avoids a 5-15s blank state while
              // comparison-engine talks to external APIs.
              setComparisonSaving(filteredSaving);
              setComparisonCount(filteredCount);
              setComparisonDeals(dealsList);
              const r = await fetch('/api/subscriptions/compare', { method: 'POST' });
              if (r.ok) {
                try { localStorage.setItem(cooldownKey, String(Date.now())); } catch { /* ignore */ }
                const freshData = await r.json();
                const { saving: freshSaving, count: freshCount, deals: freshDeals } = parseComparisonDeals(freshData);
                setComparisonSaving(freshSaving);
                setComparisonCount(freshCount);
                if (freshDeals.length > 0) setComparisonDeals(freshDeals);
              } else {
                setComparisonSaving(filteredSaving);
                setComparisonCount(filteredCount);
                setComparisonDeals(dealsList);
              }
            } else {
              setComparisonSaving(filteredSaving);
              setComparisonCount(filteredCount);
              setComparisonDeals(dealsList);
            }
          }
        } catch {} // Non-critical
        finally { setDealsLoading(false); }
      })();

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const [profile, subs, tasks, banks, userTasks, cancelledSubs, resolvedTasks] = await Promise.all([
          supabase.from('profiles').select('subscription_tier, total_money_recovered, founding_member, founding_member_expires, subscription_status, stripe_subscription_id').eq('id', user.id).maybeSingle(),
          supabase.from('subscriptions').select('provider_name, amount, billing_cycle, contract_end_date, status')
            .eq('user_id', user.id).eq('status', 'active').is('dismissed_at', null),
          supabase.from('disputes').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).neq('status', 'resolved').neq('status', 'dismissed'),
          supabase.from('bank_connections').select('id, bank_name, account_display_names, status')
            .eq('user_id', user.id).neq('status', 'disconnected'),
          supabase.from('tasks').select('id, title, description, type, provider_name, disputed_amount, status, created_at, priority')
            .eq('user_id', user.id).eq('status', 'pending_review')
            .order('created_at', { ascending: false }).limit(20),
          supabase.from('subscriptions').select('id, provider_name, amount, billing_cycle, money_saved, cancelled_at, notes')
            .eq('user_id', user.id).eq('status', 'cancelled'),
          supabase.from('tasks').select('money_recovered')
            .eq('user_id', user.id).eq('status', 'resolved'),
        ]);

        setUserTier(profile.data?.subscription_tier || 'free');
        hasBankConnection = (banks.data || []).length > 0;
        setBankConnected(hasBankConnection);
        setBankAccounts(banks.data || []);

        // Check email connection (Gmail or IMAP)
        const { data: emailConns } = await supabase
          .from('email_connections')
          .select('id, email_address, provider_type, status, last_scanned_at')
          .eq('user_id', user.id)
          .eq('status', 'active');
        if (emailConns && emailConns.length > 0) {
          setEmailConnected(true);
          setEmailAddress(emailConns[0].email_address);
          setEmailLastScanned(emailConns[0].last_scanned_at);
          setEmailAccounts(emailConns.map(e => ({ id: e.id, email_address: e.email_address, provider_type: e.provider_type })));
        } else {
          // Also check gmail_tokens table as fallback
          const { data: gmailToken } = await supabase
            .from('gmail_tokens')
            .select('id, email')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
          if (gmailToken) {
            setEmailConnected(true);
            setEmailAddress(gmailToken.email);
          }
        }

        // Load saved email scan opportunities from the centralised email_scan_findings table
        const { data: scanFindings } = await supabase
          .from('email_scan_findings')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['new', 'reviewing'])
          .order('created_at', { ascending: false })
          .limit(30);

        if (scanFindings && scanFindings.length > 0) {
          const mapped = scanFindings.map((f: any) => {
            const meta = f.metadata || {};
            return {
              id: f.id,
              type: f.finding_type || meta.type || 'opportunity',
              category: meta.category || 'other',
              title: f.title || meta.title || 'Opportunity',
              description: f.description || meta.description || '',
              amount: f.amount || meta.amount || 0,
              confidence: f.confidence || meta.confidence || 60,
              provider: f.provider || meta.provider || 'Unknown',
              suggestedAction: meta.suggestedAction || 'track',
              paymentFrequency: f.payment_frequency || meta.paymentFrequency || null,
              contractEndDate: f.contract_end_date || meta.contractEndDate || null,
              paymentAmount: f.amount || meta.paymentAmount || null,
              status: f.status,
            };
          });
          setEmailOpportunities(mapped);
          setEmailScanResults(mapped.length);
        } else {
          // Fallback: try legacy tasks table for older scan results
          const { data: savedOpps } = await supabase
            .from('tasks')
            .select('id, title, description, type, provider_name, status, priority, created_at')
            .eq('user_id', user.id)
            .eq('type', 'opportunity')
            .in('status', ['pending_review', 'suggested'])
            .order('created_at', { ascending: false })
            .limit(30);
          if (savedOpps && savedOpps.length > 0) {
            const mapped = savedOpps.map((t: any) => {
              const parsed = (() => { try { return JSON.parse(t.description || '{}'); } catch { return {}; } })();
              return {
                id: parsed.id || t.id,
                type: parsed.type || 'opportunity',
                category: parsed.category || 'other',
                title: t.title || parsed.title || 'Opportunity',
                description: parsed.description || t.description || '',
                amount: parsed.amount || 0,
                confidence: parsed.confidence || 60,
                provider: t.provider_name || parsed.provider || 'Unknown',
                suggestedAction: parsed.suggestedAction || 'track',
                paymentFrequency: parsed.paymentFrequency || null,
                status: t.status,
              };
            });
            setEmailOpportunities(mapped);
            setEmailScanResults(mapped.length);
          }
        }

        // Check trial status
        if (profile.data?.founding_member && profile.data?.founding_member_expires && !profile.data?.stripe_subscription_id) {
          const expiresAt = new Date(profile.data.founding_member_expires);
          const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          if (daysLeft > 0) {
            setTrialDaysLeft(daysLeft);
          } else {
            setTrialExpired(true);
          }
        }
        setComplaintsGenerated(tasks.count || 0);
        // Filter out Paybacker's own transactions from action items
        setPendingTasks((userTasks.data || []).filter((t: any) =>
          !((t.provider_name || '').toLowerCase().includes('paybacker'))
        ));

        // Potential savings: estimate from active subscriptions (assume 15% could be saved by switching)
        const activeSubs = subs.data || [];
        const annualSpend = activeSubs.reduce((sum, s) => {
          const amt = parseFloat(String(s.amount)) || 0;
          if (s.billing_cycle === 'yearly') return sum + amt;
          if (s.billing_cycle === 'quarterly') return sum + amt * 4;
          return sum + amt * 12;
        }, 0);

        // potentialSavings will be calculated after all data loads (see below)

        const subsList = subs.data || [];
        // Single source of truth for "active subscriptions" — dedupe +
        // finance-strip handled by shared helper so every page agrees.
        setSubscriptionCount(countActiveSubscriptions(subsList));
        setActiveSubscriptions(subsList);

        // Calculate monthly spend via RPC for consistency with subscriptions page
        const { data: subTotal } = await supabase.rpc('get_subscription_total', { p_user_id: user.id });
        if (subTotal) {
          setMonthlySpend(subTotal.subscriptions_monthly ?? 0);
          setSpendBreakdown(subTotal);
        } else {
          // Fallback: client-side calculation
          const monthly = subsList.reduce((sum, s) => {
            const amt = parseFloat(String(s.amount)) || 0;
            if (s.billing_cycle === 'yearly') return sum + amt / 12;
            if (s.billing_cycle === 'quarterly') return sum + amt / 3;
            return sum + amt;
          }, 0);
          setMonthlySpend(monthly);
        }

        // Count contracts expiring within 30 days (subscriptions + vault extractions)
        const now = new Date();
        const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringSubs = subsList.filter(s =>
          s.contract_end_date &&
          new Date(s.contract_end_date) >= now &&
          new Date(s.contract_end_date) <= thirtyDays
        ).length;

        const { count: vaultExpiringCount } = await supabase
          .from('contract_extractions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .not('contract_end_date', 'is', null)
          .gte('contract_end_date', now.toISOString().split('T')[0])
          .lte('contract_end_date', thirtyDays.toISOString().split('T')[0]);

        setExpiringContracts(expiringSubs + (vaultExpiringCount || 0));

        // Fetch active price increase alerts for display
        const { data: priceAlertData } = await supabase
          .from('price_increase_alerts')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('annual_impact', { ascending: false });
        setPriceAlerts(priceAlertData || []);

        // Check if ANY alerts exist (active, dismissed, or actioned) to prevent
        // re-running detection when all alerts have been dismissed by the user.
        const { count: anyAlertsCount } = await supabase
          .from('price_increase_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('status', ['active', 'dismissed', 'actioned']);
        hasStoredAlerts = (anyAlertsCount || 0) > 0;

        const priceAlertImpact = (priceAlertData || []).reduce((sum: number, a: any) => {
          const diff = (parseFloat(a.new_amount) || 0) - (parseFloat(a.old_amount) || 0);
          return sum + (diff > 0 ? diff * 12 : (parseFloat(a.annual_impact) || 0));
        }, 0);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }

      // On-demand price increase detection: if the user has bank data but no
      // stored alerts yet, run detection immediately rather than waiting for
      // the 8 AM daily cron. Deduplication in the endpoint prevents double inserts.
      if (hasBankConnection && !hasStoredAlerts) {
        try {
          const detectRes = await fetch('/api/price-alerts/detect', { method: 'POST' });
          if (detectRes.ok) {
            const detectData = await detectRes.json();
            if (detectData.alerts?.length > 0) {
              setPriceAlerts(detectData.alerts);
            }
          }
        } catch {} // Non-critical
      }
    };
    fetchData();
  }, [supabase]);

  // Provider-aware scan dispatch — Gmail, Outlook and IMAP each have
  // their own scan endpoint. Scan ALL the user's active connections
  // in parallel rather than only the first one, then refresh state
  // from the canonical sources (email_scan_findings + last_scanned_at)
  // so the UI reflects what actually changed regardless of which
  // endpoint succeeded or whether new findings were produced.
  const handleEmailScan = async () => {
    setEmailScanning(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Pick the right scan endpoint per connection. Gmail = google
      // OAuth, Outlook = microsoft OAuth, anything else (Yahoo / iCloud
      // / BT / Sky etc.) goes through the IMAP scanner.
      const endpointFor = (providerType: string | null) => {
        const p = (providerType || '').toLowerCase();
        if (p === 'google' || p === 'gmail') return '/api/gmail/scan';
        if (p === 'outlook' || p === 'microsoft') return '/api/outlook/scan';
        return '/api/email/scan';
      };

      const targets = emailAccounts.length > 0
        ? emailAccounts.map((a) => ({ id: a.id, endpoint: endpointFor(a.provider_type) }))
        : [{ id: null, endpoint: '/api/gmail/scan' }]; // legacy gmail_tokens fallback

      // Dedupe — multiple accounts on the same provider don't need to
      // hit the same endpoint twice (the endpoints loop over all the
      // user's connections of their type internally).
      const seen = new Set<string>();
      const calls = targets
        .filter(({ endpoint }) => (seen.has(endpoint) ? false : (seen.add(endpoint), true)))
        .map(({ endpoint }) => fetch(endpoint, { method: 'POST' }).catch(() => null));

      await Promise.all(calls);

      // Always refresh state from the canonical tables, regardless of
      // per-endpoint success. Fixes the "scan-now button doesn't seem
      // to update" report — previously a same-result scan left the UI
      // showing stale opportunity counts.
      const [{ data: scanFindings }, { data: refreshedConns }] = await Promise.all([
        supabase
          .from('email_scan_findings')
          .select('*')
          .eq('user_id', authUser.id)
          .in('status', ['new', 'reviewing'])
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('email_connections')
          .select('id, email_address, provider_type, last_scanned_at')
          .eq('user_id', authUser.id)
          .eq('status', 'active'),
      ]);

      const mapped = (scanFindings ?? []).map((f: any) => {
        const meta = f.metadata || {};
        return {
          id: f.id,
          type: f.finding_type || meta.type || 'opportunity',
          category: meta.category || 'other',
          title: f.title || meta.title || 'Opportunity',
          description: f.description || meta.description || '',
          amount: f.amount || meta.amount || 0,
          confidence: f.confidence || meta.confidence || 60,
          provider: f.provider || meta.provider || 'Unknown',
          suggestedAction: meta.suggestedAction || 'track',
          paymentFrequency: f.payment_frequency || meta.paymentFrequency || null,
          contractEndDate: f.contract_end_date || meta.contractEndDate || null,
          paymentAmount: f.amount || meta.paymentAmount || null,
          status: f.status,
        };
      });
      setEmailOpportunities(mapped);
      setEmailScanResults(mapped.length);

      if (refreshedConns && refreshedConns.length > 0) {
        // Pick the most-recently-scanned timestamp so the UI shows the
        // freshest signal across all active accounts.
        const latest = refreshedConns
          .map((c) => c.last_scanned_at)
          .filter((s): s is string => !!s)
          .sort()
          .at(-1) ?? null;
        setEmailLastScanned(latest);
      }
    } catch {
      // No state mutation on a hard throw — leave the UI as it was
      // and let the user retry. Setting results=0 here previously
      // hid existing opportunities which felt worse than not updating.
    } finally {
      setEmailScanning(false);
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }


  // ─── Derived: build Action Centre rows from real data ──────────────────
  // Maps price-increase alerts + comparison deals into a single, sorted feed
  // that matches the visual grammar of Variant A's Action Centre card.
  type ActionRow = {
    key: string;
    title: string;
    meta: string;
    tileBg: string;
    tileFg: string;
    icon: React.ReactNode;
    pillClass: 'red' | 'grn' | 'amb' | 'blu';
    pillText: string;
    amountClass: 'pos' | 'neg';
    amountLabel: string;
    impact: number;
    ctaHref: string;
    ctaLabel: string;
  };

  // Price alerts split into THREE classes by the canonical taxonomy
  // (see classifyDispute() / dispute_classification column). The Action
  // Centre renders each in its own visual section so users don't see
  // "Start dispute" buttons on bills they can't actually dispute (council
  // tax, HMRC, loan rate changes, etc).
  const buildDisputeRow = (a: typeof priceAlerts[number]): ActionRow & { classification: 'disputable' | 'track_only' | 'unknown'; hook: string | null } => {
    const impact = priceAlertAnnualImpact(a);
    const merchant = cleanMerchantName(a.merchant_name || 'Provider');
    const pct = (parseFloat(a.increase_pct) || 0).toFixed(1);
    const classification = (a.dispute_classification as 'disputable' | 'track_only' | 'unknown') || 'unknown';
    const hook = disputeWinnabilityHook(a.category);
    return {
      key: `price-${a.id}`,
      title: `${merchant} price rise +${pct}%`,
      meta: `£${Number(a.old_amount).toFixed(2)} → £${Number(a.new_amount).toFixed(2)}`,
      tileBg: classification === 'disputable' ? 'var(--rose-wash)' : 'var(--bg-2, #F5F5F4)',
      tileFg: classification === 'disputable' ? 'var(--rose-deep)' : 'var(--text-3)',
      icon: <TrendingUp className="h-5 w-5" />,
      pillClass: classification === 'disputable' ? ('red' as const) : ('amb' as const),
      pillText: classification === 'disputable' ? 'Dispute' : classification === 'track_only' ? 'Track only' : 'Worth a look',
      amountClass: 'neg' as const,
      amountLabel: `+${formatGBP(impact)}/yr cost`,
      impact,
      ctaHref: classification === 'disputable'
        ? `/dashboard/complaints?company=${encodeURIComponent(merchant)}&issue=${encodeURIComponent(`price increase from £${Number(a.old_amount).toFixed(2)} to £${Number(a.new_amount).toFixed(2)}`)}&amount=${impact}&alertId=${a.id}&new=1`
        : `/dashboard/money-hub`,
      ctaLabel: classification === 'disputable' ? 'Start dispute' : 'View',
      classification,
      hook,
    };
  };

  const allDisputes = priceAlerts.filter(isPriceAlertValid).map(buildDisputeRow);
  const disputableRows = allDisputes.filter(d => d.classification === 'disputable');
  const trackOnlyRows = allDisputes.filter(d => d.classification === 'track_only');
  const unknownDisputeRows = allDisputes.filter(d => d.classification === 'unknown');

  // Backwards compat for downstream KPI rows that read disputeRows
  const disputeRows = disputableRows;

  // Deals — money saved by switching. Stable sort by annualSaving with id
  // tiebreaker so the headline £-figure doesn't flicker between renders
  // when multiple deals tie in savings (the previous slice(0,6) without a
  // tiebreaker produced £4,609 / £4,669 oscillation).
  const dealRows: ActionRow[] = [...comparisonDeals]
    .sort((a, b) =>
      (b.annualSaving || 0) - (a.annualSaving || 0)
      || (a.subscriptionName || '').localeCompare(b.subscriptionName || '')
    )
    .slice(0, 6)
    .map((d, i) => ({
      key: `deal-${i}-${d.subscriptionName}`,
      title: `${cleanMerchantName(d.subscriptionName)} — ${d.dealProvider} is cheaper`,
      meta: `Current £${d.currentPrice?.toFixed?.(2) ?? d.currentPrice} · Best alt £${d.dealPrice?.toFixed?.(2) ?? d.dealPrice}`,
      tileBg: 'var(--mint-wash)',
      tileFg: 'var(--mint-deep)',
      icon: <Tag className="h-5 w-5" />,
      pillClass: 'grn' as const,
      pillText: 'Save',
      amountClass: 'pos' as const,
      amountLabel: `–${formatGBP(d.annualSaving || 0)}/yr`,
      impact: d.annualSaving || 0,
      ctaHref: '/dashboard/deals',
      ctaLabel: 'Compare',
    }));

  // The PRIMARY action list: disputable price rises + cheaper-deal switches.
  // These are the things the user can act on right now with high confidence.
  const primaryActions: ActionRow[] = [...disputableRows, ...dealRows].sort(
    (a, b) => b.impact - a.impact,
  );
  const dealsAnnualSaving = dealRows.reduce((s, d) => s + d.impact, 0);
  const disputesAnnualImpact = disputableRows.reduce((s, d) => s + d.impact, 0);
  const trackOnlyAnnualImpact = trackOnlyRows.reduce((s, d) => s + d.impact, 0);
  const [showAllActions, setShowAllActions] = useState(false);
  const [showTrackOnly, setShowTrackOnly] = useState(false);
  const actionRowsTop = showAllActions ? primaryActions : primaryActions.slice(0, 5);
  // Total count includes everything the user can see (primary + track-only +
  // unknown), so the headline pill matches what's actually on screen.
  const totalActions = primaryActions.length + trackOnlyRows.length + unknownDisputeRows.length;
  // Backwards-compat alias for downstream KPI cards that read actionRows.
  const actionRows = primaryActions;

  // Greeting based on local time — no user-name dependency (name shown in shell).
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const ChecklistRow = ({
    done,
    label,
    action,
  }: {
    done: boolean;
    label: string;
    action: React.ReactNode;
  }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {done ? (
          <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--mint-deep)' }} />
        ) : (
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '1.5px solid var(--divider)',
            }}
          />
        )}
        <span style={{ color: done ? 'var(--text-3)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
          {label}
        </span>
      </div>
      {action}
    </div>
  );

  return (
    <div>
      <PlanLimitsBanner />
      <SavingsHero />
      {userTier === 'free' && <UpgradePrompt variant="banner" />}

      {syncMessage && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: 'var(--mint-wash)',
            borderColor: '#BBF7D0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--mint-deep)',
            fontWeight: 600,
            fontSize: 13,
            padding: '12px 16px',
          }}
        >
          <CheckCircle className="h-4 w-4" />
          {syncMessage}
        </div>
      )}

      {trialExpired && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: 'var(--amber-wash)',
            borderColor: '#FCD34D',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            padding: '14px 18px',
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              Your free Pro trial has ended
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-2)' }}>
              Upgrade to keep unlimited letters, daily bank sync, spending intelligence, and all Pro features. Your data is safe.
            </p>
          </div>
          <Link href="/pricing" className="cta">Upgrade now →</Link>
        </div>
      )}

      {trialDaysLeft !== null && trialDaysLeft <= 7 && !trialExpired && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: 'var(--mint-wash)',
            borderColor: '#BBF7D0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            padding: '14px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock className="h-4 w-4" style={{ color: 'var(--mint-deep)' }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
              Pro trial ends in{' '}
              <strong style={{ color: 'var(--mint-deep)' }}>
                {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}
              </strong>
              . Upgrade to keep all features.
            </p>
          </div>
          <Link href="/pricing" className="cta-ghost">View plans →</Link>
        </div>
      )}

      <OnboardingFlow
        hasLetter={complaintsGenerated > 0}
        bankConnected={bankConnected}
        subscriptionCount={subscriptionCount}
        tier={userTier}
      />

      {/* ─── Page title row ─────────────────────────────────────────── */}
      <div className="page-title-row">
        <div>
          <h1 className="page-title">{greeting} 👋</h1>
          <p className="page-sub">
            {/* Hold off the headline number until both data sources are
                in. Showing it the moment price-alerts arrive (and again
                a few seconds later when the deals fetch finishes) makes
                the value tick up visibly — looks broken. Match the
                action-centre card's gating below. */}
            {dealsLoading ? (
              <>Loading your action centre…</>
            ) : totalActions > 0 ? (
              <>
                You have{' '}
                <strong style={{ color: 'var(--mint-deep)' }}>
                  {totalActions} action{totalActions === 1 ? '' : 's'} worth {formatGBP(potentialSavings)}/yr
                </strong>{' '}
                waiting. Start with the biggest wins.
              </>
            ) : (
              <>Your financial snapshot and quick actions.</>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="cta-ghost" href="/dashboard/export">Export data</Link>
          <Link className="cta" href="/dashboard/subscriptions">Review subs →</Link>
        </div>
      </div>

      {/* ─── Hero Action Centre ─────────────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          marginBottom: 16,
          border: '1px solid #BBF7D0',
          background: 'linear-gradient(180deg, #F0FDF4 0%, #fff 100%)',
        }}
      >
        <div
          style={{
            padding: '20px 22px 10px',
            borderBottom: '1px solid #D1FAE5',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'var(--mint-deep)',
                background: '#fff',
                padding: '5px 10px',
                border: '1px solid #BBF7D0',
                borderRadius: 999,
                marginBottom: 10,
              }}
            >
              ⚡ Action Centre · {dealsLoading ? '…' : `${totalActions} item${totalActions === 1 ? '' : 's'}`}
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.015em' }}>
              {dealsLoading
                ? 'Crunching cheaper-alternatives + price alerts…'
                : dealRows.length === 0 && disputeRows.length === 0
                  ? 'No actions waiting — you\'re all caught up.'
                  : dealRows.length > 0 && disputeRows.length === 0
                    ? `${formatGBP(dealsAnnualSaving)} of potential savings — ready to claim`
                    : disputeRows.length > 0 && dealRows.length === 0
                      ? `${formatGBP(disputesAnnualImpact)} of price rises to dispute`
                      : `${formatGBP(dealsAnnualSaving)} to save · ${formatGBP(disputesAnnualImpact)} to dispute`}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
              {disputeRows.length > 0 && dealRows.length > 0
                ? 'Switch deals save you money. Disputed price rises recover money you\'d otherwise lose.'
                : 'Based on cheaper alternatives and price increase alerts we\'ve detected.'}
            </p>
          </div>
        </div>
        <div style={{ padding: '8px 22px 18px' }}>
          {actionRowsTop.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                color: 'var(--text-3)',
                fontSize: 13,
              }}
            >
              Ready to find your first saving? Connect a bank account to scan transactions for forgotten subscriptions and silent price rises — we&apos;ll flag every one automatically.
            </div>
          ) : (
            actionRowsTop.map((r, i) => (
              <div
                key={r.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 0',
                  borderTop: i ? '1px solid #D1FAE5' : '0',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: r.tileBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: r.tileFg,
                    flexShrink: 0,
                  }}
                >
                  {r.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 2,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{r.title}</div>
                    <span className={`pill ${r.pillClass}`}>{r.pillText}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.meta}</div>
                  {/* "Why this is winnable" microcopy on disputable cards.
                      Pulled from the canonical disputeWinnabilityHook() so the
                      copy is the same wherever a dispute is shown. */}
                  {('hook' in r) && (r as { hook: string | null }).hook && (
                    <div style={{ fontSize: 11, color: 'var(--rose-deep)', marginTop: 4, fontWeight: 600 }}>
                      ⚖ {(r as { hook: string }).hook}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', minWidth: 100 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: r.amountClass === 'neg' ? 'var(--rose-deep)' : 'var(--mint-deep)',
                    }}
                  >
                    {r.amountLabel}
                  </div>
                </div>
                <Link href={r.ctaHref} className="cta" style={{ fontSize: 12, padding: '8px 12px' }}>
                  {r.ctaLabel} →
                </Link>
              </div>
            ))
          )}
          {actionRows.length > 5 && (
            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowAllActions((prev) => !prev)}
                style={{
                  fontSize: 12,
                  color: 'var(--text-3)',
                  fontWeight: 600,
                  textDecoration: 'none',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showAllActions
                  ? 'Show fewer actions ↑'
                  : `Show ${actionRows.length - 5} more action${actionRows.length - 5 === 1 ? '' : 's'} ↓`}
              </button>
            </div>
          )}

          {/* Track-only section: real price rises that aren't winnable as
              disputes (council tax, HMRC, mortgage rate changes, loan
              repayments). Collapsed by default so they don't clutter the
              headline but still surface in the count. */}
          {trackOnlyRows.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed #D1FAE5' }}>
              <button
                type="button"
                onClick={() => setShowTrackOnly((prev) => !prev)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', padding: 0,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'var(--text-3)', fontWeight: 600,
                }}
                aria-expanded={showTrackOnly}
              >
                <span>{showTrackOnly ? '▾' : '▸'}</span>
                <span>
                  {trackOnlyRows.length} price rise{trackOnlyRows.length === 1 ? '' : 's'} worth tracking
                  {' '}({formatGBP(trackOnlyAnnualImpact)}/yr extra) — not disputable
                </span>
              </button>
              {showTrackOnly && (
                <div style={{ marginTop: 8 }}>
                  {trackOnlyRows.map((r) => (
                    <div
                      key={r.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', borderTop: '1px solid #F1F5F9',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>{r.title}</div>
                        <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{r.meta}</div>
                      </div>
                      <div style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 700, minWidth: 90, textAlign: 'right' }}>
                        +{formatGBP(r.impact)}/yr
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, fontStyle: 'italic' }}>
                    Council tax, mortgage rate changes, HMRC, loan repayments, parking and statutory fees follow contractual or legal terms — they can&apos;t be challenged via a consumer-rights letter. We&apos;re tracking them so you can see them in your spending picture.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── KPI row ────────────────────────────────────────────────── */}
      <div className="kpi-row c4" style={{ marginBottom: 16 }}>
        <Link href="/dashboard/subscriptions" className="kpi-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="k-label"><CreditCard className="h-3.5 w-3.5" /> Subscriptions & bills</div>
          <div className="k-val">{subscriptionCount}</div>
          <div className="k-delta">{formatGBP(monthlySpend)}/mo</div>
        </Link>
        <Link href="/dashboard/complaints" className="kpi-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="k-label"><FileText className="h-3.5 w-3.5" /> Disputes</div>
          <div className="k-val">{complaintsGenerated}</div>
          <div className="k-delta">Filed</div>
        </Link>
        <div className="kpi-card">
          <div className="k-label"><PiggyBank className="h-3.5 w-3.5" /> Potential savings</div>
          <div className="k-val green">{formatGBP(potentialSavings)}</div>
          <div className="k-delta">Per year</div>
        </div>
        <Link href="/dashboard/profile" className="kpi-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="k-label"><Building2 className="h-3.5 w-3.5" /> Bank</div>
          <div className="k-val">
            {bankConnected ? (bankAccounts.some((b) => b.status === 'active') ? 'Connected' : 'Expired') : 'Not set'}
          </div>
          <div className="k-delta">
            {bankConnected
              ? bankAccounts.some((b) => b.status === 'active')
                ? `${bankAccounts.length} bank${bankAccounts.length === 1 ? '' : 's'} linked`
                : 'Needs reconnect'
              : 'Add a bank to unlock alerts'}
          </div>
        </Link>
      </div>

      {/* ─── Two-column body ───────────────────────────────────────── */}
      <div className="overview-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Next-up banner — surfaces the single most important
              missing-setup step at the top of the main column, where
              it's visible on first scroll. The full "Get the most out
              of Paybacker" checklist still lives on the right rail,
              but on phones the rail stacks *below* the main column —
              without this banner, a fresh user on iPhone has to scroll
              past 1200px of widgets before they see their first
              setup cue. Only renders while any core step is missing. */}
          {(!bankConnected || !emailConnected || complaintsGenerated === 0) && (() => {
            const nextStep = !bankConnected
              ? { label: 'Connect a bank to unlock price alerts & auto-detected subscriptions', cta: 'Connect bank →', onClick: () => { if (!connectBankDirect()) setShowBankPicker(true); }, href: null }
              : !emailConnected
              ? { label: 'Connect an email inbox to catch hidden bills and forgotten subs', cta: 'Connect email →', onClick: null, href: '/dashboard/profile?connect_email=true' }
              : { label: 'Write your first dispute letter — we\'ll cite the exact UK law', cta: 'Start a letter →', onClick: null, href: '/dashboard/complaints' };
            return (
              <div
                className="card"
                style={{
                  background: 'linear-gradient(135deg, var(--mint-wash), #D1FAE5)',
                  border: '1px solid #86EFAC',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  minHeight: 68,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Sparkles className="h-5 w-5" style={{ color: 'var(--mint-deep)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mint-deep)', marginBottom: 2 }}>
                    Next up
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.35 }}>
                    {nextStep.label}
                  </div>
                </div>
                {nextStep.href ? (
                  <Link
                    href={nextStep.href}
                    style={{
                      flexShrink: 0,
                      padding: '10px 14px',
                      background: 'var(--mint-deep)',
                      color: '#fff',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 700,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {nextStep.cta}
                  </Link>
                ) : (
                  <button
                    onClick={nextStep.onClick!}
                    style={{
                      flexShrink: 0,
                      padding: '10px 14px',
                      background: 'var(--mint-deep)',
                      color: '#fff',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {nextStep.cta}
                  </button>
                )}
              </div>
            );
          })()}

          {/* Savings Opportunity Widget — existing */}
          {dealsLoading ? (
            <SavingsSkeleton />
          ) : (
            <SavingsOpportunityWidget totalSaving={comparisonSaving} count={comparisonCount} deals={comparisonDeals} />
          )}

          {/* Price-increase alert list */}
          {priceAlerts.length > 0 && (
            <div id="price-alerts" className="card">
              <h3>
                <AlertTriangle className="h-4 w-4" style={{ color: 'var(--rose-deep)' }} /> Price increase alerts{' '}
                <span className="count-tag">{priceAlerts.length}</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {priceAlerts.map((alert) => (
                  <PriceIncreaseCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={async (id) => {
                      await fetch('/api/price-alerts', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: 'dismissed' }),
                      });
                      setPriceAlerts((prev) => prev.filter((a) => a.id !== id));
                    }}
                    onAction={async (id) => {
                      await fetch('/api/price-alerts', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: 'actioned' }),
                      });
                      setPriceAlerts((prev) => prev.filter((a) => a.id !== id));
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Email scanner card */}
          {emailConnected ? (
            <div className="card">
              <h3 style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Mail className="h-4 w-4" /> Email scanner
                </span>
                <button
                  onClick={handleEmailScan}
                  disabled={emailScanning}
                  className="cta"
                  style={{ fontSize: 12, padding: '7px 11px' }}
                >
                  {emailScanning ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</>
                  ) : (
                    <><ScanSearch className="h-3.5 w-3.5" /> Scan now</>
                  )}
                </button>
              </h3>
              <p style={{ margin: '-6px 0 10px', fontSize: 12, color: 'var(--text-3)' }}>
                {emailScanResults !== null
                  ? emailScanResults === 0
                    ? 'No billing or subscription emails to flag yet.'
                    : `Found ${emailScanResults} bill${emailScanResults === 1 ? '' : 's'} and subscription${emailScanResults === 1 ? '' : 's'} to review.`
                  : emailAddress
                  ? `Connected: ${emailAddress}${emailLastScanned ? ` · Last scanned ${new Date(emailLastScanned).toLocaleDateString()}` : ''}`
                  : 'Scan your inbox to find bills, overcharges and savings.'}
              </p>
              {emailOpportunities.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {emailOpportunities.slice(0, 5).map((opp: any, i: number) => (
                    <div
                      key={opp.id || i}
                      style={{
                        display: 'flex',
                        gap: 10,
                        padding: '10px 0',
                        borderTop: i ? '1px solid var(--divider-2)' : '1px solid var(--divider-2)',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{opp.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.35 }}>
                          {opp.provider} · {(opp.type || 'opportunity').replace(/_/g, ' ')}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          setEmailOpportunities((prev) => prev.filter((o: any) => o.id !== opp.id));
                          setEmailScanResults((prev) => (prev !== null ? prev - 1 : null));
                          try {
                            await supabase.from('email_scan_findings').update({ status: 'dismissed' }).eq('id', opp.id);
                            await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', opp.id);
                          } catch {}
                        }}
                        style={{ background: 'transparent', border: 0, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}
                        title="Dismiss"
                      >
                        Dismiss
                      </button>
                    </div>
                  ))}
                  {emailOpportunities.length > 5 && (
                    <Link
                      href="/dashboard/scanner"
                      style={{ fontSize: 12, color: 'var(--mint-deep)', textDecoration: 'none', paddingTop: 10 }}
                    >
                      View all {emailOpportunities.length} opportunities →
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <Mail className="h-5 w-5" style={{ color: '#6D28D9', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Scan your emails for savings</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                    Find hidden bills, overcharges and money-saving opportunities.
                  </p>
                </div>
              </div>
              <Link href="/dashboard/profile?connect_email=true" className="cta-ghost" style={{ fontSize: 12 }}>
                Connect email →
              </Link>
            </div>
          )}

          {/* Free-tier upgrade trigger (price increases detected) */}
          <UpgradeTrigger
            type="price_increase"
            priceIncreaseCount={priceAlerts.filter(isPriceAlertValid).length}
            priceIncreaseAnnual={priceAlerts
              .filter(isPriceAlertValid)
              .reduce((sum, a) => sum + priceAlertAnnualImpact(a), 0)}
            userTier={userTier}
          />

          {/* Action Items — preserves existing task logic; visuals simplified */}
          {pendingTasks.length > 0 && (
            <div className="card">
              <h3 style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Clock className="h-4 w-4" /> Action items <span className="count-tag">{pendingTasks.length}</span>
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['all', 'disputes', 'deals', 'subscriptions'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setTaskFilter(f)}
                      className={`f-chip${taskFilter === f ? ' on' : ''}`}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {pendingTasks
                  .filter((t) => !((t.provider_name || '').toLowerCase().includes('paybacker')))
                  .slice(0, showAllTasks ? 50 : 5)
                  .map((task, i) => {
                    const parsedDesc = (() => {
                      try {
                        return JSON.parse(task.description || '{}');
                      } catch {
                        return null;
                      }
                    })();
                    const descText = parsedDesc?.description || task.description || '';
                    const provider = cleanMerchantName(task.provider_name || parsedDesc?.provider || '');
                    const amount = task.disputed_amount || parsedDesc?.amount || '';
                    const type = parsedDesc?.type || task.type || '';
                    const complaintParams = new URLSearchParams();
                    if (provider) complaintParams.set('company', provider);
                    if (descText && descText.length < 500) complaintParams.set('issue', descText);
                    if (amount) complaintParams.set('amount', String(amount));
                    complaintParams.set('new', '1');
                    return (
                      <div
                        key={task.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '12px 0',
                          borderTop: i ? '1px solid var(--divider-2)' : '0',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{task.title}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.35, marginTop: 2 }}>
                            {provider ? `${provider} · ` : ''}
                            {(type || 'review').replace(/_/g, ' ')}
                            {amount && Number(amount) > 0 ? ` · ${formatGBP(parseFloat(String(amount)))}` : ''}
                          </div>
                        </div>
                        <Link
                          href={`/dashboard/complaints?${complaintParams.toString()}`}
                          className="cta"
                          style={{ fontSize: 11.5, padding: '6px 10px' }}
                        >
                          Start →
                        </Link>
                        <button
                          onClick={async () => {
                            await supabase
                              .from('tasks')
                              .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
                              .eq('id', task.id);
                            setPendingTasks((prev) => prev.filter((t) => t.id !== task.id));
                          }}
                          style={{
                            background: 'transparent',
                            border: 0,
                            color: 'var(--text-3)',
                            cursor: 'pointer',
                            fontSize: 11.5,
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    );
                  })}
              </div>
              {pendingTasks.length > 5 && (
                <button
                  onClick={() => setShowAllTasks((v) => !v)}
                  style={{
                    width: '100%',
                    marginTop: 8,
                    background: 'transparent',
                    border: 0,
                    color: 'var(--mint-deep)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 8,
                  }}
                >
                  {showAllTasks ? 'Show less' : `Show all ${pendingTasks.length} items`}
                </button>
              )}
            </div>
          )}

          {/* Quick actions — simplified 3 tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Link href="/dashboard/complaints" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h3><FileText className="h-4 w-4" style={{ color: 'var(--mint-deep)' }} /> Write a letter</h3>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>
                Generate a formal letter citing UK consumer law. Bills, broadband, debt, refunds.
              </p>
            </Link>
            <Link href="/dashboard/subscriptions" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h3><CreditCard className="h-4 w-4" style={{ color: 'var(--mint-deep)' }} /> Track subs</h3>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>
                Every subscription in one place. Sync from your bank or add manually.
              </p>
            </Link>
            <Link href="/dashboard/deals" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h3><Tag className="h-4 w-4" style={{ color: 'var(--mint-deep)' }} /> Browse deals</h3>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>
                Compare energy, broadband, mobile, insurance. Find cheaper alternatives.
              </p>
            </Link>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Connections */}
          <div className="card">
            <h3 style={{ justifyContent: 'space-between' }}>
              <span>Connections</span>
              <button
                onClick={() => setConnectionsCollapsed((v) => !v)}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  padding: 0,
                }}
                aria-label={connectionsCollapsed ? 'Expand' : 'Collapse'}
              >
                {connectionsCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
            </h3>
            {!connectionsCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, fontSize: 12.5 }}>
                {bankAccounts.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '6px 0 10px' }}>
                    No bank account connected.
                  </div>
                ) : (
                  bankAccounts.map((b) => {
                    const active = b.status === 'active';
                    return (
                      <div
                        key={b.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: '1px solid var(--divider-2)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Building2
                            className="h-3.5 w-3.5"
                            style={{ color: active ? 'var(--mint-deep)' : 'var(--orange-deep)', flexShrink: 0 }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.bank_name || 'Bank'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span className={`pill ${active ? 'grn' : 'amb'}`}>
                            {active ? 'Synced' : 'Reconnect'}
                          </span>
                          <button
                            onClick={() => disconnectBank(b.id, b.bank_name || 'Bank')}
                            disabled={disconnectingId === b.id}
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--text-3)',
                              cursor: 'pointer',
                              padding: 2,
                            }}
                            title="Disconnect"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
                {emailAccounts.length === 0 && !emailConnected ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '6px 0 10px' }}>
                    No email connected.
                  </div>
                ) : (
                  (emailAccounts.length > 0
                    ? emailAccounts
                    : emailConnected && emailAddress
                    ? [{ id: 'gmail', email_address: emailAddress, provider_type: 'google' }]
                    : []
                  ).map((e) => (
                    <div
                      key={e.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid var(--divider-2)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Mail
                          className="h-3.5 w-3.5"
                          style={{ color: 'var(--mint-deep)', flexShrink: 0 }}
                        />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 180,
                          }}
                          title={e.email_address}
                        >
                          {e.email_address}
                        </span>
                      </div>
                      <span className="pill grn">Live</span>
                    </div>
                  ))
                )}
                <div style={{ display: 'flex', gap: 6, paddingTop: 10 }}>
                  <button
                    onClick={() => {
                      if (!connectBankDirect()) setShowBankPicker(true);
                    }}
                    className="cta-ghost"
                    style={{ fontSize: 11.5, padding: '6px 10px', flex: 1, justifyContent: 'center' }}
                  >
                    <Building2 className="h-3 w-3" /> Bank
                  </button>
                  <Link
                    href="/dashboard/profile?connect_email=true"
                    className="cta-ghost"
                    style={{ fontSize: 11.5, padding: '6px 10px', flex: 1, justifyContent: 'center' }}
                  >
                    <Mail className="h-3 w-3" /> Email
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Pocket Agent */}
          <div className="card">
            <h3>Pocket Agent</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 10px', lineHeight: 1.45 }}>
              Chat on Telegram. Ask about your subs, dispute status, or start a new letter.
            </p>
            <a
              className="cta-ghost"
              href="https://t.me/PaybackerCoUkBot"
              target="_blank"
              rel="noopener noreferrer"
              style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
            >
              Open @PaybackerCoUkBot →
            </a>
          </div>

          {/* Getting started — only while incomplete */}
          {!(bankConnected && emailConnected && complaintsGenerated > 0) && (
            <div
              className="card"
              style={{
                background: 'linear-gradient(135deg, var(--mint-wash), var(--amber-wash))',
                border: '1px solid #FDE68A',
              }}
            >
              <h3>
                <Sparkles className="h-4 w-4" style={{ color: 'var(--mint-deep)' }} /> Get the most out of Paybacker
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                <ChecklistRow
                  done={bankConnected && bankAccounts.some((b) => b.status === 'active')}
                  label="Connect a bank"
                  action={
                    !bankConnected || !bankAccounts.some((b) => b.status === 'active') ? (
                      <button
                        onClick={() => {
                          if (!connectBankDirect()) setShowBankPicker(true);
                        }}
                        style={{
                          background: 'transparent',
                          border: 0,
                          color: 'var(--mint-deep)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Connect →
                      </button>
                    ) : null
                  }
                />
                <ChecklistRow
                  done={emailConnected}
                  label="Connect an email"
                  action={
                    !emailConnected ? (
                      <Link
                        href="/dashboard/profile?connect_email=true"
                        style={{
                          color: 'var(--mint-deep)',
                          fontWeight: 600,
                          fontSize: 12,
                          textDecoration: 'none',
                        }}
                      >
                        Connect →
                      </Link>
                    ) : null
                  }
                />
                <ChecklistRow
                  done={complaintsGenerated > 0}
                  label="Write your first letter"
                  action={
                    complaintsGenerated === 0 ? (
                      <Link
                        href="/dashboard/complaints"
                        style={{
                          color: 'var(--mint-deep)',
                          fontWeight: 600,
                          fontSize: 12,
                          textDecoration: 'none',
                        }}
                      >
                        Start →
                      </Link>
                    ) : null
                  }
                />
              </div>
            </div>
          )}

          {/* Expiring contracts */}
          {expiringContracts > 0 && (
            <div className="card" style={{ borderColor: '#FCD34D', background: 'var(--amber-wash)' }}>
              <h3 style={{ color: 'var(--orange-deep)' }}>
                <AlertTriangle className="h-4 w-4" /> Expiring soon
              </h3>
              <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-2)' }}>
                {expiringContracts} contract{expiringContracts > 1 ? 's' : ''} ending within 30 days. Review before they auto-renew at a higher rate.
              </p>
              <Link
                href="/dashboard/contracts"
                className="cta-ghost"
                style={{ fontSize: 12, width: '100%', justifyContent: 'center' }}
              >
                View contracts →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: toast.type === 'success' ? 'var(--mint-deep)' : toast.type === 'error' ? 'var(--rose-deep)' : 'var(--ink)',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 60,
            boxShadow: '0 10px 30px -10px rgba(0,0,0,0.25)',
          }}
        >
          {toast.message}
        </div>
      )}

      <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />
    </div>
  );
}
