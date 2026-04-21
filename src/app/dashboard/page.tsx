'use client';


import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import UpgradePrompt from '@/components/UpgradePrompt';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import UpgradeTrigger from '@/components/UpgradeTrigger';
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
import { cleanMerchantName } from '@/lib/merchant-utils';
import BankPickerModal, { connectBankDirect } from '@/components/BankPickerModal';
import { calculateTotalSavings, parseComparisonDeals } from '@/lib/savings-utils';

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
            const shouldRefresh = compared === 0 || filteredCount === 0 || (compared > 0 && filteredCount < compared * 0.5) || (compared > 20 && filteredSaving < 500);
            if (shouldRefresh) {
              const r = await fetch('/api/subscriptions/compare', { method: 'POST' });
              if (r.ok) {
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
        // Filter out finance payments and deduplicate — match subscriptions page logic
        const DEBT_KW = ['mortgage', 'loan', 'finance', 'lendinvest', 'skipton', 'santander loan', 'natwest loan', 'novuna', 'ca auto', 'auto finance', 'funding circle', 'zopa'];
        const CREDIT_KW = ['barclaycard', 'mbna', 'halifax credit', 'hsbc bank visa', 'virgin money', 'capital one', 'american express', 'amex', 'securepay', 'credit card'];
        const isFinance = (name: string) => {
          const l = name.toLowerCase();
          return DEBT_KW.some(kw => l.includes(kw)) || CREDIT_KW.some(kw => l.includes(kw));
        };
        const filteredSubs = subsList.filter(s => !isFinance(s.provider_name));
        const seenNames = new Map<string, boolean>();
        const dedupedSubs = filteredSubs.filter(s => {
          const normName = cleanMerchantName(s.provider_name).toLowerCase();
          // Include amount band so two separate bills at the same provider but
          // different amounts (e.g. two council-tax DDs) count as distinct.
          const band = Math.round(Math.log(Math.max(Math.abs(parseFloat(String(s.amount)) || 0), 0.01)) / Math.log(1.1));
          const key = `${normName}|${band}`;
          if (seenNames.has(key)) return false;
          seenNames.set(key, true);
          return true;
        });
        setSubscriptionCount(dedupedSubs.length);
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

  const handleEmailScan = async () => {
    setEmailScanning(true);
    try {
      const res = await fetch('/api/gmail/scan', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        // Don't clear existing results on error
        if (emailOpportunities.length === 0) setEmailScanResults(0);
      } else if (data.opportunities && data.opportunities.length > 0) {
        // Reload from centralised email_scan_findings table so we stay in sync with scanner page
        const { data: scanFindings } = await supabase
          .from('email_scan_findings')
          .select('*')
          .eq('user_id', (await supabase.auth.getUser()).data.user!.id)
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
        }
      } else {
        if (emailOpportunities.length === 0) setEmailScanResults(0);
      }
    } catch {
      if (emailOpportunities.length === 0) setEmailScanResults(0);
    } finally {
      setEmailScanning(false);
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {userTier === 'free' && <UpgradePrompt variant="banner" />}
      {syncMessage && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm font-medium flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {syncMessage}
        </div>
      )}

      {/* Trial expiry banner */}
      {trialExpired && (
        <div className="mb-6 bg-brand-400/10 border border-brand-400/30 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-sm">Your free Pro trial has ended</p>
            <p className="text-slate-400 text-xs mt-1">Upgrade to keep unlimited letters, daily bank sync, spending intelligence, and all Pro features. All your data is safe.</p>
          </div>
          <Link href="/pricing" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-5 py-2.5 rounded-xl transition-all text-sm whitespace-nowrap ml-4">
            Upgrade Now
          </Link>
        </div>
      )}

      {trialDaysLeft !== null && trialDaysLeft <= 7 && (
        <div className="mb-6 bg-mint-400/10 border border-mint-400/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-mint-400" />
            <p className="text-white text-sm">
              Pro trial ends in <span className="text-mint-400 font-semibold">{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</span>. Upgrade to keep all features.
            </p>
          </div>
          <Link href="/pricing" className="text-mint-400 hover:text-mint-300 text-sm font-medium whitespace-nowrap ml-4">
            View Plans
          </Link>
        </div>
      )}

      {/* Onboarding flow — value-first, shows right card at right time */}
      <OnboardingFlow
        hasLetter={complaintsGenerated > 0}
        bankConnected={bankConnected}
        subscriptionCount={subscriptionCount}
        tier={userTier}
      />

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Overview</h1>
        <p className="text-slate-400">Your financial snapshot and quick actions</p>
      </div>

      {/* Potential Savings Hero */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-8 shadow-[--shadow-card]">
        <div className="flex items-center gap-2 mb-2">
          <PiggyBank className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Potential Savings Found</h2>
        </div>
        <p className="text-4xl md:text-5xl font-bold text-emerald-400 font-[family-name:var(--font-heading)] mb-1">
          {formatGBP(potentialSavings)}<span className="text-2xl font-normal text-emerald-400/70">/yr</span>
        </p>
        <p className="text-slate-400 text-sm mb-6">
          Based on cheaper subscription alternatives and price increase alerts we&apos;ve detected
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {(() => {
            const alertTotal = priceAlerts.reduce((sum, a) => {
              const diff = (parseFloat(a.new_amount) || 0) - (parseFloat(a.old_amount) || 0);
              return sum + (diff > 0 ? diff * 12 : (parseFloat(a.annual_impact) || 0));
            }, 0);
            if (alertTotal <= 0) return null;
            return (
              <button
                onClick={() => document.getElementById('price-alerts')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-3 bg-slate-700/50 hover:bg-slate-700/80 border border-slate-600/50 rounded-xl p-3 text-left transition-all"
              >
                <div className="bg-red-500/10 p-2 rounded-lg text-red-400 h-10 w-10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-white font-semibold">{formatGBP(alertTotal)}/yr</p>
                  <p className="text-slate-400 text-xs">Price increase alerts</p>
                </div>
              </button>
            );
          })()}

          <Link href="/dashboard/deals" className="flex items-center gap-3 bg-slate-700/50 hover:bg-slate-700/80 border border-slate-600/50 rounded-xl p-3 transition-all">
            <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-400 h-10 w-10 flex items-center justify-center shrink-0">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-white font-semibold">{formatGBP(comparisonSaving)}/yr</p>
              <p className="text-slate-400 text-xs">from {comparisonCount} deals</p>
            </div>
          </Link>

          <Link href="/dashboard/complaints" className="flex items-center gap-3 bg-slate-700/50 hover:bg-slate-700/80 border border-slate-600/50 rounded-xl p-3 transition-all">
            <div className="bg-blue-500/10 p-2 rounded-lg text-blue-400 h-10 w-10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-white font-semibold">{complaintsGenerated} disputes</p>
              <p className="text-slate-400 text-xs">Filed</p>
            </div>
          </Link>
        </div>

        <div className="flex">
          <Link href="/dashboard/subscriptions" className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-6 py-3 rounded-xl transition-all flex items-center justify-center gap-2">
            Review Your Subscriptions <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Savings Opportunity Widget */}
      {dealsLoading ? <SavingsSkeleton /> : <SavingsOpportunityWidget totalSaving={comparisonSaving} count={comparisonCount} deals={comparisonDeals} />}

      {/* Price Increase Alerts */}
      {priceAlerts.length > 0 && (
        <div id="price-alerts" className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 font-[family-name:var(--font-heading)]">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Price Increase Alerts ({priceAlerts.length})
          </h2>
          <div className="space-y-3">
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
                  setPriceAlerts(prev => prev.filter(a => a.id !== id));
                }}
                onAction={async (id) => {
                  await fetch('/api/price-alerts', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, status: 'actioned' }),
                  });
                  setPriceAlerts(prev => prev.filter(a => a.id !== id));
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Link href="/dashboard/subscriptions" className="block bg-navy-900 border border-navy-700/50 rounded-2xl p-5 shadow-[--shadow-card] hover:border-mint-400/30 transition-all">
          <CreditCard className="h-6 w-6 text-mint-400 mb-3" />
          <p className="text-3xl font-bold text-white">{spendBreakdown?.subscriptions_count || subscriptionCount}</p>
          <p className="text-slate-400 text-sm">Subscriptions & bills</p>
        </Link>
        <Link href="/dashboard/subscriptions" className="block bg-navy-900 border border-navy-700/50 rounded-2xl p-5 shadow-[--shadow-card] hover:border-mint-400/30 transition-all">
          <BarChart3 className="h-6 w-6 text-red-400 mb-3" />
          <p className="text-3xl font-bold text-white">{formatGBP(monthlySpend)}</p>
          <p className="text-slate-400 text-sm">Subscriptions & bills</p>
          {spendBreakdown && (spendBreakdown.mortgages_monthly > 0 || spendBreakdown.loans_monthly > 0 || spendBreakdown.council_tax_monthly > 0) && (
            <p className="text-slate-500 text-xs mt-1 truncate">
              + {formatGBP(spendBreakdown.mortgages_monthly + spendBreakdown.loans_monthly + spendBreakdown.council_tax_monthly)} in mortgages, loans & tax
            </p>
          )}
        </Link>
        <Link href="/dashboard/complaints" className="block bg-navy-900 border border-navy-700/50 rounded-2xl p-5 shadow-[--shadow-card] hover:border-mint-400/30 transition-all">
          <FileText className="h-6 w-6 text-blue-400 mb-3" />
          <p className="text-3xl font-bold text-white">{complaintsGenerated}</p>
          <p className="text-slate-400 text-sm">Disputes</p>
        </Link>
        <Link href="/dashboard/subscriptions" className="block bg-navy-900 border border-navy-700/50 rounded-2xl p-5 shadow-[--shadow-card] hover:border-mint-400/30 transition-all">
          <Building2 className="h-6 w-6 text-green-400 mb-3" />
          <p className="text-3xl font-bold text-white">{bankConnected ? (bankAccounts.some(b => b.status === 'active') ? 'Connected' : 'Expired') : 'Not set up'}</p>
          <p className="text-slate-400 text-sm">Bank account{bankConnected && !bankAccounts.some(b => b.status === 'active') ? ' · needs reconnect' : ''}</p>
        </Link>
      </div>

      {/* Getting Started — connection status & CTAs */}
      {!(bankConnected && emailConnected && complaintsGenerated > 0) && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-mint-400" />
            <h2 className="text-white font-semibold text-lg">Get the most from Paybacker</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Bank Account */}
            {(() => {
              const hasActive = bankAccounts.some(b => b.status === 'active');
              const hasExpired = bankConnected && !hasActive;
              const borderClass = hasActive ? 'border-green-500/30 bg-green-500/5' : hasExpired ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-500/30 bg-amber-500/5';
              return (
            <div className={`rounded-xl border p-4 ${borderClass}`}>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-5 w-5 text-slate-300" />
                <span className="text-white font-medium text-sm">Bank Account</span>
              </div>
              <div className="flex items-center gap-1.5 mb-3">
                {hasActive ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 text-sm">Connected</span>
                  </>
                ) : hasExpired ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-amber-400 text-sm">Needs reconnect</span>
                  </>
                ) : (
                  <span className="text-amber-400 text-sm">Not connected</span>
                )}
              </div>
              {hasActive ? (
                <button
                  onClick={async () => {
                    setBankSyncing(true);
                    try {
                      await fetch('/api/bank/sync-now', { method: 'POST' });
                    } catch {}
                    setBankSyncing(false);
                  }}
                  disabled={bankSyncing}
                  className="flex items-center gap-1.5 bg-navy-800 hover:bg-navy-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition-all text-sm w-full justify-center"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${bankSyncing ? 'animate-spin' : ''}`} />
                  {bankSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              ) : (
                <button
                  onClick={() => { if (!connectBankDirect()) setShowBankPicker(true); }}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold px-3 py-1.5 rounded-lg transition-all text-sm w-full justify-center"
                >
                  {hasExpired ? 'Reconnect Bank' : 'Connect Bank'}
                </button>
              )}
            </div>
              );
            })()}

            {/* Email Inbox */}
            <div className={`rounded-xl border p-4 ${emailConnected ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-5 w-5 text-slate-300" />
                <span className="text-white font-medium text-sm">Email Inbox</span>
              </div>
              <div className="flex items-center gap-1.5 mb-3">
                {emailConnected ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 text-sm">Connected</span>
                  </>
                ) : (
                  <span className="text-amber-400 text-sm">Not connected</span>
                )}
              </div>
              {emailConnected ? (
                <button
                  onClick={handleEmailScan}
                  disabled={emailScanning}
                  className="flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-lg transition-all text-sm w-full justify-center bg-navy-800 hover:bg-navy-700 disabled:opacity-50 text-white"
                >
                  {emailScanning ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning...</> : 'Scan Inbox'}
                </button>
              ) : (
                <Link
                  href="/dashboard/profile?connect_email=true"
                  className="flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-lg transition-all text-sm w-full justify-center bg-mint-400 hover:bg-mint-500 text-navy-950"
                >
                  Connect Email
                </Link>
              )}
            </div>

            {/* First Letter */}
            <div className={`rounded-xl border p-4 ${complaintsGenerated > 0 ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-slate-300" />
                <span className="text-white font-medium text-sm">First Letter</span>
              </div>
              <div className="flex items-center gap-1.5 mb-3">
                {complaintsGenerated > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 text-sm">{complaintsGenerated} written</span>
                  </>
                ) : (
                  <span className="text-amber-400 text-sm">None yet</span>
                )}
              </div>
              <Link
                href="/dashboard/complaints"
                className={`flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-lg transition-all text-sm w-full justify-center ${
                  complaintsGenerated > 0
                    ? 'bg-navy-800 hover:bg-navy-700 text-white font-medium'
                    : 'bg-mint-400 hover:bg-mint-500 text-navy-950'
                }`}
              >
                Write Letter
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Your Connections — collapsible */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl shadow-[--shadow-card] p-6 mb-8">
        <button
          onClick={() => setConnectionsCollapsed(!connectionsCollapsed)}
          className="flex items-center justify-between w-full text-left"
        >
          <h2 className="text-white font-semibold text-lg">Your Connections</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {bankAccounts.reduce((c, b) => c + (b.account_display_names?.length || 1), 0)} bank{bankAccounts.reduce((c, b) => c + (b.account_display_names?.length || 1), 0) !== 1 ? 's' : ''}, {emailAccounts.length} email{emailAccounts.length !== 1 ? 's' : ''}
            </span>
            {connectionsCollapsed ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />}
          </div>
        </button>
        {!connectionsCollapsed && <div className="space-y-3 mt-4">
          {/* Bank accounts */}
          {bankAccounts.length > 0 ? (
            bankAccounts.map(b => {
              const isActive = b.status === 'active';
              const statusLabel = isActive ? 'Active' : 'Expired';
              const statusClass = isActive ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
              return (
              (b.account_display_names && b.account_display_names.length > 0)
                ? b.account_display_names.map((name, i) => (
                  <div key={`${b.id}-${i}`} className="flex items-center justify-between p-3 bg-navy-950/50 rounded-lg border border-navy-700/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{b.bank_name || 'Bank'} · {name}</p>
                        <p className="text-slate-500 text-xs">Bank account</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isActive && <button onClick={() => { if (!connectBankDirect()) setShowBankPicker(true); }} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Reconnect</button>}
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusClass}`}>{statusLabel}</span>
                      <button onClick={() => disconnectBank(b.id, b.bank_name || 'Bank')} disabled={disconnectingId === b.id} className="text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-1" title="Disconnect this bank">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
                : (
                  <div key={b.id} className="flex items-center justify-between p-3 bg-navy-950/50 rounded-lg border border-navy-700/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{b.bank_name || 'Bank Account'}</p>
                        <p className="text-slate-500 text-xs">Bank account</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isActive && <button onClick={() => { if (!connectBankDirect()) setShowBankPicker(true); }} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Reconnect</button>}
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusClass}`}>{statusLabel}</span>
                      <button onClick={() => disconnectBank(b.id, b.bank_name || 'Bank')} disabled={disconnectingId === b.id} className="text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-1" title="Disconnect this bank">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              );
            })
          ) : (
            <div className="flex items-center justify-between p-3 bg-navy-950/50 rounded-lg border border-navy-700/30 border-dashed">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-blue-400" />
                </div>
                <p className="text-slate-400 text-sm">No bank account connected</p>
              </div>
            </div>
          )}

          {/* Email accounts */}
          {emailAccounts.length > 0 ? (
            emailAccounts.map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-navy-950/50 rounded-lg border border-navy-700/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                    <Mail className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{e.email_address}</p>
                    <p className="text-slate-500 text-xs">{e.provider_type || 'Email'} account</p>
                  </div>
                </div>
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">Active</span>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-between p-3 bg-navy-950/50 rounded-lg border border-navy-700/30 border-dashed">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                  <Mail className="h-4 w-4 text-purple-400" />
                </div>
                <p className="text-slate-400 text-sm">No email connected</p>
              </div>
            </div>
          )}

          {/* Add connection buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { if (!connectBankDirect()) setShowBankPicker(true); }}
              className="flex items-center gap-1.5 text-sm text-mint-400 bg-mint-400/10 px-3 py-1.5 rounded-lg border border-mint-400/30 hover:bg-mint-400/20 transition-all"
            >
              <Building2 className="h-3.5 w-3.5" />
              Add Bank Account
            </button>
            <Link
              href="/dashboard/profile?connect_email=true"
              className="flex items-center gap-1.5 text-sm text-purple-400 bg-purple-500/10 px-3 py-1.5 rounded-lg border border-purple-500/30 hover:bg-purple-500/20 transition-all"
            >
              <Mail className="h-3.5 w-3.5" />
              Add Email
            </Link>
          </div>
        </div>}
      </div>

      {/* Alerts */}
      {expiringContracts > 0 && (
        <div className="bg-mint-400/10 border border-mint-400/20 rounded-2xl p-5 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-mint-400" />
            <div>
              <p className="text-white font-semibold text-sm">{expiringContracts} contract{expiringContracts > 1 ? 's' : ''} expiring within 30 days</p>
              <p className="text-slate-400 text-xs">Review these before they auto-renew at a higher rate</p>
            </div>
          </div>
          <Link href="/dashboard/contracts" className="text-mint-400 hover:text-mint-300 text-sm font-medium flex items-center gap-1">
            View <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}


      {/* Email Scan Card */}
      {emailConnected ? (
        <div className="mb-6">
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-purple-400" />
              <div>
                <p className="text-white font-semibold text-sm">
                  {emailScanning ? 'Scanning your emails...' : 'Email Scanner'}
                </p>
                <p className="text-slate-400 text-xs">
                  {emailScanResults !== null
                    ? `Found ${emailScanResults} opportunities`
                    : emailAddress
                      ? `Connected: ${emailAddress}${emailLastScanned ? ` \u00b7 Last scanned: ${new Date(emailLastScanned).toLocaleDateString()}` : ''}`
                      : 'Scan your inbox to find bills, overcharges & savings'}
                </p>
              </div>
            </div>
            <button
              onClick={handleEmailScan}
              disabled={emailScanning}
              className="bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap ml-4"
            >
              {emailScanning ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Scanning...</>
              ) : (
                <><ScanSearch className="h-4 w-4" /> Scan Emails</>
              )}
            </button>
          </div>

          {/* Scan Results */}
          {emailOpportunities.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-white font-semibold text-sm px-1">{emailOpportunities.length} opportunities found</p>
              {emailOpportunities.map((opp: any, i: number) => {
                const actionLabel: Record<string, { text: string; color: string }> = {
                  track: { text: 'Track', color: 'bg-blue-600 hover:bg-blue-700' },
                  cancel: { text: 'Cancel', color: 'bg-red-600 hover:bg-red-700' },
                  switch_deal: { text: 'Find Deal', color: 'bg-emerald-600 hover:bg-emerald-700' },
                  dispute: { text: 'Dispute', color: 'bg-orange-600 hover:bg-orange-700' },
                  claim_compensation: { text: 'Claim', color: 'bg-green-600 hover:bg-green-700' },
                  claim_refund: { text: 'Claim Refund', color: 'bg-green-600 hover:bg-green-700' },
                  monitor: { text: 'Monitor', color: 'bg-navy-700 hover:bg-navy-600' },
                };
                const action = actionLabel[opp.suggestedAction] || actionLabel.track;
                // Determine action based on opportunity type for better routing
                const effectiveAction = (() => {
                  if (opp.suggestedAction === 'switch_deal' || ['utility_bill', 'renewal', 'insurance', 'insurance_renewal', 'deal_expiry', 'bill'].includes(opp.type)) {
                    return { text: 'Find Deal', color: 'bg-mint-400 hover:bg-mint-500 text-navy-950' };
                  }
                  if (['overcharge', 'price_increase', 'debt_dispute', 'dd_advance_notice'].includes(opp.type) || opp.suggestedAction === 'dispute') {
                    return { text: 'Dispute', color: 'bg-red-500 hover:bg-red-600' };
                  }
                  if (opp.type === 'flight_delay' || opp.suggestedAction === 'claim_compensation') {
                    return { text: 'Claim £520', color: 'bg-sky-500 hover:bg-sky-600' };
                  }
                  if (opp.type === 'refund_opportunity' || opp.suggestedAction === 'claim_refund') {
                    return { text: 'Claim Refund', color: 'bg-green-600 hover:bg-green-700' };
                  }
                  if (['subscription', 'forgotten_subscription'].includes(opp.type)) {
                    return { text: 'Track', color: 'bg-blue-600 hover:bg-blue-700' };
                  }
                  return action;
                })();
                const typeColors: Record<string, string> = {
                  subscription: 'text-blue-400 bg-blue-500/10',
                  renewal: 'text-amber-400 bg-amber-500/10',
                  price_increase: 'text-orange-400 bg-orange-500/10',
                  overcharge: 'text-red-400 bg-red-500/10',
                  utility_bill: 'text-cyan-400 bg-cyan-500/10',
                  bill: 'text-cyan-400 bg-cyan-500/10',
                  flight_delay: 'text-sky-400 bg-sky-500/10',
                  forgotten_subscription: 'text-purple-400 bg-purple-500/10',
                  insurance: 'text-emerald-400 bg-emerald-500/10',
                  insurance_renewal: 'text-emerald-400 bg-emerald-500/10',
                  refund_opportunity: 'text-green-400 bg-green-500/10',
                  loan: 'text-violet-400 bg-violet-500/10',
                  deal_expiry: 'text-amber-400 bg-amber-500/10',
                  dd_advance_notice: 'text-blue-400 bg-blue-500/10',
                  tax_rebate: 'text-purple-400 bg-purple-500/10',
                  government: 'text-purple-400 bg-purple-500/10',
                };
                const typeColor = typeColors[opp.type] || 'text-slate-400 bg-slate-500/10';
                return (
                  <div key={opp.id || i} className="bg-navy-900 border border-navy-700/50 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-medium text-sm">{opp.title}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${typeColor}`}>
                            {(opp.type || 'opportunity').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs">{opp.provider}{opp.category ? ` · ${opp.category}` : ''}{opp.paymentFrequency ? ` · ${opp.paymentFrequency}` : ''}</p>
                        <p className="text-slate-400 text-xs mt-1 line-clamp-2">{opp.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          className={`${effectiveAction.color} text-white text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-all`}
                          onClick={() => {
                            if (opp.suggestedAction === 'switch_deal' || ['utility_bill', 'renewal', 'insurance', 'insurance_renewal', 'deal_expiry', 'bill'].includes(opp.type)) {
                              const params = new URLSearchParams();
                              if (opp.category) params.set('category', opp.category);
                              if (opp.provider) params.set('provider', opp.provider);
                              window.location.href = `/dashboard/deals?${params}`;
                            } else if (['overcharge', 'price_increase', 'debt_dispute', 'dd_advance_notice'].includes(opp.type) || opp.suggestedAction === 'dispute' || opp.suggestedAction === 'claim_compensation' || opp.suggestedAction === 'claim_refund') {
                              const params = new URLSearchParams({
                                company: opp.provider || '',
                                issue: opp.description || '',
                                amount: opp.amount > 0 ? String(opp.amount) : '',
                                new: '1',
                              });
                              window.location.href = `/dashboard/complaints?${params}`;
                            } else if (opp.type === 'flight_delay') {
                              const params = new URLSearchParams({
                                company: opp.provider || '',
                                issue: opp.description || '',
                                amount: '520',
                                type: 'flight_compensation',
                                new: '1',
                              });
                              window.location.href = `/dashboard/complaints?${params}`;
                            } else {
                              const params = new URLSearchParams({
                                new: '1',
                                provider: opp.provider || '',
                                amount: opp.paymentAmount || opp.amount || '',
                                taskId: opp.id || ''
                              });
                              window.location.href = `/dashboard/subscriptions?${params}`;
                            }
                          }}
                        >
                          {effectiveAction.text}
                        </button>
                        <button
                          onClick={async () => {
                            setEmailOpportunities(prev => prev.filter((o: any) => o.id !== opp.id));
                            setEmailScanResults(prev => prev !== null ? prev - 1 : null);
                            try {
                              await supabase.from('email_scan_findings').update({ status: 'dismissed' }).eq('id', opp.id);
                              await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', opp.id);
                            } catch {}
                          }}
                          className="text-slate-500 hover:text-slate-300 text-xs transition-all px-1.5 py-1.5"
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-5 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-white font-semibold text-sm">Scan your emails for savings</p>
              <p className="text-slate-400 text-xs">Connect your email to find hidden bills, overcharges, and money-saving opportunities</p>
            </div>
          </div>
          <Link href="/dashboard/profile?connect_email=true" className="text-purple-400 hover:text-purple-300 text-sm font-medium flex items-center gap-1 whitespace-nowrap ml-4">
            Connect Email <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Upgrade trigger: price increases detected */}
      <UpgradeTrigger
        type="price_increase"
        priceIncreaseCount={priceAlerts.length}
        priceIncreaseAnnual={priceAlerts.reduce((sum, a) => {
          const diff = (parseFloat(a.new_amount) || 0) - (parseFloat(a.old_amount) || 0);
          return sum + (diff > 0 ? diff * 12 : (parseFloat(a.annual_impact) || 0));
        }, 0)}
        userTier={userTier}
        className="mb-6"
      />

      {/* Action Items */}
      {(() => {
        if (pendingTasks.length === 0) return null;

        const processedTasks = pendingTasks.map((task) => {
          const parsedDesc = (() => { try { return JSON.parse(task.description || '{}'); } catch { return null; } })();
          const oppType = parsedDesc?.type || '';
          const descText = parsedDesc?.description || task.description || '';
          const descLower = descText.toLowerCase();
          const rawProvider = task.provider_name || parsedDesc?.provider || '';
          const provider = cleanMerchantName(rawProvider);
          const amount = task.disputed_amount || parsedDesc?.amount || parsedDesc?.paymentAmount || '';

          const isSubscription = oppType === 'subscription' || oppType === 'forgotten_subscription' || descLower.includes('subscription') || descLower.includes('direct debit') || descLower.includes('recurring');
          const isOvercharge = ['overcharge', 'price_increase', 'utility_bill', 'refund_opportunity'].includes(oppType) || descLower.includes('overcharg') || descLower.includes('refund');
          const isRenewal = oppType === 'renewal' || oppType === 'deal_expiry' || descLower.includes('renewal') || descLower.includes('contract end') || descLower.includes('expir') || descLower.includes('deal end');
          const isFlightDelay = oppType === 'flight_delay' || descLower.includes('flight') || descLower.includes('delay') || descLower.includes('eu261') || descLower.includes('uk261');
          const isDebt = descLower.includes('debt') || descLower.includes('collection') || descLower.includes('bailiff');
          const isAdmin = oppType === 'admin_task' || descLower.includes('confirmation statement') || descLower.includes('companies house') || descLower.includes('hmrc') || descLower.includes('dvla');
          const isInsurance = oppType === 'insurance' || descLower.includes('insurance') || descLower.includes('claim');
          const isLoan = oppType === 'loan' || oppType === 'credit_card' || descLower.includes('loan') || descLower.includes('mortgage') || descLower.includes('credit card');
          const isUpcomingPayment = oppType === 'upcoming_payment';
          const isPriceIncrease = oppType === 'price_increase';

          // Extracted structured data from new scan format
          const contractEndDate = parsedDesc?.contractEndDate || null;
          const nextPaymentDate = parsedDesc?.nextPaymentDate || null;
          const paymentAmount = parsedDesc?.paymentAmount || null;
          const previousAmount = parsedDesc?.previousAmount || null;
          const priceChangeDate = parsedDesc?.priceChangeDate || null;
          const paymentFrequency = parsedDesc?.paymentFrequency || null;
          const urgency = parsedDesc?.urgency || null;
          
          const needsComplaint = isOvercharge || task.type === 'complaint_letter' || isDebt;
          const needsDeal = isRenewal || isInsurance;
          const needsSubscription = isSubscription;

          return { ...task, parsedDesc, oppType, descText, descLower, rawProvider, provider, amount, isSubscription, isOvercharge, isRenewal, isFlightDelay, isDebt, isAdmin, isInsurance, isLoan, isUpcomingPayment, isPriceIncrease, needsComplaint, needsDeal, needsSubscription, contractEndDate, nextPaymentDate, paymentAmount, previousAmount, priceChangeDate, paymentFrequency, urgency };
        });

        // Deduplicate tasks by provider+type combo (keep the first/highest priority)
        const seenKeys = new Set<string>();
        const dedupedTasks = processedTasks.filter((task) => {
          const key = `${(task.provider || '').toLowerCase()}::${task.oppType || task.type || ''}`;
          if (key !== '::' && seenKeys.has(key)) return false;
          if (key !== '::') seenKeys.add(key);
          return true;
        });

        let filtered = dedupedTasks.filter((task) => {
          if (task.needsSubscription && task.provider) {
             const existing = activeSubscriptions.some(sub =>
               (sub.provider_name || '').toLowerCase().includes(task.provider.toLowerCase()) ||
               task.provider.toLowerCase().includes((sub.provider_name || '').toLowerCase())
             );
             if (existing) return false;
          }
          return true;
        });
        if (taskFilter === 'disputes') filtered = filtered.filter(t => t.needsComplaint || t.isFlightDelay || t.isLoan);
        if (taskFilter === 'deals') filtered = filtered.filter(t => t.needsDeal);
        if (taskFilter === 'subscriptions') filtered = filtered.filter(t => t.needsSubscription);

        const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const urgencyScore: Record<string, number> = { immediate: 10, soon: 5, routine: 0 };
        filtered.sort((a, b) => {
          const aScore = (urgencyScore[a.urgency] || 0) + (priorityScore[a.priority] || 0);
          const bScore = (urgencyScore[b.urgency] || 0) + (priorityScore[b.priority] || 0);
          return bScore - aScore;
        });

        const displayTasks = showAllTasks ? filtered : filtered.slice(0, 5);

        return (
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2 font-[family-name:var(--font-heading)]">
                <Clock className="h-5 w-5 text-mint-400" />
                Your Action Items ({filtered.length})
              </h2>
              <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                {['all', 'disputes', 'deals', 'subscriptions'].map(f => (
                  <button
                    key={f}
                    onClick={() => setTaskFilter(f)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-all whitespace-nowrap capitalize ${taskFilter === f ? 'bg-mint-400 text-navy-950 font-semibold' : 'bg-navy-800 text-slate-400 hover:text-white'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {displayTasks.length === 0 ? (
              <div className="bg-navy-950/50 border border-dashed border-navy-700/50 rounded-xl p-6 text-center">
                <p className="text-slate-500 text-sm">No action items found for this filter.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayTasks.map((task) => {
                  const badge = task.isFlightDelay ? { text: 'Flight Compensation', color: 'bg-sky-500/10 text-sky-400' }
                    : task.needsComplaint ? { text: 'Dispute', color: 'bg-red-500/10 text-red-400' }
                    : task.needsDeal ? { text: 'Switch and Save', color: 'bg-mint-400/10 text-mint-400' }
                    : task.needsSubscription ? { text: 'Track Subscription', color: 'bg-blue-500/10 text-blue-400' }
                    : task.isLoan ? { text: 'Review Terms', color: 'bg-purple-500/10 text-purple-400' }
                    : task.isAdmin ? { text: 'Admin Task', color: 'bg-navy-700 text-slate-300' }
                    : { text: 'Review', color: 'bg-navy-700 text-slate-400' };

                  const isHighPriority = task.priority === 'high' || task.urgency === 'immediate';
                  const isSoon = task.urgency === 'soon';

                  const complaintParams = new URLSearchParams();
                  if (task.provider) complaintParams.set('company', task.provider);
                  if (task.descText && task.descText.length < 500) complaintParams.set('issue', task.descText);
                  if (task.amount) complaintParams.set('amount', String(task.amount));
                  complaintParams.set('new', '1');
                  const complaintUrl = `/dashboard/complaints?${complaintParams.toString()}`;

                  return (
                    <div key={task.id} className={`bg-navy-900 border rounded-xl p-4 transition-all ${isHighPriority ? 'border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.05)]' : isSoon ? 'border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'border-navy-700/50'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {task.urgency === 'immediate' && <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-semibold border border-red-500/20 uppercase tracking-widest"><AlertTriangle className="h-3 w-3" /> Urgent</span>}
                        {task.urgency === 'soon' && <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20 uppercase tracking-widest"><Clock className="h-3 w-3" /> Soon</span>}
                        {!task.urgency && isHighPriority && <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-semibold border border-amber-500/20 uppercase tracking-widest"><AlertTriangle className="h-3 w-3" /> Urgent</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>{badge.text}</span>
                        {task.provider && <span className="text-slate-500 text-xs">{cleanMerchantName(task.provider)}</span>}
                        {task.amount && Number(task.amount) > 0 && <span className="text-green-400 text-xs font-medium">{formatGBP(parseFloat(String(task.amount)))}</span>}
                      </div>
                      <p className="text-white text-sm font-medium">{task.title}</p>
                      <p className="text-slate-400 text-xs mt-1 line-clamp-2 first-letter:capitalize">{task.descText}</p>
                      {/* Extracted financial details from email scan */}
                      {(task.paymentAmount || task.contractEndDate || task.nextPaymentDate || task.priceChangeDate || task.previousAmount) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {task.paymentAmount != null && Number(task.paymentAmount) > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-navy-800 text-white font-medium">
                              £{Number(task.paymentAmount).toFixed(2)}{task.paymentFrequency ? `/${task.paymentFrequency === 'monthly' ? 'mo' : task.paymentFrequency === 'yearly' ? 'yr' : task.paymentFrequency === 'quarterly' ? 'qtr' : ''}` : ''}
                            </span>
                          )}
                          {task.previousAmount != null && task.paymentAmount != null && Number(task.previousAmount) > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
                              £{Number(task.previousAmount).toFixed(2)} → £{Number(task.paymentAmount).toFixed(2)}
                            </span>
                          )}
                          {task.contractEndDate && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                              ends {new Date(task.contractEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {task.nextPaymentDate && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
                              due {new Date(task.nextPaymentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {task.priceChangeDate && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400">
                              increase from {new Date(task.priceChangeDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-navy-700/50 flex-wrap">
                    {/* Context-aware primary action */}
                    {task.needsComplaint && (
                      <Link href={complaintUrl} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Start Dispute
                      </Link>
                    )}
                    {task.isFlightDelay && (
                      <Link href={`/dashboard/complaints?type=flight_compensation${task.provider ? `&company=${encodeURIComponent(task.provider)}` : ''}&new=1`} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Claim £520 Compensation
                      </Link>
                    )}
                    {task.needsDeal && (
                      <Link href="/dashboard/deals" className="bg-mint-400/10 hover:bg-mint-400/20 text-mint-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" /> Find Better Deal
                      </Link>
                    )}
                    {task.needsSubscription && (
                      <Link href={`/dashboard/subscriptions?new=1&provider=${encodeURIComponent(task.provider)}&amount=${task.amount || ''}&taskId=${task.id}`} className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> Track Subscription
                      </Link>
                    )}
                    {task.isLoan && (
                      <Link href="/dashboard/deals" className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" /> Review Terms
                      </Link>
                    )}
                    {task.isAdmin && !task.needsComplaint && !task.needsDeal && !task.needsSubscription && !task.isFlightDelay && !task.isLoan && (
                      <button
                        onClick={async () => {
                          await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);
                        }}
                        className="bg-navy-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Mark as Done
                      </button>
                    )}
                    {!task.needsComplaint && !task.needsDeal && !task.needsSubscription && !task.isFlightDelay && !task.isLoan && !task.isAdmin && (
                      <Link href={complaintUrl} className="bg-navy-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Start Dispute
                      </Link>
                    )}

                    <div className="flex-1" />

                    <button
                      onClick={async () => {
                        await supabase.from('tasks').update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('id', task.id);
                        setPendingTasks(prev => prev.filter(t => t.id !== task.id));
                      }}
                      className="text-slate-500 hover:text-slate-400 text-xs transition-all px-3 py-1.5"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                  );
                })}
              </div>
            )}
            {filtered.length > 5 && (
              <button
                onClick={() => setShowAllTasks(prev => !prev)}
                className="w-full mt-3 py-2 text-sm text-mint-400 hover:text-white bg-navy-900/50 hover:bg-navy-800 border border-navy-700/50 rounded-xl transition-all"
              >
                {showAllTasks ? `Show less` : `Show all ${filtered.length} items`}
              </button>
            )}
          </div>
        );
      })()}

      {/* Quick Actions */}
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 font-[family-name:var(--font-heading)]">
        <Sparkles className="h-5 w-5 text-mint-400" />
        Quick Actions
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link
          href="/dashboard/complaints"
          className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/50 transition-all group"
        >
          <FileText className="h-8 w-8 text-mint-400 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Write a Complaint Letter</h3>
          <p className="text-slate-400 text-sm">Generate a formal letter citing UK consumer law. Energy bills, broadband, debt, refunds, and more.</p>
          <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">Get started <ArrowRight className="h-3 w-3" /></span>
        </Link>

        <Link
          href="/dashboard/subscriptions"
          className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/50 transition-all group"
        >
          <CreditCard className="h-8 w-8 text-green-500 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Track Subscriptions</h3>
          <p className="text-slate-400 text-sm">See every subscription in one place. Sync from your bank or add manually. Cancel what you don't need.</p>
          <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">Manage <ArrowRight className="h-3 w-3" /></span>
        </Link>

        <Link
          href="/dashboard/complaints?new=1"
          className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/50 transition-all group"
        >
          <Building2 className="h-8 w-8 text-purple-500 mb-3" />
          <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Disputes</h3>
          <p className="text-slate-400 text-sm">Complaints, HMRC tax rebates, council tax challenges, parking appeals, flight delay claims, and more.</p>
          <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">Start a dispute <ArrowRight className="h-3 w-3" /></span>
        </Link>

        {userTier !== 'free' && (
          <Link
            href="/dashboard/money-hub"
            className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/50 transition-all group"
          >
            <BarChart3 className="h-8 w-8 text-sky-500 mb-3" />
            <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Money Hub</h3>
            <p className="text-slate-400 text-sm">See where every pound goes. Category breakdown, monthly trends, and smart savings suggestions.</p>
            <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">View Money Hub <ArrowRight className="h-3 w-3" /></span>
          </Link>
        )}

        {userTier === 'free' && (
          <Link
            href="/pricing"
            className="bg-navy-900 border border-mint-400/30 rounded-2xl p-6 hover:border-mint-400/50 transition-all group"
          >
            <Sparkles className="h-8 w-8 text-mint-400 mb-3" />
            <h3 className="text-white font-semibold mb-1 group-hover:text-mint-400 transition-all">Upgrade Your Plan</h3>
            <p className="text-slate-400 text-sm">Get unlimited complaints, daily bank sync, spending insights, cancellation emails, and renewal reminders.</p>
            <span className="text-mint-400 text-sm mt-3 flex items-center gap-1">View plans <ArrowRight className="h-3 w-3" /></span>
          </Link>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/dashboard/deals" className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/30 transition-all">
          <h3 className="text-white font-semibold mb-1">Browse 59 Deals</h3>
          <p className="text-slate-500 text-xs">Compare energy, broadband, mobile, insurance, and more. Find cheaper alternatives to your current providers.</p>
        </Link>
        <Link href="/dashboard/subscriptions" className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:border-mint-400/30 transition-all">
          <h3 className="text-white font-semibold mb-1">Track Contracts</h3>
          <p className="text-slate-500 text-xs">Add your subscriptions and contracts with end dates. Get alerts before renewals and find better deals.</p>
        </Link>
      </div>

      {/* Bank Picker Modal */}
      <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />
    </div>
  );
}
