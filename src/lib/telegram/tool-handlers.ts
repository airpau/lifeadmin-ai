import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { normalizeSpendingCategoryKey, buildMoneyHubOverrideMaps, findMatchingCategoryOverride, resolveMoneyHubTransaction } from '@/lib/money-hub-classification';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import { loadLearnedRules } from '@/lib/learning-engine';
import { listSpaces } from '@/lib/spaces';
import {
  type BotSpaceScope,
  applyTxSpaceFilter,
  loadBotSpace,
  matchesSpace,
  resolveSpaceByName,
  setBotActiveSpace,
} from '@/lib/telegram/spaces';
import {
  EVENT_CATALOG,
  getEventMeta,
  type NotificationEventType,
} from '@/lib/notifications/events';
import { getEffectiveTier } from '@/lib/plan-limits';
import { generateDisputeReply } from '@/lib/agents/dispute-reply-engine';

const CATEGORY_LABELS: Record<string, string> = {
  mortgage: 'Mortgage', loans: 'Loans & Finance', credit: 'Credit Cards',
  council_tax: 'Council Tax', energy: 'Energy', water: 'Water',
  broadband: 'Broadband', mobile: 'Mobile', streaming: 'Streaming',
  fitness: 'Fitness', groceries: 'Groceries', eating_out: 'Eating Out',
  fuel: 'Fuel', shopping: 'Shopping', insurance: 'Insurance',
  transport: 'Transport', gambling: 'Gambling', childcare: 'Childcare',
  software: 'Software', tax: 'Tax (HMRC)', professional: 'Professional Services',
  bills: 'Bills', transfers: 'Transfers', cash: 'Cash', fees: 'Fees',
  income: 'Income', other: 'Other', motoring: 'Motoring', property_management: 'Property',
  credit_monitoring: 'Credit Monitoring', charity: 'Charity', travel: 'Travel',
};

/** Classify transactions using the same engine as the Money Hub dashboard */
async function classifyTransactions(supabase: ReturnType<typeof getAdmin>, userId: string, startDate: string, endDate: string) {
  // connection_id + account_id travel through so callers can space-filter
  // the classified rows without a second fetch.
  const [{ data: txns }, { data: overrideRows }] = await Promise.all([
    supabase.from('bank_transactions')
      .select('id, amount, description, category, timestamp, merchant_name, user_category, income_type, connection_id, account_id')
      .eq('user_id', userId)
      .gte('timestamp', startDate)
      .lt('timestamp', endDate)
      .order('timestamp', { ascending: false })
      .limit(5000),
    supabase.from('money_hub_category_overrides')
      .select('merchant_pattern, transaction_id, user_category')
      .eq('user_id', userId),
  ]);
  await loadLearnedRules();
  const overrides = buildMoneyHubOverrideMaps(overrideRows || []);
  return (txns || []).map(txn => {
    const overrideCategory = findMatchingCategoryOverride(txn, overrides.transactionOverrides, overrides.merchantOverrides);
    const resolved = resolveMoneyHubTransaction(txn, overrideCategory);
    return {
      ...txn,
      resolved,
      effectiveCategory: resolved.spendingCategory || 'other',
      displayName: normaliseMerchantName(txn.merchant_name || txn.description || ''),
    };
  });
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface PendingAction {
  type: 'dispute_letter';
  provider: string;
  issue_description: string;
  desired_outcome: string;
  issue_type: string;
  letter_text: string;
}

export interface ToolResult {
  text: string;
  pendingAction?: PendingAction;
}

function fmt(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  return `£${Math.abs(n).toFixed(2)}`;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function blockBar(spent: number, limit: number, width = 10): string {
  const pct = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${Math.round(pct * 100)}%`;
}

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
  /**
   * Which channel this tool call is being executed FROM. Lets the
   * support-ticket handler tag source correctly so a WhatsApp ticket
   * doesn't get logged as 'telegram'. Defaults to 'telegram' for
   * backward compat with the existing Telegram bot path.
   */
  channel: 'telegram' | 'whatsapp' | 'chatbot' = 'telegram',
): Promise<ToolResult> {
  const supabase = getAdmin();

  switch (toolName) {
    case 'get_spending_summary':
      return getSpendingSummary(supabase, userId, toolInput.month as string | undefined);
    case 'list_transactions':
      return listTransactions(supabase, userId, {
        month: toolInput.month as string | undefined,
        category: toolInput.category as string | undefined,
        merchant: toolInput.merchant as string | undefined,
        limit: toolInput.limit as number | undefined,
      });
    case 'get_subscriptions':
      return getSubscriptions(supabase, userId, toolInput.filter as string | undefined, toolInput.category as string | undefined, toolInput.provider as string | undefined);
    case 'get_disputes':
      return getDisputes(supabase, userId, toolInput.status as string | undefined);
    case 'get_contracts':
      return getContracts(supabase, userId, toolInput.provider as string | undefined, toolInput.category as string | undefined);
    case 'get_budget_status':
      return getBudgetStatus(supabase, userId);
    case 'get_financial_overview':
      return getFinancialOverview(supabase, userId);
    case 'get_upcoming_renewals':
      return getUpcomingRenewals(supabase, userId);
    case 'get_price_alerts':
      return getPriceAlerts(supabase, userId);
    case 'get_deals':
      return getDeals(supabase, userId, toolInput.category as string | undefined);
    case 'get_upcoming_payments':
      return getUpcomingPayments(supabase, userId, toolInput.days as number | undefined);
    case 'get_savings_goals':
      return getSavingsGoals(supabase, userId);
    case 'get_savings_challenges':
      return getSavingsChallenges(supabase, userId);
    case 'get_bank_connections':
      return getBankConnections(supabase, userId);
    case 'remove_bank_connection':
      return removeBankConnection(supabase, userId, toolInput.identifier as string);
    case 'list_spaces':
      return listSpacesTool(supabase, userId);
    case 'set_active_space':
      return setActiveSpaceTool(supabase, userId, toolInput.name as string);
    case 'get_active_space':
      return getActiveSpaceTool(supabase, userId);
    case 'get_verified_savings':
      return getVerifiedSavings(supabase, userId);
    case 'get_monthly_trends':
      return getMonthlyTrends(supabase, userId, toolInput.months as number | undefined);
    case 'get_income_breakdown':
      return getIncomeBreakdown(supabase, userId, toolInput.month as string | undefined);
    case 'get_dispute_detail':
      return getDisputeDetail(supabase, userId, toolInput.provider as string);
    case 'quote_email_from_thread':
      return quoteEmailFromThread(supabase, userId, {
        provider: toolInput.provider as string,
        direction: (toolInput.direction as 'sent' | 'received' | 'all' | undefined) ?? 'all',
        limit: typeof toolInput.limit === 'number' ? (toolInput.limit as number) : 5,
      });
    case 'find_email_thread_for_dispute':
      return findEmailThreadForDispute(supabase, userId, {
        provider: toolInput.provider as string,
        query: toolInput.query as string | undefined,
      });
    case 'record_letter_sent':
      return recordLetterSent(supabase, userId, {
        provider: toolInput.provider as string,
        letterText: toolInput.letter_text as string,
        title: toolInput.title as string | undefined,
      });
    case 'link_email_thread_to_dispute':
      return linkEmailThreadToDispute(supabase, userId, {
        provider: toolInput.provider as string,
        connectionId: toolInput.connection_id as string,
        threadId: toolInput.thread_id as string,
        providerType: toolInput.provider_type as 'gmail' | 'outlook' | 'imap',
        subject: toolInput.subject as string | undefined,
        senderAddress: toolInput.sender_address as string | undefined,
      });
    case 'draft_dispute_letter':
      return draftDisputeLetter(supabase, userId, channel, {
        provider: toolInput.provider as string,
        issue_description: toolInput.issue_description as string,
        desired_outcome: toolInput.desired_outcome as string,
        issue_type: (toolInput.issue_type as string | undefined) ?? 'complaint',
        supplier_latest_message: toolInput.supplier_latest_message as string | undefined,
        user_reply_brief: toolInput.user_reply_brief as string | undefined,
        reply_tone: (toolInput.reply_tone as ReplyTone | undefined) ?? 'auto',
      });
    case 'discard_letter_draft':
      return discardLetterDraft(supabase, userId, {
        provider: toolInput.provider as string,
        reason: toolInput.reason as string | undefined,
      });
    case 'search_legal_rights':
      return searchLegalRights(
        supabase,
        toolInput.category as string | undefined,
        toolInput.query as string,
      );
    case 'recategorise_transactions':
      return recategoriseTransactions(supabase, userId, toolInput.merchant_name as string, toolInput.new_category as string);
    case 'set_budget':
      return setBudget(supabase, userId, toolInput.category as string, toolInput.monthly_limit as number);
    case 'recategorise_subscription':
      return recategoriseSubscription(supabase, userId, toolInput.provider_name as string, toolInput.new_category as string);
    case 'add_subscription':
      return addSubscription(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        amount: toolInput.amount as number,
        billing_cycle: (toolInput.billing_cycle as string | undefined) ?? 'monthly',
        category: (toolInput.category as string | undefined) ?? 'other',
      });
    case 'cancel_subscription':
      return cancelSubscription(supabase, userId, toolInput.provider_name as string);
    case 'delete_budget':
      return deleteBudget(supabase, userId, toolInput.category as string);
    case 'update_alert_preferences':
      return updateAlertPreferences(supabase, userId, toolInput as Record<string, unknown>);
    case 'get_alert_preferences':
      return getAlertPreferences(supabase, userId);
    case 'create_savings_goal':
      return createSavingsGoal(supabase, userId, {
        goal_name: toolInput.goal_name as string,
        target_amount: toolInput.target_amount as number,
        target_date: toolInput.target_date as string | undefined,
        emoji: toolInput.emoji as string | undefined,
      });
    case 'update_savings_goal':
      return updateSavingsGoal(supabase, userId, {
        goal_name: toolInput.goal_name as string,
        amount_saved: toolInput.amount_saved as number | undefined,
        add_amount: toolInput.add_amount as number | undefined,
      });
    case 'create_task':
      return createTask(supabase, userId, {
        title: toolInput.title as string,
        description: toolInput.description as string,
        priority: (toolInput.priority as string | undefined) ?? 'medium',
      });
    case 'update_dispute_status':
      return updateDisputeStatus(supabase, userId, {
        provider: toolInput.provider as string,
        new_status: toolInput.new_status as string,
        notes: toolInput.notes as string | undefined,
        money_recovered: toolInput.money_recovered as number | undefined,
        provider_response: toolInput.provider_response as string | undefined,
        draft_reply: toolInput.draft_reply as string | undefined,
      });
    case 'add_contract':
      return addContract(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        category: toolInput.category as string,
        monthly_cost: toolInput.monthly_cost as number,
        contract_end_date: toolInput.contract_end_date as string | undefined,
        contract_start_date: toolInput.contract_start_date as string | undefined,
        auto_renews: (toolInput.auto_renews as boolean | undefined) ?? true,
        interest_rate: toolInput.interest_rate as number | undefined,
        remaining_balance: toolInput.remaining_balance as number | undefined,
      });
    case 'recategorise_transaction':
      return recategoriseTransaction(
        supabase,
        userId,
        toolInput.transaction_id as string,
        toolInput.new_category as string,
      );
    case 'get_weekly_outlook':
      return getWeeklyOutlook(supabase, userId);
    case 'get_monthly_recap':
      return getMonthlyRecap(supabase, userId, toolInput.month as string | undefined);
    case 'get_unused_subscriptions':
      return getUnusedSubscriptions(supabase, userId);
    case 'get_dispute_status':
      return getDisputeStatus(supabase, userId);
    case 'get_savings_total':
      return getSavingsTotal(supabase, userId);
    case 'update_subscription':
      return updateSubscription(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        billing_cycle: toolInput.billing_cycle as string | undefined,
        amount: toolInput.amount as number | undefined,
        next_billing_date: toolInput.next_billing_date as string | undefined,
      });
    case 'dismiss_action_item':
      return dismissActionItem(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        item_type: (toolInput.item_type as string | undefined) ?? 'any',
      });
    case 'mark_bill_paid':
      return markBillPaid(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        amount: toolInput.amount as number | undefined,
        paid_date: toolInput.paid_date as string | undefined,
      });
    case 'get_loyalty_status':
      return getLoyaltyStatus(supabase, userId);
    case 'get_referral_link':
      return getReferralLink(supabase, userId);
    case 'get_net_worth':
      return getNetWorth(supabase, userId);
    case 'get_expected_bills':
      return getExpectedBills(supabase, userId);
    case 'get_overcharge_assessments':
      return getOverchargeAssessments(supabase, userId);
    case 'get_profile':
      return getProfile(supabase, userId);
    case 'get_tasks':
      return getTasks(supabase, userId, toolInput.status as string | undefined, toolInput.limit as number | undefined);
    case 'get_scanner_results':
      return getScannerResults(supabase, userId, toolInput.status as string | undefined);
    case 'generate_cancellation_email':
      return generateCancellationEmail(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        category: toolInput.category as string,
        amount: toolInput.amount as number | undefined,
        account_email: toolInput.account_email as string | undefined,
      });
    case 'create_support_ticket':
      return createSupportTicket(supabase, userId, channel, {
        subject: toolInput.subject as string,
        description: toolInput.description as string,
        category: (toolInput.category as string | undefined) ?? 'general',
        priority: (toolInput.priority as string | undefined) ?? 'medium',
      });
    case 'set_notification_schedule':
      return setNotificationSchedule(supabase, userId, toolInput);
    case 'disable_notification':
      return toggleNotification(supabase, userId, toolInput.event as string, false);
    case 'enable_notification':
      return toggleNotification(supabase, userId, toolInput.event as string, true);
    case 'list_notification_schedules':
      return listNotificationSchedules(supabase, userId);
    case 'set_quiet_hours':
      return setQuietHours(supabase, userId, {
        start: toolInput.start as string,
        end: toolInput.end as string,
      });
    // ===== Parity batch (2026-04-29) =====
    case 'dismiss_price_alert':
      return dismissPriceAlert(supabase, userId, toolInput.provider as string);
    case 'update_profile':
      return updateProfile(supabase, userId, {
        full_name: toolInput.full_name as string | undefined,
        phone: toolInput.phone as string | undefined,
        contact_email: toolInput.contact_email as string | undefined,
      });
    case 'list_email_connections':
      return listEmailConnections(supabase, userId);
    case 'disconnect_email_connection':
      return disconnectEmailConnection(supabase, userId, toolInput.email_address as string);
    case 'add_correspondence_note':
      return addCorrespondenceNote(supabase, userId, {
        provider: toolInput.provider as string,
        entry_type: toolInput.entry_type as string,
        title: toolInput.title as string | undefined,
        content: toolInput.content as string,
      });
    case 'list_watchdog_links':
      return listWatchdogLinks(supabase, userId, toolInput.provider as string | undefined);
    case 'unlink_email_thread':
      return unlinkEmailThread(supabase, userId, toolInput.provider as string);
    case 'sync_replies_now':
      return syncRepliesNow(supabase, userId, toolInput.provider as string);
    case 'get_notifications':
      return getNotifications(supabase, userId, toolInput.unread_only as boolean | undefined);
    case 'mark_notification_read':
      return markNotificationRead(supabase, userId, {
        notification_id: toolInput.notification_id as string | undefined,
        all: toolInput.all as boolean | undefined,
      });
    case 'get_money_recovery_score':
      return getMoneyRecoveryScore(supabase, userId);
    case 'get_top_merchants':
      return getTopMerchants(supabase, userId, {
        month: toolInput.month as string | undefined,
        limit: toolInput.limit as number | undefined,
      });
    case 'get_savings_rate':
      return getSavingsRate(supabase, userId);
    case 'detect_price_increases':
      return detectPriceIncreasesNow(supabase, userId);
    case 'get_contract_alerts':
      return getContractAlertsForBot(supabase, userId, toolInput.within_days as number | undefined);
    case 'redeem_loyalty_points':
      return redeemLoyaltyPoints(supabase, userId, toolInput.reward_id as string | undefined);
    case 'bank_sync_now':
      return bankSyncNow(supabase, userId);
    case 'run_email_scan':
      return runEmailScan(supabase, userId);
    case 'list_support_tickets':
      return listSupportTickets(supabase, userId, toolInput.status as string | undefined);
    case 'add_ticket_message':
      return addTicketMessage(supabase, userId, {
        ticket_ref: toolInput.ticket_ref as string,
        message: toolInput.message as string,
      });
    case 'mark_subscription_cancellation_sent':
      return markSubscriptionCancellationSent(supabase, userId, toolInput.provider as string);
    case 'refine_letter':
      return refineLetter(supabase, userId, {
        provider: toolInput.provider as string,
        instruction: toolInput.instruction as string,
      });
    case 'request_data_export':
      return requestDataExport(supabase, userId, toolInput.format as string | undefined);
    case 'generate_form_letter':
      return generateFormLetter(supabase, userId, {
        form_type: toolInput.form_type as string,
        situation: toolInput.situation as string,
        desired_outcome: toolInput.desired_outcome as string,
      });
    // ===== Phase 3a — edge actions =====
    case 'complete_task': return completeTask(supabase, userId, toolInput.task_id as string);
    case 'snooze_task': return snoozeTask(supabase, userId, toolInput.task_id as string, toolInput.days as number);
    case 'snooze_dispute': return snoozeDispute(supabase, userId, toolInput.provider as string, toolInput.days as number);
    case 'escalate_dispute': return escalateDispute(supabase, userId, channel, toolInput.provider as string);
    case 'reopen_dispute': return reopenDispute(supabase, userId, toolInput.provider as string, toolInput.reason as string);
    case 'move_correspondence_to_dispute': return moveCorrespondence(supabase, userId, toolInput.correspondence_id as string, toolInput.target_dispute_provider as string);
    case 'delete_correspondence_entry': return deleteCorrespondenceEntry(supabase, userId, toolInput.correspondence_id as string);
    case 'add_note_to_subscription': return addNoteToSubscription(supabase, userId, toolInput.provider as string, toolInput.note as string);
    case 'merge_subscriptions': return mergeSubscriptions(supabase, userId, toolInput.keep_provider as string, toolInput.merge_provider as string);
    case 'tag_transaction': return tagTransaction(supabase, userId, toolInput.transaction_id as string, toolInput.tag as string);
    case 'pause_alerts_until': return pauseAlertsUntil(supabase, userId, toolInput.until_date as string);
    // ===== Phase 3b — long-tail reads =====
    case 'get_login_history': return getLoginHistory(supabase, userId, toolInput.limit as number | undefined);
    case 'get_active_sessions': return getActiveSessions(supabase, userId);
    case 'get_referral_stats': return getReferralStats(supabase, userId);
    case 'search_disputes': return searchDisputes(supabase, userId, toolInput.query as string);
    case 'get_transaction_detail': return getTransactionDetail(supabase, userId, toolInput.transaction_id as string);
    case 'get_dashboard_stats': return getDashboardStats(supabase, userId);
    case 'get_savings_breakdown_by_provider': return getSavingsBreakdownByProvider(supabase, userId);
    case 'get_renewal_calendar': return getRenewalCalendar(supabase, userId, toolInput.within_days as number | undefined);
    case 'archive_subscription': return archiveSubscription(supabase, userId, toolInput.provider as string);
    case 'archive_dispute': return archiveDispute(supabase, userId, toolInput.provider as string);
    case 'get_subscription_history': return getSubscriptionHistory(supabase, userId, toolInput.limit as number | undefined);
    case 'get_refund_status': return getRefundStatus(supabase, userId);
    case 'get_blog_posts': return getBlogPosts(toolInput.limit as number | undefined, toolInput.topic as string | undefined);
    case 'get_consumer_law_news': return getConsumerLawNews(supabase, toolInput.limit as number | undefined);
    case 'set_monthly_budget': return setMonthlyBudget(supabase, userId, toolInput.amount as number);
    case 'record_negotiation_outcome': return recordNegotiationOutcome(supabase, userId, toolInput.provider as string, toolInput.annual_saving as number, toolInput.notes as string | undefined);
    // ===== Phase 3c — browser handoff =====
    case 'start_bank_connection': return startBankConnection();
    case 'start_email_connection': return startEmailConnection(toolInput.provider as string);
    case 'start_plan_upgrade': return startPlanUpgrade(toolInput.target_tier as string, toolInput.billing as string | undefined);
    case 'start_subscription_cancel': return startSubscriptionCancel();
    case 'start_account_deletion': return startAccountDeletion(supabase, userId, toolInput.reason as string | undefined);
    case 'start_data_export_download': return startDataExportDownload(supabase, userId);
    // ===== Phase 3d — misc parity =====
    case 'scan_receipt': return scanReceipt(toolInput.receipt_text as string, toolInput.suggested_action as string | undefined);
    case 'renew_bank_consent': return renewBankConsent(supabase, userId, toolInput.bank_name as string | undefined);
    case 'dismiss_contract_alert': return dismissContractAlert(supabase, userId, toolInput.alert_id as string);
    case 'dismiss_bank_prompt': return dismissBankPrompt(supabase, userId);
    // ===== Phase 4 — founder-only =====
    case 'get_business_log': return getBusinessLog(supabase, userId, toolInput.category as string | undefined, toolInput.limit as number | undefined);
    case 'get_open_support_tickets': return getOpenSupportTicketsAdmin(supabase, userId, toolInput.limit as number | undefined);
    case 'get_mrr': return getMrr(supabase, userId);
    case 'get_pending_disputes_across_users': return getPendingDisputesAcrossUsers(supabase, userId);
    case 'get_recent_signups': return getRecentSignups(supabase, userId, toolInput.limit as number | undefined);
    case 'get_failed_payments': return getFailedPayments(supabase, userId);
    case 'get_legal_coverage_status': return getLegalCoverageStatus(supabase, userId);
    case 'get_managed_agent_run_status': return getManagedAgentRunStatus(supabase, userId);
    default:
      return { text: `Unknown tool: ${toolName}` };
  }
}

// ============================================================
// READ HANDLERS
// ============================================================

async function getSpendingSummary(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  month?: string,
): Promise<ToolResult> {
  const now = new Date();
  let year = now.getFullYear();
  let mon = now.getMonth() + 1;
  if (typeof month === 'string' && month.includes('-')) {
    const parts = month.split('-').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      year = parts[0];
      mon = parts[1];
    }
  }
  const targetMonth = `${year}-${String(mon).padStart(2, '0')}`;

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();
  const prevDate = new Date(year, mon - 2, 1).toISOString();

  // Use classification engine for both months
  const [classifiedAll, prevClassifiedAll, connections, scope] = await Promise.all([
    classifyTransactions(supabase, userId, startDate, endDate),
    classifyTransactions(supabase, userId, prevDate, startDate),
    supabase.from('bank_connections').select('bank_name, status, last_synced_at').eq('user_id', userId),
    loadBotSpace(supabase, userId),
  ]);

  const classified = scope.isDefault
    ? classifiedAll
    : classifiedAll.filter((t) => matchesSpace(t, scope));
  const prevClassified = scope.isDefault
    ? prevClassifiedAll
    : prevClassifiedAll.filter((t) => matchesSpace(t, scope));

  const connData = connections.data ?? [];
  const EXPIRED_STATUSES = ['expired', 'expired_legacy', 'revoked'];
  const allExpired = connData.length > 0 && connData.every(c => EXPIRED_STATUSES.includes(c.status));
  const noneConnected = connData.length === 0;

  const spending = classified.filter(t => t.resolved.kind === 'spending' && t.effectiveCategory !== 'transfers');
  const income = classified.filter(t => t.resolved.kind === 'income');

  if (spending.length === 0 && income.length === 0) {
    if (noneConnected) {
      return { text: `No bank transactions found for ${targetMonth}. Connect a bank account at paybacker.co.uk/dashboard/money-hub to start tracking spending.` };
    }
    if (allExpired) {
      const lastSync = connData.reduce((latest: string | null, c) => {
        if (!c.last_synced_at) return latest;
        return !latest || c.last_synced_at > latest ? c.last_synced_at : latest;
      }, null);
      return { text: `No stored transactions found for ${targetMonth}. Your bank connection has expired${lastSync ? ` (last synced ${fmtDate(lastSync)})` : ''} — reconnect at paybacker.co.uk/dashboard/money-hub to sync the latest data.` };
    }
    return { text: `No transactions found for ${targetMonth}. Your bank account is connected and transactions will appear once synced.` };
  }

  // Group by CLASSIFIED category (not raw bank category)
  const totals: Record<string, number> = {};
  spending.forEach((t) => {
    const cat = t.effectiveCategory;
    totals[cat] = (totals[cat] ?? 0) + (-Number(t.amount));
  });

  const prevSpending = prevClassified.filter(t => t.resolved.kind === 'spending' && t.effectiveCategory !== 'transfers');
  const prevTotals: Record<string, number> = {};
  prevSpending.forEach((t) => {
    const cat = t.effectiveCategory;
    prevTotals[cat] = (prevTotals[cat] ?? 0) + (-Number(t.amount));
  });

  const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0);
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);

  const monthLabel = new Date(year, mon - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const scopeHeader = scope.space && !scope.isDefault ? ` — ${scope.space.emoji ?? '📁'} ${scope.space.name}` : '';
  let text = `*Spending Summary — ${monthLabel}${scopeHeader}*\n`;
  text += `Total Spending: *${fmt(grandTotal)}*\n`;
  if (totalIncome > 0) text += `Income: *${fmt(totalIncome)}*\n`;
  text += `\n`;

  for (const [cat, amount] of sorted) {
    const label = CATEGORY_LABELS[cat] || cat;
    const prev = prevTotals[cat] ?? 0;
    const diff = amount - prev;
    const arrow = diff > 1 ? ` ▲${fmt(diff)}` : diff < -1 ? ` ▼${fmt(Math.abs(diff))}` : '';
    text += `• ${label}: *${fmt(amount)}*${arrow}\n`;
  }

  if (allExpired) {
    text += `\n_Note: Bank connection expired — reconnect at paybacker.co.uk/dashboard/money-hub_`;
  }

  return { text };
}

async function listTransactions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { month?: string; category?: string; merchant?: string; limit?: number },
): Promise<ToolResult> {
  const now = new Date();
  let year = now.getFullYear();
  let mon = now.getMonth() + 1;
  if (typeof params.month === 'string' && params.month.includes('-')) {
    const parts = params.month.split('-').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      year = parts[0];
      mon = parts[1];
    }
  }
  const targetMonth = `${year}-${String(mon).padStart(2, '0')}`;

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();
  const maxResults = params.limit ?? 25;

  // Use classification engine to get proper categories
  const classifiedAll = await classifyTransactions(supabase, userId, startDate, endDate);
  const scope = await loadBotSpace(supabase, userId);
  const classified = scope.isDefault
    ? classifiedAll
    : classifiedAll.filter((t) => matchesSpace(t, scope));

  const connResult = await supabase.from('bank_connections').select('status, last_synced_at').eq('user_id', userId);
  const connData = connResult.data ?? [];
  const EXPIRED_STATUSES = ['expired', 'expired_legacy', 'revoked'];
  const allExpired = connData.length > 0 && connData.every(c => EXPIRED_STATUSES.includes(c.status));
  const noneConnected = connData.length === 0;

  // Apply filters using CLASSIFIED category (not raw bank category)
  let filtered = classified;
  const targetCategory = params.category ? normalizeSpendingCategoryKey(params.category) : null;
  if (targetCategory === 'income') {
    filtered = filtered.filter(t => t.resolved.kind === 'income');
  } else if (targetCategory === 'spending') {
    filtered = filtered.filter(t => t.resolved.kind === 'spending');
  } else if (targetCategory) {
    filtered = filtered.filter(t => {
      const cat = normalizeSpendingCategoryKey(t.effectiveCategory);
      return cat === targetCategory;
    });
  }
  if (params.merchant) {
    const kw = params.merchant.toLowerCase();
    filtered = filtered.filter(t =>
      (t.merchant_name || '').toLowerCase().includes(kw) ||
      (t.description || '').toLowerCase().includes(kw) ||
      t.displayName.toLowerCase().includes(kw)
    );
  }

  if (filtered.length === 0) {
    const filterDesc = `${targetCategory ? ` in ${CATEGORY_LABELS[targetCategory] || targetCategory}` : ''}${params.merchant ? ` matching "${params.merchant}"` : ''}`;
    if (noneConnected) {
      return { text: `No transactions found for ${targetMonth}${filterDesc}. Connect a bank account at paybacker.co.uk/dashboard/money-hub` };
    }
    if (allExpired) {
      return { text: `No transactions found for ${targetMonth}${filterDesc}. Bank connection expired — reconnect at paybacker.co.uk/dashboard/money-hub to sync newer data.` };
    }
    // Show which categories DO have data to help user
    const availableCats = [...new Set(classified.filter(t => t.resolved.kind === 'spending').map(t => CATEGORY_LABELS[t.effectiveCategory] || t.effectiveCategory))];
    return { text: `No transactions found for ${targetMonth}${filterDesc}. Categories with data: ${availableCats.slice(0, 10).join(', ')}` };
  }

  const display = filtered.slice(0, maxResults);
  const monthLabel = new Date(year, mon - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const scopeHeader = scope.space && !scope.isDefault ? ` — ${scope.space.emoji ?? '📁'} ${scope.space.name}` : '';
  let text = `*Transactions — ${monthLabel}${scopeHeader}*`;
  if (targetCategory) text += ` (${CATEGORY_LABELS[targetCategory] || targetCategory})`;
  if (params.merchant) text += ` matching "${params.merchant}"`;
  text += `\n\n`;

  let total = 0;
  for (const t of display) {
    const amt = Number(t.amount);
    total += amt;
    const date = new Date(t.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
    const isDebit = amt < 0;
    let catLabel = '';
    if (t.resolved.kind === 'income') {
      const incType = t.resolved.incomeType || 'other';
      catLabel = CATEGORY_LABELS[incType] || incType.charAt(0).toUpperCase() + incType.slice(1);
    } else {
      catLabel = CATEGORY_LABELS[t.effectiveCategory] || t.effectiveCategory;
    }

    text += `\`${t.id}\` · ${date} · ${t.displayName} · ${isDebit ? '-' : '+'}${fmt(Math.abs(amt))} · ${catLabel}\n`;
  }

  text += `\n*Total: ${total < 0 ? '-' : ''}${fmt(Math.abs(total))}* (${filtered.length} transaction${filtered.length !== 1 ? 's' : ''})\n`;
  text += `_To recategorise, say something like "recategorise [merchant] as [category]"_`;

  if (allExpired) {
    text += `\n_Note: Bank connection expired — data may not be current. Reconnect at paybacker.co.uk/dashboard/money-hub_`;
  }

  return { text };
}

async function getSubscriptions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  filter?: string,
  category?: string,
  provider?: string,
): Promise<ToolResult> {
  const effectiveFilter = filter ?? 'active';

  let query = supabase
    .from('subscriptions')
    .select(
      'provider_name, amount, billing_cycle, next_billing_date, status, contract_end_date, provider_type, category',
    )
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('amount', { ascending: false });

  if (effectiveFilter !== 'all') {
    if (effectiveFilter === 'active') {
      query = query.eq('status', 'active');
    } else if (effectiveFilter === 'cancelled') {
      query = query.in('status', ['cancelled', 'pending_cancellation']);
    }
  }

  if (category) {
    query = query.ilike('category', category);
  }
  if (provider) {
    query = query.ilike('provider_name', `%${provider}%`);
  }

  const { data, error } = await query.limit(50);
  if (error || !data || data.length === 0) {
    const desc = category ? ` in category "${category}"` : provider ? ` matching "${provider}"` : '';
    return { text: `No subscriptions found${desc}.` };
  }

  // Match the website logic: separate finance payments (loans, mortgages, credit cards) from subscriptions
  const FINANCE_KEYWORDS = ['mortgage', 'loan', 'finance', 'lendinvest', 'skipton', 'santander loan', 'natwest loan', 'novuna', 'ca auto', 'auto finance', 'funding circle', 'zopa', 'barclaycard', 'mbna', 'halifax credit', 'hsbc bank visa', 'virgin money', 'capital one', 'american express', 'amex', 'securepay', 'credit card'];

  const isFinance = (name: string) => {
    const lower = name.toLowerCase();
    return FINANCE_KEYWORDS.some(kw => lower.includes(kw));
  };

  // Deduplicate by normalised provider name + amount band (mirrors website logic).
  // Two separate subscriptions at the same provider but different amounts
  // (e.g. two council-tax DDs for different properties) are kept distinct.
  const seen = new Set<string>();
  const deduped = data.filter(s => {
    const normName = s.provider_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const band = Math.round(Math.log(Math.max(Math.abs(parseFloat(String(s.amount)) || 0), 0.01)) / Math.log(1.1));
    const key = `${normName}|${band}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const subs = deduped.filter(s => !isFinance(s.provider_name) && s.billing_cycle !== 'one-time');
  const finance = deduped.filter(s => isFinance(s.provider_name));

  const toMonthly = (s: { amount: string | number; billing_cycle: string | null }) => {
    const amt = Number(s.amount);
    if (s.billing_cycle === 'yearly') return amt / 12;
    if (s.billing_cycle === 'quarterly') return amt / 3;
    return amt;
  };

  const subsMonthly = subs.filter(s => s.status === 'active').reduce((sum, s) => sum + toMonthly(s), 0);
  const financeMonthly = finance.filter(s => s.status === 'active').reduce((sum, s) => sum + toMonthly(s), 0);

  // If user asked for a specific category (e.g. "mortgage"), show all matching without splitting
  if (category) {
    const totalMonthly = deduped.filter(s => s.status === 'active').reduce((sum, s) => sum + toMonthly(s), 0);
    let text = `*${category} (${deduped.length})*\n`;
    text += `Monthly total: *${fmt(totalMonthly)}* | Annual: *${fmt(totalMonthly * 12)}*\n\n`;
    for (const s of deduped) {
      const cycle = s.billing_cycle ?? 'monthly';
      const end = s.contract_end_date ? ` (Ends ${fmtDate(s.contract_end_date)})` : '';
      text += `• *${s.provider_name}* — ${fmt(s.amount)}/${cycle}${end}`;
      if (s.status !== 'active') text += ` [${s.status}]`;
      text += '\n';
    }
    return { text };
  }

  let text = `*Subscriptions (${subs.length})*\n`;
  text += `Monthly: *${fmt(subsMonthly)}* | Annual: *${fmt(subsMonthly * 12)}*\n\n`;

  for (const s of subs.slice(0, 25)) {
    const renewal = s.next_billing_date ? `Renews ${fmtDate(s.next_billing_date)}` : '';
    const end = s.contract_end_date ? `Ends ${fmtDate(s.contract_end_date)}` : renewal;
    const cycle = s.billing_cycle ?? 'monthly';
    text += `• *${s.provider_name}* — ${fmt(s.amount)}/${cycle}`;
    if (s.category) text += ` [${s.category}]`;
    if (end) text += ` (${end})`;
    if (s.status !== 'active') text += ` [${s.status}]`;
    text += '\n';
  }

  if (finance.length > 0) {
    text += `\n*Finance & Loans (${finance.length})*\n`;
    text += `Monthly: *${fmt(financeMonthly)}* | Annual: *${fmt(financeMonthly * 12)}*\n\n`;
    for (const s of finance) {
      const cycle = s.billing_cycle ?? 'monthly';
      text += `• *${s.provider_name}* — ${fmt(s.amount)}/${cycle}`;
      if (s.category) text += ` [${s.category}]`;
      text += '\n';
    }
  }

  return { text };
}

async function getDisputes(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  status?: string,
): Promise<ToolResult> {
  let query = supabase
    .from('disputes')
    .select('provider_name, issue_type, status, disputed_amount, money_recovered, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (status === 'open') {
    query = query.in('status', ['open', 'awaiting_response', 'escalated']);
  } else if (status === 'resolved') {
    query = query.in('status', ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed']);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    return { text: 'No disputes found. Send a message like "Write a complaint letter to British Gas" to start one.' };
  }

  const statusEmoji: Record<string, string> = {
    open: '🔴',
    awaiting_response: '🟡',
    escalated: '🟠',
    resolved_won: '✅',
    resolved_partial: '🟢',
    resolved_lost: '❌',
    closed: '⚫',
  };

  let text = `*Disputes (${data.length})*\n\n`;
  for (const d of data) {
    const emoji = statusEmoji[d.status] ?? '⚪';
    // Surface BOTH "opened" and "last activity" with explicit labels —
    // Claude was conflating updated_at with creation time and
    // describing month-old disputes as "opened 1 day ago" because
    // updated_at had bumped today (sync, backfill, reply import,
    // etc.). The labels here are non-negotiable: don't compress to
    // a single relative time, the bot will misinterpret it.
    const openedDays = Math.floor(
      (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    const lastActivityDays = Math.floor(
      (Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    text += `${emoji} *${d.provider_name}* — ${d.issue_type.replace(/_/g, ' ')}\n`;
    text += `   Status: ${d.status.replace(/_/g, ' ')} · opened ${openedDays}d ago (${fmtDate(d.created_at)})`;
    if (lastActivityDays !== openedDays) {
      text += ` · last activity ${lastActivityDays}d ago`;
    }
    if (d.money_recovered && Number(d.money_recovered) > 0) {
      text += ` · Recovered: ${fmt(d.money_recovered)}`;
    }
    text += '\n';
  }

  return { text };
}

async function getContracts(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider?: string,
  category?: string,
): Promise<ToolResult> {
  let query = supabase
    .from('subscriptions')
    .select(
      'provider_name, contract_type, contract_end_date, contract_start_date, amount, billing_cycle, auto_renews, early_exit_fee, provider_type, category, interest_rate, remaining_balance',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('contract_end_date', { ascending: true, nullsFirst: false })
    .limit(20);

  if (provider) {
    query = query.ilike('provider_name', `%${provider}%`);
  }
  if (category) {
    query = query.ilike('category', category);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    const desc = category ? ` in category "${category}"` : provider ? ` matching "${provider}"` : '';
    return { text: `No contracts found${desc}. Add contracts at paybacker.co.uk/dashboard/subscriptions` };
  }

  const now = new Date();
  let text = `*Contracts (${data.length})*\n\n`;

  for (const c of data) {
    const cycle = c.billing_cycle ?? 'monthly';
    text += `*${c.provider_name}*`;
    if (c.category) text += ` [${c.category}]`;
    if (c.contract_type && c.contract_type !== 'subscription') {
      text += ` (${c.contract_type.replace(/_/g, ' ')})`;
    }
    text += `\n   ${fmt(c.amount)}/${cycle}`;
    if (c.contract_end_date) {
      const endDate = new Date(c.contract_end_date);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const urgency = daysLeft <= 7 ? '🔴' : daysLeft <= 30 ? '🟡' : '🟢';
      text = text.replace(`*${c.provider_name}*`, `${urgency} *${c.provider_name}*`);
      text += ` · Ends ${fmtDate(c.contract_end_date)} (${daysLeft} days)`;
    }
    if (c.auto_renews) text += ' · Auto-renews';
    if (c.early_exit_fee && Number(c.early_exit_fee) > 0) {
      text += ` · Exit fee: ${fmt(c.early_exit_fee)}`;
    }
    if (c.interest_rate && Number(c.interest_rate) > 0) {
      text += `\n   Interest: ${Number(c.interest_rate).toFixed(2)}%`;
    }
    if (c.remaining_balance && Number(c.remaining_balance) > 0) {
      text += ` · Remaining: ${fmt(c.remaining_balance)}`;
    }
    text += '\n';
  }

  return { text };
}

async function getBudgetStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();

  const [budgets, spendingRpc] = await Promise.all([
    supabase
      .from('money_hub_budgets')
      .select('category, monthly_limit')
      .eq('user_id', userId),
    supabase.rpc('get_monthly_spending', { p_user_id: userId, p_year: year, p_month: month }),
  ]);

  if (!budgets.data || budgets.data.length === 0) {
    return {
      text: 'No budgets set up yet. Create budgets at paybacker.co.uk/dashboard/money-hub',
    };
  }

  // Build spending map from RPC (uses user_category, excludes transfers/income)
  const spentByCategory: Record<string, number> = {};
  for (const row of spendingRpc.data ?? []) {
    spentByCategory[row.category] = Number(row.category_total);
  }

  const budgetCategories = budgets.data.map(b => b.category);

  // Check if any budget category has no matched spending but there IS 'other' spending
  const otherSpend = spentByCategory['other'] ?? 0;
  const unmatchedBudgets = budgetCategories.filter(cat => !(spentByCategory[cat] > 0));

  if (otherSpend > 0 && unmatchedBudgets.length > 0) {
    // Fetch this month's 'other' transactions for AI categorization
    const { data: otherTxns } = await supabase
      .from('bank_transactions')
      .select('id, merchant_name, description, amount, user_category')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', startDate)
      .lt('timestamp', endDate)
      .in('user_category', ['other'])
      .limit(200);

    if (otherTxns && otherTxns.length > 0) {
      // Group by merchant name to batch the AI call
      const merchantTotals: Record<string, number> = {};
      for (const t of otherTxns) {
        const merchant = t.merchant_name || t.description || 'Unknown';
        merchantTotals[merchant] = (merchantTotals[merchant] ?? 0) + Math.abs(Number(t.amount));
      }

      try {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY,
        });

        const merchantList = Object.entries(merchantTotals)
          .map(([m, amt]) => `${m}: £${amt.toFixed(2)}`)
          .join('\n');

        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: `Classify these UK bank transactions into one of the user's budget categories.

Budget categories: ${budgetCategories.join(', ')}

Transactions (merchant: total spent this month):
${merchantList}

Return ONLY a JSON object mapping each merchant name exactly as given to the best matching category name from the list. Use "other" if none fit.
Example: {"Tesco": "groceries", "National Rail": "travel"}`,
          }],
        });

        const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const categoryMap = JSON.parse(jsonMatch[0]) as Record<string, string>;

          // Redistribute spending from 'other' into matched budget categories
          for (const t of otherTxns) {
            const merchant = t.merchant_name || t.description || 'Unknown';
            const assignedCat = categoryMap[merchant];
            if (assignedCat && assignedCat !== 'other' && budgetCategories.includes(assignedCat)) {
              const amt = Math.abs(Number(t.amount));
              spentByCategory['other'] = Math.max(0, (spentByCategory['other'] ?? 0) - amt);
              spentByCategory[assignedCat] = (spentByCategory[assignedCat] ?? 0) + amt;
            }
          }

          // Persist merchant→category mappings so future syncs use them
          for (const [merchant, cat] of Object.entries(categoryMap)) {
            if (cat !== 'other' && budgetCategories.includes(cat) && merchant !== 'Unknown') {
              const pattern = merchant.toLowerCase().slice(0, 50);
              // Delete any existing pattern to avoid duplicates then insert fresh
              await supabase
                .from('money_hub_category_overrides')
                .delete()
                .eq('user_id', userId)
                .eq('merchant_pattern', pattern);
              await supabase.from('money_hub_category_overrides').insert({
                user_id: userId,
                merchant_pattern: pattern,
                user_category: cat,
              });
            }
          }

          // Re-run auto_categorise so new overrides apply immediately
          await supabase.rpc('auto_categorise_transactions', { p_user_id: userId });
        }
      } catch {
        // AI categorization is best-effort — continue with whatever we have
      }
    }
  }

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let text = `*Budget Status — ${monthLabel}*\n\n`;

  for (const b of budgets.data) {
    const limit = Number(b.monthly_limit);
    const spentAmt = spentByCategory[b.category] ?? 0;
    const over = spentAmt > limit;
    const emoji = over ? '🔴' : spentAmt / limit > 0.8 ? '🟡' : '🟢';
    text += `${emoji} *${b.category}*\n`;
    text += `   ${blockBar(spentAmt, limit)} ${fmt(spentAmt)} / ${fmt(limit)}`;
    if (over) text += ` _(over by ${fmt(spentAmt - limit)})_`;
    text += '\n';
  }

  const remainingOther = spentByCategory['other'] ?? 0;
  if (remainingOther > 0) {
    text += `\n_${fmt(remainingOther)} in uncategorised spending not yet assigned to a budget._`;
  }

  return { text };
}

async function getUpcomingRenewals(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('subscriptions')
    .select('provider_name, amount, billing_cycle, next_billing_date, contract_end_date, auto_renews')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`next_billing_date.gte.${today},contract_end_date.gte.${today}`)
    .or(`next_billing_date.lte.${in30},contract_end_date.lte.${in30}`)
    .order('next_billing_date', { ascending: true })
    .limit(15);

  if (error || !data || data.length === 0) {
    return { text: 'No upcoming renewals in the next 30 days.' };
  }

  // Filter to only those within 30 days
  const upcoming = data.filter((s) => {
    const date = s.contract_end_date ?? s.next_billing_date;
    if (!date) return false;
    const d = new Date(date);
    return d >= now && d <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  if (upcoming.length === 0) {
    return { text: 'No upcoming renewals in the next 30 days.' };
  }

  let text = `*Upcoming Renewals (next 30 days)*\n\n`;
  for (const s of upcoming) {
    const date = s.contract_end_date ?? s.next_billing_date;
    const d = new Date(date!);
    const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const urgency = days <= 3 ? '🔴' : days <= 7 ? '🟡' : '📅';
    const cycle = s.billing_cycle ?? 'monthly';
    const action = s.contract_end_date ? (s.auto_renews ? 'Auto-renews' : 'Expires') : 'Charges';
    text += `${urgency} *${s.provider_name}* — ${fmt(s.amount)}/${cycle}\n`;
    text += `   ${action} in ${days} day${days !== 1 ? 's' : ''} (${fmtDate(date!)})\n`;
  }

  return { text };
}

async function getPriceAlerts(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('price_increase_alerts')
    .select('merchant_name, old_amount, new_amount, increase_pct, annual_impact, new_date, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('annual_impact', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return { text: 'No active price increase alerts. Good news — no unexpected bill rises detected.' };
  }

  const totalImpact = data.reduce((sum, a) => sum + Number(a.annual_impact), 0);

  let text = `*Price Increase Alerts (${data.length})*\n`;
  text += `Total extra cost: *+${fmt(totalImpact)}/year*\n\n`;

  for (const a of data) {
    const pct = Number(a.increase_pct);
    const emoji = pct >= 10 ? '🔴' : '🟡';
    text += `${emoji} *${a.merchant_name ?? 'Unknown'}*: ${fmt(a.old_amount)} → ${fmt(a.new_amount)}/mo (+${pct.toFixed(0)}%) = +${fmt(a.annual_impact)}/yr\n`;
  }

  return { text };
}

// ============================================================
// ACTION HANDLERS
// ============================================================

type ReplyTone = 'auto' | 'friendly' | 'balanced' | 'firm';

function toneGuidance(tone: ReplyTone, hasSupplierContext: boolean): string {
  switch (tone) {
    case 'friendly':
      return [
        "TONE: FRIENDLY / CO-OPERATIVE.",
        "- Warm, polite, brief. Assume good faith.",
        "- Directly answer / do what the supplier asked. Do NOT re-litigate the complaint.",
        "- No statutory references unless the user explicitly asked for them.",
        "- No 14-day ultimatum. No ombudsman reference.",
        "- 120–200 words is plenty.",
      ].join('\n');
    case 'firm':
      return [
        "TONE: FIRM.",
        "- Professional but unmistakably escalating.",
        "- Cite the relevant UK consumer law (Consumer Rights Act 2015 s.49/s.50, sector ombudsman rules, Ofcom automatic compensation, Ofgem guaranteed standards, EU/UK261, etc. — whichever is relevant).",
        "- State a clear 14-day deadline.",
        "- Reference the escalation path (relevant ombudsman / FOS / Small Claims / Section 75) that will follow if not resolved.",
        "- 250–350 words.",
      ].join('\n');
    case 'balanced':
      return [
        "TONE: BALANCED / PROFESSIONAL.",
        "- Neutral, businesslike, firm but not aggressive.",
        "- Mention consumer-law context lightly (one sentence, naturally woven in) — don't lecture.",
        "- Set a 14-day response expectation only if the supplier is dragging their feet.",
        "- 180–280 words.",
      ].join('\n');
    case 'auto':
    default:
      return hasSupplierContext
        ? [
            "TONE: AUTO — decide based on what the supplier just said.",
            "- If the supplier's latest message is a HOLDING REPLY (\"we've got your complaint, looking into it\") — acknowledge briefly, no action required.",
            "- If the supplier asked a scheduling / info / administrative QUESTION (engineer appointment, account number, proof) — answer it directly, keep it short and warm, do NOT re-state the whole complaint history. Only provide what they asked for.",
            "- If the supplier OFFERED a settlement/refund/credit — neutral, businesslike, accept / counter / reject clearly. Don't grovel, don't escalate.",
            "- If the supplier REJECTED the complaint or gave a FINAL RESPONSE / deadlock letter — firm, cite the relevant law and ombudsman / escalation path, 14-day deadline.",
            "- If the supplier's message is unclear or just marketing — keep the reply minimal.",
            "- Match the register of their message. If they were brief and friendly, you are brief and friendly. If they were dismissive, you are firm.",
            "- Never open with a paragraph re-stating the original complaint unless the supplier's message directly contradicts it.",
          ].join('\n')
        : [
            "TONE: AUTO — this appears to be a fresh complaint (no prior supplier message).",
            "- Formal, professional, firm.",
            "- Cite the relevant UK consumer law and sector regulator.",
            "- Set a 14-day deadline and mention the escalation path.",
            "- 250–350 words.",
          ].join('\n');
  }
}

async function draftDisputeLetter(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  channel: 'telegram' | 'whatsapp' | 'chatbot',
  params: {
    provider: string;
    issue_description: string;
    desired_outcome: string;
    issue_type: string;
    supplier_latest_message?: string;
    user_reply_brief?: string;
    reply_tone?: ReplyTone;
  },
): Promise<ToolResult> {
  // Get user's name and address for the letter
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, address, postcode, email')
    .eq('id', userId)
    .single();

  const fullName =
    profile?.full_name ??
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ??
    'Customer';

  const tone: ReplyTone = params.reply_tone ?? 'auto';
  const supplierMsg = (params.supplier_latest_message || '').trim();
  const userBrief = (params.user_reply_brief || '').trim();
  const hasSupplierContext = supplierMsg.length > 0;
  const isReply = hasSupplierContext || userBrief.length > 0;
  const likeForLikeMode = userBrief.length > 0;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  void anthropic; // legacy fallback path retained as dead code below

  const likeForLikeBlock = [
    `LIKE-FOR-LIKE MODE (overrides tone length targets and any instruction to add substantive content).`,
    `The user has told you exactly what they want the reply to say. Your job is to render THOSE WORDS as a short, polite, professional business letter — nothing more.`,
    `- Treat the user's brief as the ENTIRE content of the reply. Do not add points, arguments, deadlines, law citations, escalation paths, or outcomes the user didn't mention.`,
    `- Do not re-narrate the complaint history. Do not restate the original issue. Do not "set the record straight".`,
    `- Do not invent availability, dates, preferences, figures, or facts not in the brief.`,
    `- Length is dictated by the brief — if they said one sentence, the body is one short paragraph. Ignore any word-count target from the tone rules.`,
    `- You may: (1) add a one-line courteous opener acknowledging their message, (2) polish grammar / phrasing into business English, (3) add a short courteous closing line (e.g. "Please confirm and I'll keep the slot free.").`,
    `- You may NOT: reframe the user's point, expand it, soften or harden its substance, or layer in extra asks the user didn't make.`,
    `- If the user asked to be firmer/softer via tone, adjust WORDING only — not substance.`,
  ].join('\n');

  const letterPrompt = [
    isReply
      ? `Write a UK consumer's REPLY to ${params.provider}.`
      : `Write a professional complaint letter from a UK consumer to ${params.provider}.`,
    ``,
    `Customer name: ${fullName}`,
    `Customer address: ${profile?.address ?? '[Address]'}, ${profile?.postcode ?? '[Postcode]'}`,
    `Today's date: ${today}`,
    `Underlying issue (background — do NOT re-narrate unless the tone rules say to): ${params.issue_description}`,
    `Desired outcome: ${params.desired_outcome}`,
    `Letter type: ${params.issue_type.replace(/_/g, ' ')}`,
    ``,
    hasSupplierContext
      ? `Supplier's latest message (the one we are replying to):\n"""\n${supplierMsg.slice(0, 4000)}\n"""`
      : `(No prior supplier message — this is a fresh letter.)`,
    ``,
    likeForLikeMode
      ? `WHAT THE USER WANTS THIS REPLY TO SAY (this IS the letter — render it, don't rewrite it):\n"""\n${userBrief}\n"""`
      : ``,
    ``,
    likeForLikeMode ? likeForLikeBlock : ``,
    ``,
    toneGuidance(tone, hasSupplierContext),
    ``,
    `Hard rules (apply regardless of tone):`,
    `- Start with "Dear ${params.provider} Customer Services," and end with "Yours sincerely,\\n${fullName}".`,
    `- UK English. Sounds like an intelligent human wrote it, not a template.`,
    `- Where the supplier asked for specific details (account number, address, DOB) and the user didn't provide them, use square-bracket placeholders (e.g. "[account number]") rather than inventing them.`,
    `- If the user_reply_brief specifies facts (e.g. "any day except Friday"), use those facts verbatim. Do not add availability, dates, or details the user didn't give.`,
    `- Keep the original reference number / ticket ID if it's in the supplier's message.`,
    `- Never include a subject line. The letter body only.`,
    `- Never use bullet points, headings, or CAPS.`,
    likeForLikeMode
      ? `- LIKE-FOR-LIKE MODE IS ACTIVE: if anything in the tone rules above tells you to add content, hit a word count, cite law, or set a deadline, IGNORE IT. The user's brief is the letter.`
      : ``,
  ].filter(Boolean).join('\n');

  // ARCHITECTURAL RULE — every dispute reply (and every initial complaint
  // letter) MUST be grounded in verified UK statute citations from the
  // legal_references table. Plain-prose replies are a product failure.
  // Route through the unified engine in src/lib/agents/dispute-reply-engine.ts.
  // The only exception is LIKE-FOR-LIKE mode where the user has dictated
  // the exact reply text — there, citations would distort their intent,
  // so we keep the local prompt path that respects the brief verbatim.
  let letterText: string;
  if (likeForLikeMode) {
    const letterResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1400,
      messages: [{ role: 'user', content: letterPrompt }],
    });
    letterText = letterResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  } else {
    const toneForEngine: 'friendly' | 'balanced' | 'firm' | 'auto' =
      tone === 'friendly' || tone === 'balanced' || tone === 'firm' ? tone : 'auto';
    const unified = await generateDisputeReply(getAdmin(), {
      providerName: params.provider,
      customerName: fullName,
      customerAddress: [profile?.address, profile?.postcode].filter(Boolean).join(', ') || null,
      issueSummary: params.issue_description,
      desiredOutcome: params.desired_outcome,
      issueType: params.issue_type ?? null,
      providerType: null,
      supplierLatestMessage: hasSupplierContext ? supplierMsg : null,
      lastOutboundLetter: null,
      userTweakBrief: userBrief || null,
      tone: toneForEngine,
      userId,
      surface: channel,
    });
    letterText = unified.letter;
  }

  const pendingAction: PendingAction = {
    type: 'dispute_letter',
    provider: params.provider,
    issue_description: params.issue_description,
    desired_outcome: params.desired_outcome,
    issue_type: params.issue_type,
    letter_text: letterText,
  };

  // Track this draft in pending_dispute_letters so the 1-hour follow-up
  // cron can ping the user if they neither SAVE nor DISCARD it. Without
  // this row the draft just rots — Paul flagged 2026-04-29 that users
  // copy + email + forget to come back to the bot.
  // Resolve the active dispute (skip if there isn't one yet — the
  // letter might be for a brand-new complaint that hasn't been
  // logged as a dispute yet).
  try {
    const resolved = await resolveActiveDisputeForBot(supabase, userId, params.provider);
    if (resolved.ok) {
      // Mark any older pending draft for the same dispute as discarded
      // so we only ever track the LATEST iteration.
      await supabase
        .from('pending_dispute_letters')
        .update({ status: 'discarded', resolved_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('dispute_id', resolved.dispute.id)
        .eq('status', 'pending');

      const followupDue = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await supabase.from('pending_dispute_letters').insert({
        user_id: userId,
        dispute_id: resolved.dispute.id,
        letter_text: letterText,
        letter_title: isReply
          ? `Reply to ${params.provider} (${tone})`
          : `Complaint to ${params.provider} (${tone})`,
        channel,
        followup_due_at: followupDue.toISOString(),
      });
    }
  } catch (err) {
    console.warn('[draftDisputeLetter] pending_dispute_letters insert failed', err);
    // Non-fatal — letter still drafted, just won't get a follow-up.
  }

  // text = HEADER ONLY. The letter body lives in pendingAction.letter_text
  // and the bot caller sends it separately. Previously they were
  // concatenated and WhatsApp double-sent (Paul reported 2026-04-29).
  // The header now ENDS with an explicit save/discard prompt because
  // users were drafting + emailing + forgetting to come back — relying
  // on them to remember to type "I've sent it" was unreliable. The
  // bot follows up an hour later if they don't reply, but this opening
  // CTA primes them.
  const header = isReply
    ? `*Draft reply to ${params.provider}* _(${tone} tone)_ — review below.\n\n` +
      `📤 *When you've sent it via email, reply SAVE* and I'll log it on the dispute timeline + start the 14-day clock.\n` +
      `🔄 Want changes? Reply with what to tweak (e.g. "make it firmer", "add the £85").\n` +
      `🗑 Reply DISCARD to drop this draft.`
    : `*Draft letter for ${params.provider}* _(${tone} tone)_ — review below.\n\n` +
      `📤 *When you've sent it via email, reply SAVE* and I'll log it on the dispute timeline + start the 14-day clock.\n` +
      `🔄 Want changes? Reply with what to tweak.\n` +
      `🗑 Reply DISCARD to drop this draft.`;

  return {
    text: header,
    pendingAction,
  };
}

async function searchLegalRights(
  supabase: ReturnType<typeof getAdmin>,
  category: string | undefined,
  query: string,
): Promise<ToolResult> {
  let dbQuery = supabase
    .from('legal_references')
    .select('law_name, section, summary, escalation_body, strength')
    .eq('verification_status', 'current')
    .order('strength', { ascending: false })
    .limit(5);

  if (category) {
    dbQuery = dbQuery.or(`category.ilike.*${category}*,subcategory.ilike.*${category}*`);
  }

  // Text search in summary
  if (query) {
    dbQuery = dbQuery.or(
      `summary.ilike.*${query}*,law_name.ilike.*${query}*,applies_to.cs.{${query}}`,
    );
  }

  const { data, error } = await dbQuery;

  if (error || !data || data.length === 0) {
    return {
      text: `No specific legislation found for "${query}". However, in the UK your key consumer rights come from the Consumer Rights Act 2015 (goods/services), Consumer Credit Act 1974 (credit/finance), and sector regulators like Ofgem (energy) and Ofcom (telecoms). Ask me to draft a complaint letter and I'll cite the most relevant laws automatically.`,
    };
  }

  const strengthLabel: Record<string, string> = {
    strong: '💪 Strong',
    moderate: '⚖️ Moderate',
    weak: '⚠️ Limited',
  };

  let text = `*Your Legal Rights — "${query}"*\n\n`;
  for (const ref of data) {
    text += `${strengthLabel[ref.strength] ?? '⚖️'} *${ref.law_name}*`;
    if (ref.section) text += ` (${ref.section})`;
    text += `\n${ref.summary}`;
    if (ref.escalation_body) text += `\nEscalate to: ${ref.escalation_body}`;
    text += '\n\n';
  }

  return { text: text.trim() };
}

// ============================================================
// WRITE HANDLERS
// ============================================================

async function recategoriseTransactions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  merchantName: string,
  newCategory: string,
): Promise<ToolResult> {
  // Update user_category, which is our internal system rule
  const { data, error } = await supabase
    .from('bank_transactions')
    .update({ user_category: newCategory })
    .eq('user_id', userId)
    .or(`merchant_name.ilike.%${merchantName}%,description.ilike.%${merchantName}%`)
    .select('id, amount, description, merchant_name');

  if (error) {
    return { text: `Failed to recategorise: ${error.message}` };
  }

  const count = data?.length ?? 0;
  if (count === 0) {
    return { text: `No transactions found matching "${merchantName}". Check the spelling or try a shorter name.` };
  }

  // Push to learning engine so it autonomously remembers for future syncs!
  try {
    const { learnFromCorrection } = await import('@/lib/learning-engine');
    // We only need to learn once per merchant batch
    const sample = data[0]; 
    await learnFromCorrection({
      rawName: sample.description || sample.merchant_name || merchantName,
      displayName: merchantName,
      category: newCategory,
      amount: sample.amount,
      userId: userId,
    });
  } catch (err: any) {
    console.error('[UserBot] Error pushing to learning engine:', err.message);
  }

  return { text: `Recategorised ${count} transaction${count !== 1 ? 's' : ''} matching "${merchantName}" to "${newCategory}". Future transactions from this merchant will also be categorised as "${newCategory}".` };
}

async function setBudget(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  category: string,
  monthlyLimit: number,
): Promise<ToolResult> {
  const { error } = await supabase.from('money_hub_budgets').upsert(
    {
      user_id: userId,
      category,
      monthly_limit: monthlyLimit,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category' },
  );

  if (error) {
    return { text: `Failed to set budget: ${error.message}` };
  }

  return { text: `Budget set: ${category} — ${fmt(monthlyLimit)}/month. I'll alert you if you go over this limit.` };
}

async function deleteBudget(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  category: string,
): Promise<ToolResult> {
  const { error, count } = await supabase
    .from('money_hub_budgets')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('category', category);

  if (error) {
    return { text: `Failed to delete budget: ${error.message}` };
  }

  if (!count || count === 0) {
    return { text: `No budget found for "${category}".` };
  }

  return { text: `Budget removed for "${category}".` };
}

async function recategoriseSubscription(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  providerName: string,
  newCategory: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ category: newCategory })
    .eq('user_id', userId)
    .ilike('provider_name', `%${providerName}%`)
    .eq('status', 'active')
    .select('provider_name');

  if (error) {
    return { text: `Failed to recategorise subscription: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return { text: `No active subscription found matching "${providerName}".` };
  }

  const names = data.map(s => s.provider_name).join(', ');
  return { text: `Recategorised ${data.length} subscription${data.length !== 1 ? 's' : ''} (${names}) to "${newCategory}".` };
}

async function addSubscription(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider_name: string; amount: number; billing_cycle: string; category: string },
): Promise<ToolResult> {
  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    provider_name: params.provider_name,
    amount: params.amount,
    billing_cycle: params.billing_cycle,
    category: params.category,
    status: 'active',
  });

  if (error) {
    return { text: `Failed to add subscription: ${error.message}` };
  }

  const cycle = params.billing_cycle;
  const annual = params.amount * (cycle === 'monthly' ? 12 : cycle === 'quarterly' ? 4 : 1);
  return { text: `Subscription added: ${params.provider_name} — ${fmt(params.amount)}/${cycle} (${fmt(annual)}/year). Category: ${params.category}.` };
}

async function cancelSubscription(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  providerName: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .ilike('provider_name', `%${providerName}%`)
    .eq('status', 'active')
    .select('provider_name, amount, billing_cycle');

  if (error) {
    return { text: `Failed to cancel subscription: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return { text: `No active subscription found matching "${providerName}".` };
  }

  const sub = data[0];
  const cycle = sub.billing_cycle ?? 'monthly';
  const annual = Number(sub.amount) * (cycle === 'monthly' ? 12 : cycle === 'quarterly' ? 4 : 1);
  return { text: `Marked ${sub.provider_name} as cancelled (${fmt(sub.amount)}/${cycle}). That's ${fmt(annual)}/year saved. Note: this updates your tracking only — you still need to cancel directly with ${sub.provider_name}. Want me to draft a cancellation email?` };
}

// ============================================================
// OVERVIEW HANDLER
// ============================================================

async function getFinancialOverview(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1).toISOString();
  const monthEnd = new Date(year, month, 1).toISOString();

  const scope = await loadBotSpace(supabase, userId);

  // Two code paths: (1) default scope uses the same RPCs as Money Hub for
  // authoritative totals. (2) Space-scoped calls fetch the month's raw
  // transactions, filter to the Space, then apply the same transfer
  // exclusions the RPC would.
  let totalIncome = 0;
  let totalSpending = 0;
  let topCats: [string, number][] = [];

  const sharedPromises = [
    supabase.from('subscriptions').select('amount, billing_cycle, category', { count: 'exact' })
      .eq('user_id', userId).eq('status', 'active').is('dismissed_at', null),
    supabase.from('disputes').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).not('status', 'in', '("resolved","dismissed")'),
    supabase.from('bank_connections').select('id, bank_name, status', { count: 'exact' })
      .eq('user_id', userId).is('deleted_at', null),
    supabase.from('money_hub_budgets').select('category, monthly_limit')
      .eq('user_id', userId),
    supabase.from('verified_savings').select('amount_saved, annual_saving')
      .eq('user_id', userId),
  ] as const;

  if (scope.isDefault) {
    const [subs, disputes, banks, budgets, savings, incomeRes, spendRes, breakdownRes] = await Promise.all([
      ...sharedPromises,
      supabase.rpc('get_monthly_income_total', { p_user_id: userId, p_year: year, p_month: month }),
      supabase.rpc('get_monthly_spending_total', { p_user_id: userId, p_year: year, p_month: month }),
      supabase.rpc('get_monthly_spending', { p_user_id: userId, p_year: year, p_month: month }),
    ]);
    totalIncome = Number(incomeRes.data ?? 0);
    totalSpending = Number(spendRes.data ?? 0);
    type BreakdownRow = { category: string; category_total: string };
    topCats = ((breakdownRes.data as BreakdownRow[]) ?? [])
      .map((r) => [r.category, Number(r.category_total) || 0] as [string, number])
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return renderOverview({
      subs, disputes, banks, budgets, savings,
      totalIncome, totalSpending, topCats,
      scope, monthLabel: new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    });
  }

  // Space-scoped path.
  let txQuery = supabase
    .from('bank_transactions')
    .select('amount, user_category, income_type, category, connection_id, account_id')
    .eq('user_id', userId)
    .gte('timestamp', monthStart)
    .lt('timestamp', monthEnd);
  txQuery = applyTxSpaceFilter(txQuery, scope);

  const [subs, disputes, banks, budgets, savings, txRes] = await Promise.all([
    ...sharedPromises,
    txQuery,
  ]);

  const catTotals: Record<string, number> = {};
  for (const t of (txRes.data ?? []) as Array<{ amount: number; user_category: string | null; income_type: string | null; category: string | null }>) {
    if (isTransferLike(t)) continue;
    const amt = Number(t.amount);
    if (amt > 0) {
      totalIncome += amt;
    } else if (amt < 0) {
      if (t.user_category === 'income') continue;
      totalSpending += -amt;
      const cat = t.user_category || 'other';
      catTotals[cat] = (catTotals[cat] ?? 0) + -amt;
    }
  }
  topCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a).slice(0, 5);

  return renderOverview({
    subs, disputes, banks, budgets, savings,
    totalIncome, totalSpending, topCats,
    scope, monthLabel: new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  });
}

function renderOverview(args: {
  subs: { data: Array<{ amount: string | number; billing_cycle: string }> | null; count: number | null };
  disputes: { count: number | null };
  banks: { data: Array<{ id: string; bank_name: string | null; status: string }> | null };
  budgets: { data: unknown[] | null };
  savings: { data: Array<{ amount_saved: string | number | null; annual_saving: string | number | null }> | null };
  totalIncome: number;
  totalSpending: number;
  topCats: [string, number][];
  scope: BotSpaceScope;
  monthLabel: string;
}): ToolResult {
  const { subs, disputes, banks, budgets, savings, totalIncome, totalSpending, topCats, scope, monthLabel } = args;

  const subsList = subs.data ?? [];
  const monthlySubsTotal = subsList.reduce((sum, s) => {
    const amt = Number(s.amount);
    if (s.billing_cycle === 'monthly') return sum + amt;
    if (s.billing_cycle === 'quarterly') return sum + amt / 3;
    if (s.billing_cycle === 'yearly') return sum + amt / 12;
    return sum;
  }, 0);

  const totalSaved = (savings.data ?? []).reduce((sum, s) => sum + Number(s.amount_saved ?? 0), 0);
  const annualSaved = (savings.data ?? []).reduce((sum, s) => sum + Number(s.annual_saving ?? 0), 0);

  // Banks count respects the active Space — same as the dashboard's
  // Accounts tile when a Space is active.
  const banksInScope = scope.connectionIds
    ? (banks.data ?? []).filter((b) => scope.connectionIds!.includes(b.id))
    : (banks.data ?? []);
  const activeBanks = banksInScope.filter((b) => b.status === 'active');

  const scopeHeader = scope.space && !scope.isDefault
    ? ` — ${scope.space.emoji ?? '📁'} ${scope.space.name}`
    : '';
  let text = `*Financial Overview — ${monthLabel}${scopeHeader}*\n\n`;

  text += `*This Month:*\n`;
  text += `• Income: *${fmt(totalIncome)}*\n`;
  text += `• Spending: *${fmt(totalSpending)}*\n`;
  text += `• Net: *${totalIncome - totalSpending >= 0 ? '+' : ''}${fmt(totalIncome - totalSpending)}*\n\n`;

  text += `*Recurring Payments:*\n`;
  text += `• ${subs.count ?? 0} active subscriptions\n`;
  text += `• Monthly total: *${fmt(monthlySubsTotal)}* (${fmt(monthlySubsTotal * 12)}/year)\n\n`;

  if (topCats.length > 0) {
    text += `*Top Spending Categories:*\n`;
    for (const [cat, total] of topCats) {
      text += `• ${cat}: ${fmt(total)}\n`;
    }
    text += '\n';
  }

  text += `*Budgets:* ${(budgets.data ?? []).length} set\n`;
  text += `*Open Disputes:* ${disputes.count ?? 0}\n`;
  text += `*Bank Connections:* ${activeBanks.length} active\n`;

  if (totalSaved > 0) {
    text += `\n*Verified Savings:*\n`;
    text += `• Total saved: *${fmt(totalSaved)}*\n`;
    if (annualSaved > 0) text += `• Annual saving: *${fmt(annualSaved)}*\n`;
  }

  return { text };
}

// ============================================================
// MONEY HUB DATA HANDLERS
// ============================================================

async function getSavingsGoals(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('money_hub_savings_goals')
    .select('goal_name, target_amount, current_amount, target_date, emoji')
    .eq('user_id', userId)
    .order('target_date', { ascending: true });

  if (error || !data || data.length === 0) {
    return { text: 'No savings goals set up. Create one at paybacker.co.uk/dashboard/money-hub' };
  }

  let text = `*Savings Goals (${data.length})*\n\n`;
  for (const g of data) {
    const target = Number(g.target_amount);
    const current = Number(g.current_amount);
    const pct = target > 0 ? Math.round((current / target) * 100) : 0;
    const emoji = g.emoji ?? '🎯';
    text += `${emoji} *${g.goal_name}*\n`;
    text += `   ${fmt(current)} / ${fmt(target)} (${pct}%)`;
    if (g.target_date) text += ` · Target: ${fmtDate(g.target_date)}`;
    text += '\n';
  }

  return { text };
}

async function getSavingsChallenges(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('user_challenges')
    .select('template_id, status, started_at, completed_at, progress')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return { text: 'No savings challenges found. Start one at paybacker.co.uk/dashboard/money-hub' };
  }

  const templateIds = [...new Set(data.map(d => d.template_id))];
  const { data: templates } = await supabase
    .from('challenge_templates')
    .select('id, name, description, target_days')
    .in('id', templateIds);

  const templateMap = new Map((templates ?? []).map(t => [t.id, t]));

  const statusEmoji: Record<string, string> = {
    active: '🔥', completed: '✅', failed: '❌', abandoned: '⚪',
  };

  let text = `*Savings Challenges (${data.length})*\n\n`;
  for (const c of data) {
    const tmpl = templateMap.get(c.template_id);
    const emoji = statusEmoji[c.status] ?? '⚪';
    text += `${emoji} *${tmpl?.name ?? 'Challenge'}* — ${c.status}\n`;
    if (tmpl?.description) text += `   ${tmpl.description}\n`;
    text += `   Started: ${fmtDate(c.started_at)}`;
    if (c.completed_at) text += ` · Completed: ${fmtDate(c.completed_at)}`;
    text += '\n';
  }

  return { text };
}

async function getBankConnections(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  // Hide revoked + expired_legacy (terminal states the user can't fix) and
  // anything soft-deleted via /api/bank/remove. Keeps the bot list in sync
  // with what Money Hub shows. When the user has scoped to a specific
  // Space, narrow the list to connections that belong to it.
  const scope = await loadBotSpace(supabase, userId);
  let query = supabase
    .from('bank_connections')
    .select('id, bank_name, status, last_synced_at, connected_at, account_display_names, consent_expires_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('status', 'in', '("revoked","expired_legacy")')
    .order('connected_at', { ascending: false });
  if (scope.connectionIds) {
    if (scope.connectionIds.length === 0) {
      return { text: `No bank connections in *${scope.space?.name ?? 'this Space'}* yet. Connect one or say "switch to everything" to see all accounts.` };
    }
    query = query.in('id', scope.connectionIds);
  }
  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return { text: 'No bank accounts connected. Connect one at paybacker.co.uk/dashboard/subscriptions' };
  }

  const statusEmoji: Record<string, string> = {
    active: '🟢', expired: '🔴', expiring_soon: '🟡', token_expired: '🔴',
  };

  const scopeTag = scope.space && !scope.isDefault ? ` — ${scope.space.emoji ?? '📁'} ${scope.space.name}` : '';
  let text = `*Bank Connections (${data.length})${scopeTag}*\n\n`;
  for (const b of data) {
    const emoji = statusEmoji[b.status] ?? '⚪';
    text += `${emoji} *${b.bank_name ?? 'Unknown Bank'}* — ${b.status.replace(/_/g, ' ')}\n`;
    if (b.account_display_names?.length) {
      text += `   Accounts: ${b.account_display_names.join(', ')}\n`;
    }
    if (b.last_synced_at) text += `   Last sync: ${fmtDate(b.last_synced_at)}`;
    if (b.consent_expires_at) text += ` · Consent expires: ${fmtDate(b.consent_expires_at)}`;
    text += '\n';
  }

  return { text };
}

/**
 * In-memory replica of get_monthly_{income,spending}_total's exclusions
 * so bot paths that can't use the RPCs (because they need a Space
 * filter) still match what Money Hub reports.
 */
export function isTransferLike(t: {
  user_category?: string | null;
  income_type?: string | null;
  category?: string | null;
}): boolean {
  const userCat = (t.user_category ?? '').toString();
  const incomeType = (t.income_type ?? '').toString();
  const rawCat = (t.category ?? '').toString().toUpperCase();
  if (rawCat === 'TRANSFER') return true;
  if (userCat === 'transfers') return true;
  // Only pure transfers are excluded. credit_loan / loan_repayment
  // contribute to income totals via migration 20260423020000 — they
  // surface as "Loan Credit" in the Money Hub UI, so dropping them
  // here would make Telegram trends diverge downward from the web.
  if (incomeType === 'transfer') return true;
  return false;
}

/**
 * Soft-delete a bank connection the user no longer wants to see —
 * typically a sandbox/test connection still showing as revoked.
 * Matches by name substring (case-insensitive) so the user can say
 * "remove the modelo connection" rather than quote a UUID.
 */
async function removeBankConnection(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  identifier: string,
): Promise<ToolResult> {
  const needle = identifier?.trim().toLowerCase();
  if (!needle) {
    return { text: "I need a bank name to remove — try e.g. 'remove the modelo connection'." };
  }

  const { data: matches } = await supabase
    .from('bank_connections')
    .select('id, bank_name, status, account_display_names')
    .eq('user_id', userId)
    .is('deleted_at', null);

  const candidates = (matches ?? []).filter((m) => {
    const name = (m.bank_name ?? '').toLowerCase();
    const accounts = (m.account_display_names ?? []).join(' ').toLowerCase();
    return name.includes(needle) || accounts.includes(needle);
  });

  if (candidates.length === 0) {
    return { text: `No connection matches "${identifier}". Try get_bank_connections to see what's connected.` };
  }
  if (candidates.length > 1) {
    const list = candidates.map((c) => `• ${c.bank_name} (${c.status})`).join('\n');
    return { text: `Multiple connections match "${identifier}":\n${list}\n\nTell me which one — e.g. include the bank name as it appears above.` };
  }

  const target = candidates[0];
  const { error } = await supabase
    .from('bank_connections')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', target.id)
    .eq('user_id', userId);

  if (error) {
    return { text: `Couldn't remove ${target.bank_name}: ${error.message}` };
  }

  return { text: `✅ Removed *${target.bank_name}* from your connections. It won't appear here or in Money Hub again.` };
}

// ============================================================
// ACCOUNT SPACES — scope-switch tools for the bot
// ============================================================

async function listSpacesTool(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const [spaces, activeScope] = await Promise.all([
    listSpaces(supabase, userId),
    loadBotSpace(supabase, userId),
  ]);

  if (spaces.length === 0) {
    return { text: 'No Spaces set up yet. Create one at paybacker.co.uk/dashboard/settings/spaces.' };
  }

  const activeId = activeScope.space?.id ?? null;
  let text = `*Money Hub Spaces (${spaces.length})*\n\n`;
  for (const s of spaces) {
    const marker = s.id === activeId ? '→ ' : '  ';
    const tag = s.is_default ? ' · default' : '';
    const scope =
      s.connection_ids.length === 0 && s.account_refs.length === 0
        ? 'all connections'
        : `${s.connection_ids.length} connection${s.connection_ids.length === 1 ? '' : 's'}${s.account_refs.length > 0 ? ` + ${s.account_refs.length} account${s.account_refs.length === 1 ? '' : 's'}` : ''}`;
    text += `${marker}${s.emoji ?? '📁'} *${s.name}*${tag}\n   ${scope}\n`;
  }
  text += `\nSay "switch to <name>" to change scope, or "switch to everything" to clear it.`;
  return { text };
}

async function setActiveSpaceTool(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  name: string,
): Promise<ToolResult> {
  if (!name?.trim()) {
    return { text: 'Which Space? Try "switch to business" or list_spaces to see what\'s available.' };
  }

  const match = await resolveSpaceByName(supabase, userId, name);
  if (match === null) {
    return { text: `I couldn't find a Space matching "${name}". Try list_spaces to see what's available.` };
  }
  if (match === 'AMBIGUOUS') {
    return { text: `"${name}" matches more than one Space. Be more specific — try list_spaces to see the full names.` };
  }

  // If the user explicitly asked for "everything" / "all" / etc., clear
  // the override so future sessions inherit the profile default. For a
  // specific Space, persist it on the session.
  const alias = ['everything', 'all', 'default', 'any', 'clear', 'reset'].includes(
    name.trim().toLowerCase(),
  );
  await setBotActiveSpace(supabase, userId, alias ? null : match.id);

  return {
    text: `✅ Scope set to ${match.emoji ?? '📁'} *${match.name}*${match.is_default ? ' (default)' : ''}. All financial answers will now reflect this Space until you switch again.`,
  };
}

async function getActiveSpaceTool(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const scope = await loadBotSpace(supabase, userId);
  if (!scope.space) {
    return { text: 'No Spaces set up yet — everything is in scope by default.' };
  }
  const tag = scope.isDefault ? ' (covers all connections)' : '';
  return {
    text: `Currently scoped to ${scope.space.emoji ?? '📁'} *${scope.space.name}*${tag}. Say "switch to <name>" to change, or list_spaces to see all options.`,
  };
}

async function getVerifiedSavings(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('verified_savings')
    .select('title, saving_type, amount_saved, annual_saving, confirmed_by, confirmed_at')
    .eq('user_id', userId)
    .order('confirmed_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    return { text: 'No verified savings yet. When you resolve a dispute or cancel a subscription, savings are tracked here automatically.' };
  }

  const totalSaved = data.reduce((sum, s) => sum + Number(s.amount_saved ?? 0), 0);
  const totalAnnual = data.reduce((sum, s) => sum + Number(s.annual_saving ?? 0), 0);

  let text = `*Verified Savings (${data.length})*\n`;
  text += `Total: *${fmt(totalSaved)}* | Annual: *${fmt(totalAnnual)}*\n\n`;

  for (const s of data) {
    const type = s.saving_type.replace(/_/g, ' ');
    text += `✅ *${s.title}*\n`;
    text += `   ${fmt(s.amount_saved)} saved · ${type}`;
    if (s.confirmed_by) text += ` · Verified: ${s.confirmed_by}`;
    text += '\n';
  }

  return { text };
}

async function getMonthlyTrends(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  months?: number,
): Promise<ToolResult> {
  const lookback = months ?? 6;
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - lookback, 1).toISOString();

  const scope = await loadBotSpace(supabase, userId);

  // Pull the same columns the get_monthly_*_total RPCs filter on so we
  // can replicate their exclusions client-side (one query is cheaper
  // than N-months × 2 RPC round-trips). Otherwise transfers + credit-loan
  // flows inflate both sides and make trends disagree with Money Hub.
  let query = supabase
    .from('bank_transactions')
    .select('amount, timestamp, category, user_category, income_type, connection_id, account_id')
    .eq('user_id', userId)
    .gte('timestamp', startDate)
    .order('timestamp', { ascending: true });
  query = applyTxSpaceFilter(query, scope);
  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    const tag = scope.space && !scope.isDefault ? ` in ${scope.space.name}` : '';
    return { text: `No transaction data found for the last ${lookback} months${tag}.` };
  }

  const monthlyData: Record<string, { income: number; spending: number }> = {};
  data.forEach((txn: any) => {
    const rawCat = (txn.category ?? '').toString().toUpperCase();
    const userCat = (txn.user_category ?? '').toString();
    const incomeType = (txn.income_type ?? '').toString();
    if (rawCat === 'TRANSFER') return;

    const m = txn.timestamp.slice(0, 7);
    const key = `${m}-01`;
    const amt = Number(txn.amount);
    if (!monthlyData[key]) monthlyData[key] = { income: 0, spending: 0 };

    if (amt > 0) {
      if (userCat === 'transfers') return;
      // Keep credit_loan / loan_repayment — the income RPC includes
      // them since migration 20260423020000; dropping them here would
      // make the bot trend short by real loan drawdowns.
      if (incomeType === 'transfer') return;
      monthlyData[key].income += amt;
    } else if (amt < 0) {
      if (userCat === 'transfers' || userCat === 'income') return;
      monthlyData[key].spending += -amt;
    }
  });

  const sorted = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));

  const scopeHeader = scope.space && !scope.isDefault ? ` — ${scope.space.emoji ?? '📁'} ${scope.space.name}` : '';
  let text = `*Monthly Trends (last ${lookback} months)${scopeHeader}*\n\n`;
  for (const [month, vals] of sorted) {
    const [y, m] = month.split('-').map(Number);
    const label = new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const net = vals.income - vals.spending;
    const netSign = net >= 0 ? '+' : '';
    text += `*${label}*\n`;
    text += `  In: ${fmt(vals.income)} | Out: ${fmt(vals.spending)} | Net: ${netSign}${fmt(net)}\n`;
  }

  return { text };
}

async function getIncomeBreakdown(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  month?: string,
): Promise<ToolResult> {
  const now = new Date();
  let year = now.getFullYear();
  let mon = now.getMonth() + 1;
  if (typeof month === 'string' && month.includes('-')) {
    const parts = month.split('-').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      year = parts[0];
      mon = parts[1];
    }
  }
  const targetMonth = `${year}-${String(mon).padStart(2, '0')}`;

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();

  const [classifiedAll, scope] = await Promise.all([
    classifyTransactions(supabase, userId, startDate, endDate),
    loadBotSpace(supabase, userId),
  ]);
  const classified = scope.isDefault
    ? classifiedAll
    : classifiedAll.filter((t) => matchesSpace(t, scope));
  const incomeTxns = classified.filter(t => t.resolved.kind === 'income');

  if (incomeTxns.length === 0) {
    const tag = scope.space && !scope.isDefault ? ` in ${scope.space.name}` : '';
    return { text: `No income found for ${targetMonth}${tag}.` };
  }

  const total = incomeTxns.reduce((sum, t) => sum + Number(t.amount), 0);

  const sources: Record<string, number> = {};
  for (const t of incomeTxns) {
    let source = t.displayName !== 'Unknown' ? t.displayName : null;
    if (!source) {
      const incType = t.resolved.incomeType || 'other';
      source = CATEGORY_LABELS[incType] || incType.charAt(0).toUpperCase() + incType.slice(1);
    }
    sources[source] = (sources[source] ?? 0) + Number(t.amount);
  }
  const sorted = Object.entries(sources).sort(([, a], [, b]) => b - a);

  const monthLabel = new Date(year, mon - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const scopeHeader = scope.space && !scope.isDefault ? ` — ${scope.space.emoji ?? '📁'} ${scope.space.name}` : '';
  let text = `*Income Breakdown — ${monthLabel}${scopeHeader}*\n`;
  text += `Total: *${fmt(total)}*\n\n`;

  for (const [source, amount] of sorted) {
    text += `• ${source}: *${fmt(amount)}*\n`;
  }

  return { text };
}

async function getDisputeDetail(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider: string,
): Promise<ToolResult> {
  // Pull every matching dispute, not just the most-recently-opened.
  // Paul reported (2026-04-29) that asking the WhatsApp bot about
  // his OneStream dispute returned the wrong one — he had a 21-Apr
  // resolved_won dispute AND a 26-Mar still-active "tree fall"
  // dispute. The previous ORDER BY created_at DESC LIMIT 1 picked
  // the resolved one (more recent created_at) and hid the active
  // one with a fresh 28-Apr supplier reply.
  //
  // New selection rule: prefer ACTIVE over resolved, and within
  // active prefer the one with the most recent activity. When more
  // than one active dispute matches, list them all so Claude can
  // ask the user which one they meant — never silently pick.
  const RESOLVED_STATUSES = new Set(['resolved_won', 'resolved_partial', 'resolved_lost', 'closed']);
  const { data: matches } = await supabase
    .from('disputes')
    .select('id, provider_name, issue_type, issue_summary, desired_outcome, status, disputed_amount, money_recovered, created_at, updated_at, last_reply_received_at')
    .eq('user_id', userId)
    .ilike('provider_name', `%${provider}%`)
    .order('created_at', { ascending: false });

  if (!matches || matches.length === 0) {
    return { text: `No dispute found matching "${provider}".` };
  }

  type DisputeRow = typeof matches[number];
  const active = matches.filter((m: DisputeRow) => !RESOLVED_STATUSES.has(m.status));
  const resolved = matches.filter((m: DisputeRow) => RESOLVED_STATUSES.has(m.status));

  // Multiple active matches — disambiguate, don't guess. Claude
  // surfaces this list to the user and asks which one they meant.
  if (active.length > 1) {
    let text = `You have ${active.length} active disputes matching "${provider}". Tell me which one you mean:\n`;
    for (const m of active) {
      const opened = fmtDate(m.created_at);
      const lastReply = m.last_reply_received_at ? fmtDate(m.last_reply_received_at) : 'no replies yet';
      const summary = (m.issue_summary || '').slice(0, 100);
      text += `\n• *${m.provider_name}* — ${m.status} · opened ${opened} · last reply ${lastReply}\n  _${summary}${(m.issue_summary || '').length > 100 ? '…' : ''}_\n`;
    }
    if (resolved.length > 0) {
      text += `\n(Also ${resolved.length} resolved match${resolved.length === 1 ? '' : 'es'} — let me know if you want one of those instead.)`;
    }
    return { text };
  }

  // Pick the active one if there's exactly one, else fall back to
  // the most-recent resolved (with an explicit note that it's
  // closed so the bot doesn't accidentally describe a closed case
  // as the current state).
  const dispute: DisputeRow = active[0] ?? resolved[0];
  const isResolvedOnly = active.length === 0;
  if (!dispute) {
    return { text: `No dispute found matching "${provider}".` };
  }

  const { data: letters } = await supabase
    .from('correspondence')
    .select('entry_type, title, content, entry_date')
    .eq('dispute_id', dispute.id)
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  let text = `*Dispute: ${dispute.provider_name}*\n`;
  if (isResolvedOnly) {
    // No active dispute — be explicit so Claude doesn't describe a
    // closed case as the current state. Mentions sibling-active
    // disputes if the user has any (impossible here by definition,
    // but keeps the language honest).
    text += `(This dispute is CLOSED — no active disputes match "${provider}". The user may want to open a new dispute or check a different provider name.)\n`;
  }
  text += `Status: ${dispute.status} · Type: ${dispute.issue_type?.replace(/_/g, ' ') ?? 'complaint'}\n`;
  text += `Opened: ${fmtDate(dispute.created_at)}`;
  if (dispute.disputed_amount) text += ` · Amount: ${fmt(dispute.disputed_amount)}`;
  if (dispute.money_recovered && Number(dispute.money_recovered) > 0) text += ` · Recovered: ${fmt(dispute.money_recovered)}`;
  text += '\n';
  if (dispute.issue_summary) text += `\n_${dispute.issue_summary}_\n`;
  if (dispute.desired_outcome) text += `Desired outcome: ${dispute.desired_outcome}\n`;

  if (letters && letters.length > 0) {
    text += `\n*Correspondence (${letters.length}):*\n`;
    // Cap each entry at 1500 chars so the bot has enough to quote the
    // supplier's actual words verbatim when the user asks "what did
    // they say". 300 was too short to be useful — Claude only saw a
    // teaser and so could only paraphrase. 1500 is generous but
    // still bounded; very long emails get truncated with an ellipsis.
    for (const l of letters) {
      text += `\n📄 *${l.title ?? l.entry_type}* — ${fmtDate(l.entry_date)}\n`;
      if (l.content) {
        const preview = l.content.length > 1500 ? l.content.slice(0, 1500) + '...' : l.content;
        text += `${preview}\n`;
      }
    }
  }

  return { text };
}

/**
 * Read the user's actual correspondence body text on a dispute, with full
 * body content (not summaries or snippets) and structured fields.
 *
 * Built 2026-04-30 after a real WhatsApp Pocket Agent regression: the
 * agent answered "what amount did I demand in my 16th letter to OneStream?"
 * by inferring ~£74 pro-rata from the company's offer numbers, when the
 * user's actual letter demanded ~£500+ driven by Ofcom Automatic
 * Compensation Scheme day rates. The agent had access to the linked
 * email thread but composed an answer from in-context summary instead
 * of reading the body.
 *
 * The fix: a dedicated tool whose description tells Claude "ALWAYS call
 * this when the user asks about content/amounts/dates from their own
 * email or letter — never infer". The system prompts (Telegram +
 * WhatsApp) carry a matching citation rule so Claude reaches for this
 * tool before composing.
 *
 * Direction maps:
 *  - 'sent'     → entry_type IN ('ai_letter', 'user_note')   (user → company)
 *  - 'received' → entry_type IN ('company_email', 'company_letter', 'company_response')
 *  - 'all'      → both, interleaved by entry_date
 *
 * Body cap: 8000 chars per message — generous enough to keep the figure /
 * deadline / cited statute, bounded to keep Claude's context manageable.
 */
const QUOTE_BODY_CHAR_CAP = 8000;
const QUOTE_DEFAULT_LIMIT = 5;
const QUOTE_MAX_LIMIT = 20;

const SENT_ENTRY_TYPES = new Set(['ai_letter', 'user_note']);
const RECEIVED_ENTRY_TYPES = new Set(['company_email', 'company_letter', 'company_response']);

async function quoteEmailFromThread(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  args: {
    provider: string;
    direction: 'sent' | 'received' | 'all';
    limit: number;
  },
): Promise<ToolResult> {
  const { provider, direction } = args;
  const limit = Math.min(Math.max(1, args.limit ?? QUOTE_DEFAULT_LIMIT), QUOTE_MAX_LIMIT);

  // Resolve dispute the same way getDisputeDetail does (active first,
  // disambiguate if multiple actives) so the bot reads from the same
  // dispute the user means.
  const RESOLVED_STATUSES = new Set(['resolved_won', 'resolved_partial', 'resolved_lost', 'closed']);
  const { data: matches } = await supabase
    .from('disputes')
    .select('id, provider_name, status, created_at')
    .eq('user_id', userId)
    .ilike('provider_name', `%${provider}%`)
    .order('created_at', { ascending: false });

  if (!matches || matches.length === 0) {
    return { text: `No dispute found matching "${provider}".` };
  }
  type DisputeRow = { id: string; provider_name: string; status: string; created_at: string };
  const active = (matches as DisputeRow[]).filter((m) => !RESOLVED_STATUSES.has(m.status));
  const resolved = (matches as DisputeRow[]).filter((m) => RESOLVED_STATUSES.has(m.status));
  if (active.length > 1) {
    let text = `You have ${active.length} active disputes matching "${provider}". Tell me which one you mean before I read the thread:\n`;
    for (const m of active) {
      text += `\n• ${m.provider_name} — ${m.status} · opened ${fmtDate(m.created_at)}`;
    }
    return { text };
  }
  const dispute = active[0] ?? resolved[0];
  if (!dispute) {
    return { text: `No dispute found matching "${provider}".` };
  }

  const { data: rows } = await supabase
    .from('correspondence')
    .select('entry_type, title, content, entry_date, sender_address, sender_name')
    .eq('dispute_id', dispute.id)
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  type CorrRow = {
    entry_type: string;
    title: string | null;
    content: string | null;
    entry_date: string | null;
    sender_address: string | null;
    sender_name: string | null;
  };
  const all: CorrRow[] = (rows ?? []) as CorrRow[];
  if (all.length === 0) {
    return {
      text: `No correspondence found on the *${dispute.provider_name}* dispute. There's no linked email thread or saved letter to quote from yet.`,
    };
  }

  // Number every entry by chronological position in the thread (1 =
  // first message ever sent on this dispute) so the agent can say
  // accurately "your 16th letter" when the user references it.
  const indexed = all.map((r, idx) => ({
    row: r,
    message_index_in_thread: idx + 1,
    direction:
      SENT_ENTRY_TYPES.has(r.entry_type)
        ? ('sent' as const)
        : RECEIVED_ENTRY_TYPES.has(r.entry_type)
          ? ('received' as const)
          : ('other' as const),
  }));

  const filtered = indexed.filter((e) => {
    if (direction === 'all') return true;
    if (direction === 'sent') return e.direction === 'sent';
    if (direction === 'received') return e.direction === 'received';
    return true;
  });

  // Most-recent first, then trim to limit.
  const ordered = [...filtered].reverse().slice(0, limit);

  if (ordered.length === 0) {
    return {
      text: `No ${direction} correspondence found on the *${dispute.provider_name}* dispute. The thread has ${all.length} entr${all.length === 1 ? 'y' : 'ies'} but none in the requested direction.`,
    };
  }

  const lines: string[] = [];
  lines.push(`*Quoting from dispute: ${dispute.provider_name}*`);
  lines.push(
    `Returning ${ordered.length} of ${all.length} thread entr${all.length === 1 ? 'y' : 'ies'} (direction=${direction}, most recent first).`,
  );
  lines.push('');

  for (const e of ordered) {
    const r = e.row;
    const body = (r.content ?? '').slice(0, QUOTE_BODY_CHAR_CAP);
    const truncated = (r.content ?? '').length > QUOTE_BODY_CHAR_CAP;
    // Sender / recipient — for user-sent entries the user is the
    // sender; for company-received entries the company is. We don't
    // have a structured user-email field here so we leave the
    // counterpart side as the dispute's provider_name.
    const senderLabel =
      e.direction === 'sent'
        ? 'user'
        : (r.sender_name || r.sender_address || dispute.provider_name);
    const recipientLabel =
      e.direction === 'sent'
        ? dispute.provider_name
        : 'user';
    lines.push(
      `[entry ${e.message_index_in_thread}/${all.length}] ${fmtDate(r.entry_date)} — direction=${e.direction} — type=${r.entry_type}`,
    );
    lines.push(`subject: ${r.title ?? '(no subject)'}`);
    lines.push(`sender: ${senderLabel}`);
    lines.push(`recipient: ${recipientLabel}`);
    lines.push('body:');
    lines.push(body);
    if (truncated) {
      lines.push(`… [truncated at ${QUOTE_BODY_CHAR_CAP} chars]`);
    }
    lines.push('');
  }
  lines.push(
    'Quote VERBATIM from the body field above when answering the user. Do not infer figures, dates, or demands from offer numbers, dispute metadata, or summaries — read the body.',
  );

  return { text: lines.join('\n') };
}

// ============================================================
// EMAIL-THREAD LINKING HANDLERS (Pocket Agent feature parity)
// ============================================================
// Two tools that let WhatsApp / Telegram users link an email
// thread to a dispute from inside the chat — same flow as the
// dashboard WatchdogCard "Find thread" modal, no need to switch
// to the website. Built 2026-04-29 per Paul's request.

async function resolveActiveDisputeForBot(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider: string,
): Promise<
  | { ok: true; dispute: { id: string; provider_name: string; issue_type: string; issue_summary: string | null; created_at: string } }
  | { ok: false; text: string }
> {
  const RESOLVED = new Set(['resolved_won', 'resolved_partial', 'resolved_lost', 'closed']);
  const { data: matches } = await supabase
    .from('disputes')
    .select('id, provider_name, issue_type, issue_summary, status, created_at')
    .eq('user_id', userId)
    .ilike('provider_name', `%${provider}%`)
    .order('created_at', { ascending: false });

  if (!matches || matches.length === 0) {
    return { ok: false, text: `No dispute found matching "${provider}". Open one first via the dashboard or by asking me to "draft a complaint to ${provider}".` };
  }
  const active = matches.filter((m) => !RESOLVED.has(m.status));
  if (active.length === 0) {
    return {
      ok: false,
      text: `Your "${provider}" dispute is closed (${matches[0].status.replace(/_/g, ' ')}). Email-linking only applies to active disputes — re-open the case or open a new one if you want to attach replies.`,
    };
  }
  if (active.length > 1) {
    let t = `You have ${active.length} active disputes matching "${provider}". Which one do you want to link an email to?\n`;
    for (const m of active) t += `\n• ${m.provider_name} — opened ${fmtDate(m.created_at)}: _${(m.issue_summary || '').slice(0, 80)}${(m.issue_summary || '').length > 80 ? '…' : ''}_`;
    return { ok: false, text: t };
  }
  const d = active[0];
  return {
    ok: true,
    dispute: {
      id: d.id,
      provider_name: d.provider_name,
      issue_type: d.issue_type,
      issue_summary: d.issue_summary,
      created_at: d.created_at,
    },
  };
}

async function findEmailThreadForDispute(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider: string; query?: string },
): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, params.provider);
  if (!resolved.ok) return { text: resolved.text };
  const dispute = resolved.dispute;

  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('archived_at', null);

  if (!connections || connections.length === 0) {
    return {
      text: `No email connection on this account. Connect Gmail or Outlook in dashboard → Profile first, then ask me again. The link goes here: paybacker.co.uk/dashboard/profile`,
    };
  }

  // Reuse the same matcher the dashboard uses — keeps ranking + dedupe consistent.
  const { findThreadCandidates } = await import('@/lib/dispute-sync/matcher');
  type EmailConnectionRow = {
    id: string;
    email_address: string;
    provider_type: string;
  };
  type RawCandidate = Awaited<ReturnType<typeof findThreadCandidates>>[number];
  type Candidate = RawCandidate & { connectionId: string; inboxEmail: string };

  // Optional query keyword hint — bias the dispute summary so the
  // matcher considers the user's word (e.g. "alice", "refund").
  const disputeForMatch = params.query
    ? { ...dispute, issue_summary: `${dispute.issue_summary || ''} ${params.query}`.trim() }
    : dispute;

  const candidates: Candidate[] = [];
  for (const conn of connections as EmailConnectionRow[]) {
    try {
      const cands: RawCandidate[] = await findThreadCandidates(
        conn as Parameters<typeof findThreadCandidates>[0],
        disputeForMatch as Parameters<typeof findThreadCandidates>[1],
        5,
      );
      for (const c of cands) candidates.push({ ...c, connectionId: conn.id, inboxEmail: conn.email_address });
    } catch (err) {
      console.warn('[bot.find_email_thread] matcher failed for', conn.email_address, err);
    }
  }

  if (candidates.length === 0) {
    return {
      text: `Couldn't find any matching email threads in your inbox for "${dispute.provider_name}". Try a more specific keyword (e.g. the supplier's reply subject line, a ticket reference, or a sender's first name). Ask me again with: "find the email about [keyword] for ${dispute.provider_name}".`,
    };
  }

  // Dedupe identical hits across inboxes (sender + subject + minute) —
  // mirrors /api/email/browse-disputable so multi-Gmail users with
  // filter-forwarding don't get duplicate rows.
  type DedupedCandidate = Candidate & { inInboxes: string[] };
  const merged = new Map<string, DedupedCandidate>();
  for (const c of candidates.sort((a, b) => b.confidence - a.confidence)) {
    const key = [
      (c.senderAddress || '').toLowerCase(),
      (c.subject || '').toLowerCase().trim(),
      Math.floor(c.latestDate.getTime() / 60_000),
    ].join('|');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...c, inInboxes: [c.inboxEmail] });
    } else if (!existing.inInboxes.includes(c.inboxEmail)) {
      existing.inInboxes.push(c.inboxEmail);
    }
  }

  const top = Array.from(merged.values())
    .sort((a, b) => b.confidence - a.confidence || b.latestDate.getTime() - a.latestDate.getTime())
    .slice(0, 5);

  let text = `Found ${top.length} matching email thread${top.length === 1 ? '' : 's'} for *${dispute.provider_name}*. Pick one and I'll link it:\n`;
  top.forEach((c, i) => {
    const dateStr = c.latestDate.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    text += `\n${i + 1}. *${c.subject || '(no subject)'}*`;
    text += `\n   from ${c.senderAddress || 'unknown'} · ${dateStr} · ${c.messageCount} msg${c.messageCount === 1 ? '' : 's'} · ${Math.round(c.confidence * 100)}% match`;
    if (c.inInboxes.length > 0) text += `\n   in ${c.inInboxes.join(' · ')}`;
    if (c.snippet) text += `\n   _${c.snippet.slice(0, 120)}${c.snippet.length > 120 ? '…' : ''}_`;
    // Tool-result metadata Claude must echo back into link_email_thread_to_dispute.
    text += `\n   [connection_id=${c.connectionId} thread_id=${c.threadId} provider_type=${c.provider}]`;
  });
  text += `\n\nReply with the number (1-${top.length}) or say "link the one from contact@nuki.io" and I'll attach it. The body imports immediately after linking.`;
  return { text };
}

async function linkEmailThreadToDispute(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider: string;
    connectionId: string;
    threadId: string;
    providerType: 'gmail' | 'outlook' | 'imap';
    subject?: string;
    senderAddress?: string;
  },
): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, params.provider);
  if (!resolved.ok) return { text: resolved.text };
  const dispute = resolved.dispute;

  // Plan-limit check — same gate the dashboard uses.
  const { checkWatchdogLinkLimit } = await import('@/lib/plan-limits');
  const limitCheck = await checkWatchdogLinkLimit(userId);
  if (!limitCheck.allowed) {
    return {
      text: `Your ${limitCheck.tier} plan is at the cap of ${limitCheck.limit} linked thread${limitCheck.limit === 1 ? '' : 's'}. Either unlink an older one or upgrade to link more: paybacker.co.uk/pricing`,
    };
  }

  // Verify ownership of the email connection.
  const { data: conn } = await supabase
    .from('email_connections')
    .select('*')
    .eq('id', params.connectionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!conn) {
    return { text: `That email connection doesn't belong to your account. Run find_email_thread_for_dispute again to get fresh candidates.` };
  }

  // Disable any previously-linked thread for this dispute so only
  // one is active at a time (same rule the dashboard enforces).
  await supabase
    .from('dispute_watchdog_links')
    .update({ sync_enabled: false, updated_at: new Date().toISOString() })
    .eq('dispute_id', dispute.id)
    .eq('user_id', userId)
    .eq('sync_enabled', true);

  const senderDomain =
    params.senderAddress && params.senderAddress.includes('@')
      ? params.senderAddress.split('@')[1].toLowerCase()
      : null;

  const { data: linkRow, error: linkErr } = await supabase
    .from('dispute_watchdog_links')
    .upsert(
      {
        dispute_id: dispute.id,
        user_id: userId,
        email_connection_id: params.connectionId,
        provider: params.providerType,
        thread_id: params.threadId,
        subject: params.subject ?? null,
        sender_domain: senderDomain,
        sender_address: params.senderAddress ?? null,
        sync_enabled: true,
        match_source: 'user_confirmed',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider,thread_id' },
    )
    .select()
    .single();

  if (linkErr || !linkRow) {
    console.error('[bot.link_email_thread] insert failed', linkErr);
    return { text: `Couldn't save the link: ${linkErr?.message || 'unknown error'}. Try linking from the dashboard's Watchdog card instead.` };
  }

  // Initial sync — pull the thread history so the body imports
  // immediately. Mirrors the dashboard endpoint's behaviour.
  let imported = 0;
  try {
    const { fetchNewMessages } = await import('@/lib/dispute-sync/fetchers');
    type EmailConnectionRow = Parameters<typeof fetchNewMessages>[0];
    const messages = await fetchNewMessages(conn as EmailConnectionRow, params.threadId, null);
    for (const m of messages) {
      const { error } = await supabase.from('correspondence').insert({
        dispute_id: dispute.id,
        user_id: userId,
        entry_type: 'company_email',
        title: m.subject || null,
        content: m.body,
        summary: m.snippet,
        sender_address: m.fromAddress,
        sender_name: m.fromName || null,
        supplier_message_id: m.messageId,
        detected_from_email: true,
        email_thread_id: linkRow.id,
        entry_date: m.receivedAt.toISOString(),
      });
      if (!error) imported++;
    }
    if (messages.length > 0) {
      await supabase
        .from('dispute_watchdog_links')
        .update({
          last_synced_at: new Date().toISOString(),
          last_message_date: messages[messages.length - 1].receivedAt.toISOString(),
        })
        .eq('id', linkRow.id);
    }
  } catch (err) {
    console.warn('[bot.link_email_thread] initial sync failed', err);
    // Non-fatal — link is saved; cron will pick up on next pass.
  }

  let text = `✅ Linked the *${params.subject || 'email thread'}* to your *${dispute.provider_name}* dispute.\n`;
  if (imported > 0) {
    text += `Imported ${imported} message${imported === 1 ? '' : 's'} into the dispute history just now. New replies will auto-sync going forward — I'll alert you here when they land.`;
  } else {
    text += `Couldn't pull the messages immediately, but the watchdog will sync on its next cron run (within 30 min) and you'll see them in the dispute timeline.`;
  }
  return { text };
}

async function recordLetterSent(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider: string; letterText: string; title?: string },
): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, params.provider);
  if (!resolved.ok) return { text: resolved.text };
  const dispute = resolved.dispute;

  if (!params.letterText || params.letterText.trim().length < 80) {
    return {
      text: `That letter looks incomplete (under 80 chars). Re-paste the full letter you sent and I'll save it.`,
    };
  }

  const today = new Date();
  const titleStamp = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const title = params.title?.trim() || `AI letter sent ${titleStamp}`;

  const { error: insertErr } = await supabase.from('correspondence').insert({
    dispute_id: dispute.id,
    user_id: userId,
    entry_type: 'ai_letter',
    title,
    content: params.letterText,
    summary: params.letterText.slice(0, 200),
    entry_date: today.toISOString(),
    detected_from_email: false,
  });
  if (insertErr) {
    console.error('[recordLetterSent] insert failed', insertErr);
    return { text: `Couldn't save the letter to the dispute history: ${insertErr.message}` };
  }

  // Bump status only if currently open — don't overwrite a real
  // mid-flight state like 'escalated' or 'ombudsman'.
  let statusNote = '';
  if (dispute.id) {
    const { data: current } = await supabase
      .from('disputes')
      .select('status')
      .eq('id', dispute.id)
      .single();
    if (current?.status === 'open') {
      await supabase
        .from('disputes')
        .update({
          status: 'awaiting_response',
          last_letter_sent_at: today.toISOString(),
          last_reminder_sent: null, // reset dedup window so the 14d nudge fires from today, not from the prior reminder
          updated_at: today.toISOString(),
        })
        .eq('id', dispute.id);
      statusNote = ' Status flipped to awaiting_response — the watchdog will alert you here when they reply.';
    } else {
      // Status already past 'open' (e.g. awaiting_response, escalated).
      // Still stamp last_letter_sent_at so the reminder clock resets.
      await supabase
        .from('disputes')
        .update({
          last_letter_sent_at: today.toISOString(),
          last_reminder_sent: null,
          updated_at: today.toISOString(),
        })
        .eq('id', dispute.id);
    }
  }

  // Resolve any matching pending_dispute_letters row so the
  // follow-up cron stops nagging the user about this one.
  await supabase
    .from('pending_dispute_letters')
    .update({ status: 'saved', resolved_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('dispute_id', dispute.id)
    .eq('status', 'pending');

  // Compute the exact 14-day deadline so the user knows when to
  // expect a nudge if there's no reply.
  const deadlineDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  const deadlineStr = deadlineDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return {
    text:
      `✅ Saved the letter to your *${dispute.provider_name}* dispute timeline (entry: "${title}").${statusNote} ` +
      `\n\n⏰ I'll ping you on *${deadlineStr}* (14 days) if there's no reply yet — at that point you can escalate to the ombudsman. ` +
      `If they reply via email sooner and the inbox is linked, you'll get an alert here within minutes.`,
  };
}

async function discardLetterDraft(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider: string; reason?: string },
): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, params.provider);
  if (!resolved.ok) return { text: resolved.text };
  const dispute = resolved.dispute;

  const { data: discarded } = await supabase
    .from('pending_dispute_letters')
    .update({ status: 'discarded', resolved_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('dispute_id', dispute.id)
    .eq('status', 'pending')
    .select('id, letter_title');

  if (!discarded || discarded.length === 0) {
    return {
      text: `No pending drafts found for *${dispute.provider_name}*. If you want to start a new draft, ask me to "draft a complaint to ${dispute.provider_name}".`,
    };
  }

  return {
    text:
      `🗑 Discarded ${discarded.length} pending draft${discarded.length === 1 ? '' : 's'} for *${dispute.provider_name}*.` +
      (params.reason ? ` Logged: "${params.reason}"` : '') +
      `\n\nIf you want a fresh version with a different angle, just ask — e.g. "draft a polite reply" or "write something firmer".`,
  };
}

// ============================================================
// ALERT PREFERENCE HANDLERS
// ============================================================

const PREF_LABELS: Record<string, string> = {
  morning_summary: 'Morning briefing (7:30am)',
  evening_summary: 'Evening wrap-up (8pm)',
  proactive_alerts: 'Proactive alerts (all)',
  price_increase_alerts: 'Price increase alerts',
  contract_expiry_alerts: 'Contract expiry alerts',
  budget_overrun_alerts: 'Budget overrun alerts',
  renewal_reminders: 'Renewal reminders',
  dispute_followups: 'Dispute follow-ups',
};

async function updateAlertPreferences(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const validFields = [
    'morning_summary', 'evening_summary', 'proactive_alerts',
    'price_increase_alerts', 'contract_expiry_alerts', 'budget_overrun_alerts',
    'renewal_reminders', 'dispute_followups', 'quiet_start', 'quiet_end',
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changes: string[] = [];

  for (const field of validFields) {
    if (field in input && input[field] !== undefined) {
      updates[field] = input[field];
      if (typeof input[field] === 'boolean') {
        changes.push(`${PREF_LABELS[field] ?? field}: ${input[field] ? '✅ On' : '❌ Off'}`);
      } else {
        changes.push(`${field.replace(/_/g, ' ')}: ${input[field]}`);
      }
    }
  }

  if (changes.length === 0) {
    return { text: 'No preferences specified to update. Tell me which alerts you want to turn on or off.' };
  }

  const { error } = await supabase.from('telegram_alert_preferences').upsert(
    { user_id: userId, ...updates },
    { onConflict: 'user_id' },
  );

  if (error) {
    return { text: `Failed to update preferences: ${error.message}` };
  }

  let text = `*Alert preferences updated:*\n\n`;
  for (const change of changes) {
    text += `• ${change}\n`;
  }
  text += `\nYou can change these any time — just ask me.`;

  return { text };
}

async function getAlertPreferences(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data } = await supabase
    .from('telegram_alert_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  const prefs = data ?? {
    morning_summary: true,
    evening_summary: true,
    proactive_alerts: true,
    price_increase_alerts: true,
    contract_expiry_alerts: true,
    budget_overrun_alerts: true,
    renewal_reminders: true,
    dispute_followups: true,
    quiet_start: null,
    quiet_end: null,
  };

  let text = `*Your Alert Preferences*\n\n`;
  text += `*Summaries:*\n`;
  text += `• Morning briefing (7:30am): ${prefs.morning_summary ? '✅ On' : '❌ Off'}\n`;
  text += `• Evening wrap-up (8pm): ${prefs.evening_summary ? '✅ On' : '❌ Off'}\n\n`;

  text += `*Proactive Alerts:*\n`;
  text += `• All alerts: ${prefs.proactive_alerts ? '✅ On' : '❌ Off'}\n`;
  if (prefs.proactive_alerts) {
    text += `  • Price increases: ${prefs.price_increase_alerts ? '✅' : '❌'}\n`;
    text += `  • Contract expiry: ${prefs.contract_expiry_alerts ? '✅' : '❌'}\n`;
    text += `  • Budget overruns: ${prefs.budget_overrun_alerts ? '✅' : '❌'}\n`;
    text += `  • Renewal reminders: ${prefs.renewal_reminders ? '✅' : '❌'}\n`;
    text += `  • Dispute follow-ups: ${prefs.dispute_followups ? '✅' : '❌'}\n`;
  }

  if (prefs.quiet_start && prefs.quiet_end) {
    text += `\n*Quiet Hours:* ${prefs.quiet_start} — ${prefs.quiet_end}`;
  } else {
    text += `\n*Quiet Hours:* Not set`;
  }

  text += `\n\nTo change any of these, just tell me — e.g. "turn off budget alerts" or "set quiet hours 10pm to 7am"`;

  return { text };
}

// ============================================================
// SAVINGS GOAL HANDLERS
// ============================================================

async function createSavingsGoal(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { goal_name: string; target_amount: number; target_date?: string; emoji?: string },
): Promise<ToolResult> {
  const { error } = await supabase.from('money_hub_savings_goals').insert({
    user_id: userId,
    goal_name: params.goal_name,
    target_amount: params.target_amount,
    current_amount: 0,
    target_date: params.target_date ?? null,
    emoji: params.emoji ?? '🎯',
  });

  if (error) {
    return { text: `Failed to create savings goal: ${error.message}` };
  }

  const emoji = params.emoji ?? '🎯';
  let text = `Savings goal created: ${emoji} *${params.goal_name}* — target ${fmt(params.target_amount)}`;
  if (params.target_date) text += ` by ${fmtDate(params.target_date)}`;
  text += `.\n\nIt's now live in your Money Hub dashboard. Tell me "I saved £X towards my ${params.goal_name}" any time to update progress.`;

  return { text };
}

async function updateSavingsGoal(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { goal_name: string; amount_saved?: number; add_amount?: number },
): Promise<ToolResult> {
  if (params.amount_saved === undefined && params.add_amount === undefined) {
    return { text: `Please specify either amount_saved (set to a value) or add_amount (add to current total).` };
  }

  const { data: goal, error: fetchError } = await supabase
    .from('money_hub_savings_goals')
    .select('id, goal_name, target_amount, current_amount, emoji')
    .eq('user_id', userId)
    .ilike('goal_name', `%${params.goal_name}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !goal) {
    return { text: `No savings goal found matching "${params.goal_name}". Use get_savings_goals to see your goals.` };
  }

  const newAmount =
    params.amount_saved !== undefined
      ? params.amount_saved
      : Number(goal.current_amount) + params.add_amount!;

  const { error } = await supabase
    .from('money_hub_savings_goals')
    .update({ current_amount: newAmount, updated_at: new Date().toISOString() })
    .eq('id', goal.id);

  if (error) {
    return { text: `Failed to update savings goal: ${error.message}` };
  }

  const target = Number(goal.target_amount);
  const pct = target > 0 ? Math.round((newAmount / target) * 100) : 0;
  const emoji = goal.emoji ?? '🎯';
  let text = `${emoji} *${goal.goal_name}* updated: ${fmt(newAmount)} / ${fmt(target)} (${pct}%)`;
  if (newAmount >= target) {
    text += `\n\n🎉 Goal reached! Well done!`;
  } else {
    text += `\n${fmt(target - newAmount)} still to go.`;
  }

  return { text };
}

// ============================================================
// TASK HANDLER
// ============================================================

async function createTask(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { title: string; description: string; priority: string },
): Promise<ToolResult> {
  const { error } = await supabase.from('tasks').insert({
    user_id: userId,
    type: 'other',
    title: params.title,
    description: params.description,
    priority: params.priority,
    status: 'pending_review',
  });

  if (error) {
    return { text: `Failed to create task: ${error.message}` };
  }

  return { text: `Task created: *${params.title}* (${params.priority} priority). View and manage it in your Paybacker dashboard.` };
}

// ============================================================
// DISPUTE STATUS HANDLER
// ============================================================

async function updateDisputeStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider: string; new_status: string; notes?: string; money_recovered?: number; provider_response?: string; draft_reply?: string },
): Promise<ToolResult> {
  const { data: dispute, error: fetchError } = await supabase
    .from('disputes')
    .select('id, provider_name, status, issue_type')
    .eq('user_id', userId)
    .ilike('provider_name', `%${params.provider}%`)
    .not('status', 'in', '("resolved_won","resolved_partial","resolved_lost","closed")')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !dispute) {
    return { text: `No open dispute found matching "${params.provider}". Use get_disputes to see all disputes.` };
  }

  const updates: Record<string, unknown> = {
    status: params.new_status,
    updated_at: new Date().toISOString(),
  };
  if (params.notes) updates.outcome_notes = params.notes;
  if (params.money_recovered !== undefined) updates.money_recovered = params.money_recovered;

  const isResolved = ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed'].includes(params.new_status);
  if (isResolved) updates.resolved_at = new Date().toISOString();

  const { error } = await supabase.from('disputes').update(updates).eq('id', dispute.id);

  if (error) {
    return { text: `Failed to update dispute: ${error.message}` };
  }

  if (params.provider_response) {
    await supabase.from('correspondence').insert({
      dispute_id: dispute.id,
      user_id: userId,
      entry_type: 'company_response',
      title: `Response from ${dispute.provider_name}`,
      content: params.provider_response,
    });
  }

  if (params.draft_reply) {
    await supabase.from('correspondence').insert({
      dispute_id: dispute.id,
      user_id: userId,
      entry_type: 'ai_letter',
      title: `Draft Reply to ${dispute.provider_name}`,
      content: params.draft_reply,
    });
  }

  const statusEmoji: Record<string, string> = {
    open: '🔴', awaiting_response: '🟡', escalated: '🟠',
    resolved_won: '✅', resolved_partial: '🟢', resolved_lost: '❌', closed: '⚫',
  };

  const emoji = statusEmoji[params.new_status] ?? '⚪';
  let text = `${emoji} *${dispute.provider_name}* dispute updated to: *${params.new_status.replace(/_/g, ' ')}*`;
  if (params.notes) text += `\nNotes: ${params.notes}`;
  if (params.money_recovered) text += `\nRecovered: *${fmt(params.money_recovered)}*`;
  if (params.new_status === 'resolved_won') text += `\n\n🎉 Well done on winning this dispute!`;

  return { text };
}

// ============================================================
// CONTRACT HANDLER
// ============================================================

async function addContract(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider_name: string;
    category: string;
    monthly_cost: number;
    contract_end_date?: string;
    contract_start_date?: string;
    auto_renews: boolean;
    interest_rate?: number;
    remaining_balance?: number;
  },
): Promise<ToolResult> {
  const annual = params.monthly_cost * 12;

  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    provider_name: params.provider_name,
    category: params.category,
    amount: params.monthly_cost,
    billing_cycle: 'monthly',
    contract_type: 'fixed_contract',
    contract_start_date: params.contract_start_date ?? null,
    contract_end_date: params.contract_end_date ?? null,
    auto_renews: params.auto_renews,
    interest_rate: params.interest_rate ?? null,
    remaining_balance: params.remaining_balance ?? null,
    status: 'active',
    source: 'telegram',
  });

  if (error) {
    return { text: `Failed to add contract: ${error.message}` };
  }

  let text = `Contract added: *${params.provider_name}* [${params.category}] — ${fmt(params.monthly_cost)}/month (${fmt(annual)}/year)`;
  if (params.contract_end_date) {
    const daysLeft = Math.ceil(
      (new Date(params.contract_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    text += `\nEnds: ${fmtDate(params.contract_end_date)} (${daysLeft} days)`;
    if (params.auto_renews) text += ` · Auto-renews`;
  }
  if (params.interest_rate) text += `\nInterest: ${params.interest_rate}%`;
  if (params.remaining_balance) text += ` · Remaining: ${fmt(params.remaining_balance)}`;
  text += `\n\nYou'll get renewal reminders before the contract ends.`;

  return { text };
}

// ============================================================
// DEALS HANDLER
// ============================================================

async function getDeals(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  category?: string,
): Promise<ToolResult> {
  // Fetch deals and (if category filter) user's current subscriptions in parallel
  let dealsQuery = supabase
    .from('affiliate_deals')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  if (category) {
    dealsQuery = dealsQuery.eq('category', category);
  }

  // Normalise category for subscription lookup (deals use 'broadband', subs may use same)
  const categoryForSubs = category ?? null;

  const [{ data: deals, error }, { data: userSubs }] = await Promise.all([
    dealsQuery,
    categoryForSubs
      ? supabase
          .from('subscriptions')
          .select('provider_name, amount, billing_cycle, category')
          .eq('user_id', userId)
          .eq('status', 'active')
          .eq('category', categoryForSubs)
      : Promise.resolve({ data: null }),
  ]);

  if (error) {
    return { text: `Failed to fetch deals: ${error.message}` };
  }

  if (!deals || deals.length === 0) {
    const catLabel = category ? ` for ${category}` : '';
    return { text: `No deals available${catLabel} right now. Check back soon — new offers are added regularly.` };
  }

  // Calculate user's current monthly spend for this category
  const currentSubs = userSubs ?? [];
  const currentMonthlySpend = currentSubs.reduce((sum, sub) => {
    const monthly =
      sub.billing_cycle === 'yearly'
        ? parseFloat(String(sub.amount)) / 12
        : sub.billing_cycle === 'quarterly'
        ? parseFloat(String(sub.amount)) / 3
        : parseFloat(String(sub.amount));
    return sum + (isNaN(monthly) ? 0 : monthly);
  }, 0);

  // Group deals by category
  const grouped: Record<string, typeof deals> = {};
  for (const deal of deals) {
    if (!grouped[deal.category]) grouped[deal.category] = [];
    grouped[deal.category].push(deal);
  }

  let text = category
    ? `*${category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ')} Deals on Paybacker*\n\n`
    : `*Deals available on Paybacker*\n\n`;

  for (const [cat, catDeals] of Object.entries(grouped)) {
    if (!category) {
      const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ');
      text += `*${catLabel}*\n`;
    }
    for (const deal of catDeals) {
      const effectivePrice = deal.price_promotional && deal.price_promotional < deal.price_monthly
        ? parseFloat(String(deal.price_promotional))
        : parseFloat(String(deal.price_monthly));

      text += `• *${deal.provider}* — ${deal.plan_name}: ${fmt(deal.price_monthly)}/mo`;
      if (deal.price_promotional && deal.price_promotional < deal.price_monthly) {
        text += ` _(${fmt(deal.price_promotional)}/mo for ${deal.promotional_period ?? 'promo period'})_`;
      }
      if (deal.speed_mbps) text += ` · ${deal.speed_mbps}Mbps`;
      if (deal.data_allowance) text += ` · ${deal.data_allowance}`;
      if (deal.contract_length) text += ` · ${deal.contract_length}`;

      // Per-deal saving vs current total spend
      if (currentMonthlySpend > 0 && currentSubs.length > 0 && effectivePrice < currentMonthlySpend) {
        const monthlySaving = currentMonthlySpend - effectivePrice;
        const annualSaving = monthlySaving * 12;
        text += `\n  ↳ Switch & save *${fmt(monthlySaving)}/mo* (*${fmt(annualSaving)}/year*)`;
      }

      text += `\n`;
    }
    text += `\n`;
  }

  // Total savings summary when the user has subscriptions in this category
  if (currentMonthlySpend > 0 && currentSubs.length > 0 && category) {
    const catLabel = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
    text += `*Your ${catLabel} Spending Summary*\n`;
    text += `You currently pay *${fmt(currentMonthlySpend)}/mo* across ${currentSubs.length} provider${currentSubs.length !== 1 ? 's' : ''}:\n`;
    for (const sub of currentSubs) {
      const monthly =
        sub.billing_cycle === 'yearly'
          ? parseFloat(String(sub.amount)) / 12
          : sub.billing_cycle === 'quarterly'
          ? parseFloat(String(sub.amount)) / 3
          : parseFloat(String(sub.amount));
      text += `  • ${sub.provider_name}: ${fmt(monthly)}/mo\n`;
    }

    // Find the cheapest deal for a direct comparison
    const cheapestDeal = deals.reduce((min, d) => {
      const p = d.price_promotional && d.price_promotional < d.price_monthly
        ? parseFloat(String(d.price_promotional))
        : parseFloat(String(d.price_monthly));
      const minP = min.price_promotional && min.price_promotional < min.price_monthly
        ? parseFloat(String(min.price_promotional))
        : parseFloat(String(min.price_monthly));
      return p < minP ? d : min;
    }, deals[0]);

    const cheapestPrice =
      cheapestDeal.price_promotional && cheapestDeal.price_promotional < cheapestDeal.price_monthly
        ? parseFloat(String(cheapestDeal.price_promotional))
        : parseFloat(String(cheapestDeal.price_monthly));

    if (cheapestPrice < currentMonthlySpend) {
      const totalMonthlySaving = currentMonthlySpend - cheapestPrice;
      const totalAnnualSaving = totalMonthlySaving * 12;
      text += `\n*Best saving: switch all to ${cheapestDeal.provider} ${cheapestDeal.plan_name}*\n`;
      text += `${fmt(currentMonthlySpend)}/mo → ${fmt(cheapestPrice)}/mo\n`;
      text += `*You'd save ${fmt(totalMonthlySaving)}/mo = ${fmt(totalAnnualSaving)}/year*\n`;
    }
    text += `\n`;
  }

  text += `_View all deals at paybacker.co.uk/deals_`;
  return { text };
}

// ============================================================
// PER-TRANSACTION RECATEGORISE HANDLER
// ============================================================

async function recategoriseTransaction(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  transactionId: string,
  newCategory: string,
): Promise<ToolResult> {
  // Support truncated IDs (8-char prefix shown in list_transactions output)
  if (transactionId.length < 36) {
    return { text: `Error: You provided a truncated ID ("${transactionId}"). The database requires a full 36-character UUID. Please use the 'recategorise_transactions' tool to search by merchant_name instead.` };
  }
  
  let txnQuery = supabase
    .from('bank_transactions')
    .select('id, merchant_name, description, amount, category, user_category')
    .eq('user_id', userId)
    .eq('id', transactionId);

  const { data: matches, error: fetchError } = await txnQuery.limit(2);

  if (fetchError) {
    return { text: `Database error querying transaction: ${fetchError.message}` };
  }
  if (!matches || matches.length === 0) {
    return { text: `Transaction not found. Check the ID is correct.` };
  }
  if (matches.length > 1) {
    return { text: `"${transactionId}" matches more than one transaction. Provide more characters of the ID to narrow it down.` };
  }
  const txn = matches[0];

  const { error: updateError } = await supabase
    .from('bank_transactions')
    .update({ user_category: newCategory })
    .eq('id', txn.id)
    .eq('user_id', userId);

  if (updateError) {
    return { text: `Failed to recategorise: ${updateError.message}` };
  }

  // Persist override so it survives future syncs
  await supabase.from('money_hub_category_overrides').insert({
    user_id: userId,
    merchant_pattern: 'txn_specific',
    user_category: newCategory,
    transaction_id: txn.id,
  });

  // Automatically feed this into the Learning Engine!
  try {
    const { learnFromCorrection } = await import('@/lib/learning-engine');
    await learnFromCorrection({
      rawName: txn.description || txn.merchant_name || 'Unknown',
      displayName: txn.merchant_name || undefined,
      category: newCategory,
      amount: txn.amount,
      userId: userId,
    });
  } catch (err: any) {
    console.error('[UserBot] Error pushing to learning engine:', err.message);
  }

  const merchant = txn.merchant_name ?? 'Unknown';
  const amt = fmt(Math.abs(Number(txn.amount)));
  const prevCategory = txn.user_category || txn.category || 'unknown';
  return {
    text: `Recategorised *${merchant}* (${amt}) from "${prevCategory}" to "${newCategory}". The change is now reflected in your Money Hub dashboard.`,
  };
}

async function getUpcomingPayments(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  days?: number,
): Promise<ToolResult> {
  const windowDays = days ?? 7;
  const now = new Date();
  const todayDay = now.getDate();
  const todayStr = now.toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const endStr = endDate.toISOString().split('T')[0];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Fetch from THREE sources in parallel:
  // 1. Subscriptions with next_billing_date set
  // 2. Expected bills from bank transaction patterns (direct debits etc)
  // 3. Recent transactions this month to check what's already paid
  const startOfMonth = new Date(year, month - 1, 1).toISOString();
  const endOfMonth = new Date(year, month, 1).toISOString();

  const [subsRes, billsRes, recentTxnRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('provider_name, amount, billing_cycle, next_billing_date, category')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('next_billing_date', 'is', null)
      .gte('next_billing_date', todayStr)
      .lte('next_billing_date', endStr)
      .order('next_billing_date', { ascending: true }),
    supabase.rpc('get_expected_bills', { p_user_id: userId, p_year: year, p_month: month }),
    supabase
      .from('bank_transactions')
      .select('merchant_name, description, amount, timestamp')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', startOfMonth)
      .lt('timestamp', endOfMonth),
  ]);

  const subs = subsRes.data ?? [];
  const rawBills = (billsRes.data ?? []).filter(
    (b: any) => b.occurrence_count >= 2 && b.occurrence_count <= 30,
  );
  const recentDebits = (recentTxnRes.data ?? []).map(t => ({
    name: (t.merchant_name || t.description || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim(),
    amount: Math.abs(Number(t.amount)),
  }));

  // Check if a bill has already been paid this month
  const isPaidThisMonth = (providerName: string, expectedAmount: number): boolean => {
    const norm = providerName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const prefix = norm.substring(0, Math.min(norm.length, 8));
    return recentDebits.some(d => {
      const nameMatch = d.name.includes(prefix) || (prefix.length >= 4 && d.name.startsWith(prefix.substring(0, 4)));
      const amountClose = Math.abs(d.amount - expectedAmount) <= expectedAmount * 0.25;
      return nameMatch && amountClose;
    });
  };

  // Build unified upcoming payment list from expected bills (by billing day in the window)
  interface UpcomingPayment {
    name: string;
    amount: number;
    dueDate: Date;
    type: string;
    source: 'subscription' | 'bank_pattern' | 'both';
    alreadyPaid: boolean;
  }

  const payments: UpcomingPayment[] = [];
  const addedNames = new Set<string>();

  const LOAN_CATEGORIES = new Set(['mortgage', 'loan', 'loans', 'credit']);
  const BILL_CATEGORIES = new Set(['utility', 'council_tax', 'water', 'broadband', 'mobile', 'bills', 'energy', 'insurance']);
  const FINANCE_KEYWORDS = ['mortgage', 'loan', 'finance', 'credit card', 'lendinvest', 'skipton', 'novuna', 'zopa', 'barclaycard', 'mbna', 'amex', 'american express', 'securepay'];

  const getType = (name: string, category: string | null): string => {
    const lower = name.toLowerCase();
    if (FINANCE_KEYWORDS.some((kw) => lower.includes(kw))) return 'loan';
    if (LOAN_CATEGORIES.has(category ?? '')) return 'loan';
    if (BILL_CATEGORIES.has(category ?? '')) return 'bill';
    return 'subscription';
  };

  // 1. Add subscriptions with explicit next_billing_date
  for (const s of subs) {
    const key = (s.provider_name || '').toLowerCase().substring(0, 8);
    addedNames.add(key);
    const dueDate = new Date(`${s.next_billing_date}T00:00:00`);
    payments.push({
      name: s.provider_name,
      amount: Math.abs(Number(s.amount)),
      dueDate,
      type: getType(s.provider_name, s.category),
      source: 'subscription',
      alreadyPaid: isPaidThisMonth(s.provider_name, Math.abs(Number(s.amount))),
    });
  }

  // 2. Add expected bills from bank patterns that fall within the window AND aren't already added from subscriptions
  const endDay = endDate.getMonth() === now.getMonth() ? endDate.getDate() : 31;
  for (const bill of rawBills) {
    const billingDay = bill.billing_day || 0;
    // Only include if billing day is in our window (today → today + windowDays)
    if (billingDay < todayDay || billingDay > endDay) continue;

    const key = (bill.provider_name || '').toLowerCase().substring(0, 8);
    // Check if already added from subscriptions (avoid duplicates)
    if (addedNames.has(key)) {
      // Upgrade source to 'both'
      const existing = payments.find(p => (p.name || '').toLowerCase().substring(0, 8) === key);
      if (existing) existing.source = 'both';
      continue;
    }
    addedNames.add(key);

    const expectedAmount = parseFloat(bill.expected_amount) || 0;
    const dueDate = new Date(year, month - 1, Math.min(billingDay, 28));

    payments.push({
      name: bill.provider_name,
      amount: expectedAmount,
      dueDate,
      type: bill.is_subscription ? 'subscription' : 'bill',
      source: 'bank_pattern',
      alreadyPaid: isPaidThisMonth(bill.provider_name, expectedAmount),
    });
  }

  if (payments.length === 0) {
    return { text: `No payments due in the next ${windowDays} days.` };
  }

  // Sort by due date
  payments.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const fmtPaymentDate = (d: Date): string => {
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  };

  const unpaidPayments = payments.filter(p => !p.alreadyPaid);
  const paidPayments = payments.filter(p => p.alreadyPaid);
  const totalDue = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
  const label = windowDays === 7 ? 'this week' : `in the next ${windowDays} days`;

  let text = `💰 *Upcoming payments ${label}:*\n`;

  if (unpaidPayments.length > 0) {
    for (const p of unpaidPayments) {
      const dateLabel = fmtPaymentDate(p.dueDate);
      const typeLabel = p.type !== 'subscription' ? ` _(${p.type})_` : '';
      const sourceTag = p.source === 'bank_pattern' ? ' 🏦' : '';
      text += `\n📅 ${dateLabel} — *${p.name}*: ${fmt(p.amount)}${typeLabel}${sourceTag}`;
    }
    text += `\n\n*Total due: ${fmt(totalDue)}*`;
  } else {
    text += `\nAll ${payments.length} payments in this period have already been paid! ✅`;
  }

  if (paidPayments.length > 0) {
    text += `\n\n✅ *Already paid (${paidPayments.length}):*`;
    for (const p of paidPayments) {
      text += `\n  ✓ ${p.name}: ${fmt(p.amount)}`;
    }
    text += `\n  _Total paid: ${fmt(totalPaid)}_`;
  }

  if (payments.some(p => p.source === 'bank_pattern')) {
    text += '\n\n_🏦 = detected from your bank transaction history_';
  }

  return { text };
}

// ============================================================
// NEW TOOLS — Loyalty, Referrals, Net Worth, Bills, Overcharges,
//             Profile, Tasks, Scanner, Cancellation, Support
// ============================================================

async function getLoyaltyStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const [pointsRes, badgesRes, eventsRes, profileRes] = await Promise.all([
    supabase
      .from('user_points')
      .select('balance, lifetime_earned, current_streak, longest_streak')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_badges')
      .select('badge_name, badge_emoji, earned_at')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false })
      .limit(10),
    supabase
      .from('point_events')
      .select('event_type, points, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .single(),
  ]);

  const balance = pointsRes.data?.balance ?? 0;
  const lifetime = pointsRes.data?.lifetime_earned ?? 0;
  const streak = pointsRes.data?.current_streak ?? 0;

  // Determine tier
  let tier = 'Bronze';
  let tierEmoji = '🥉';
  if (profileRes.data?.created_at) {
    const months = Math.floor((Date.now() - new Date(profileRes.data.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months >= 18 && lifetime >= 5000) { tier = 'Platinum'; tierEmoji = '💎'; }
    else if (months >= 9 && lifetime >= 2000) { tier = 'Gold'; tierEmoji = '🥇'; }
    else if (months >= 3 && lifetime >= 500) { tier = 'Silver'; tierEmoji = '🥈'; }
  }

  // Next tier requirements
  const tierGoals: Record<string, string> = {
    Bronze: 'Reach Silver: 3 months + 500 pts',
    Silver: 'Reach Gold: 9 months + 2,000 pts',
    Gold: 'Reach Platinum: 18 months + 5,000 pts',
    Platinum: 'You\'re at the top tier!',
  };

  // Redemption options
  const redemptions = [
    { points: 500, label: '£5 off next invoice' },
    { points: 900, label: '£10 off next invoice' },
    { points: 1500, label: 'Free month of Essential (£4.99)' },
    { points: 3000, label: 'Free month of Pro (£9.99)' },
    { points: 500, label: 'Donate £5 to Shelter' },
  ];

  let text = `*${tierEmoji} Loyalty Rewards — ${tier} Tier*\n\n`;
  text += `*Points balance:* ${balance.toLocaleString()} pts\n`;
  text += `*Lifetime earned:* ${lifetime.toLocaleString()} pts\n`;
  text += `*Active streak:* ${streak} month${streak !== 1 ? 's' : ''}\n\n`;

  text += `*Next tier:* ${tierGoals[tier]}\n\n`;

  text += `*Redeem your points:*\n`;
  for (const r of redemptions) {
    const canRedeem = balance >= r.points;
    text += `• ${r.label} — ${r.points} pts ${canRedeem ? '✅' : '🔒'}\n`;
  }

  const badges = badgesRes.data ?? [];
  if (badges.length > 0) {
    text += `\n*Badges earned (${badges.length}):*\n`;
    for (const b of badges.slice(0, 5)) {
      text += `${b.badge_emoji} ${b.badge_name}\n`;
    }
    if (badges.length > 5) text += `_...and ${badges.length - 5} more_\n`;
  }

  const events = eventsRes.data ?? [];
  if (events.length > 0) {
    text += `\n*Recent activity:*\n`;
    for (const e of events) {
      text += `• +${e.points} pts — ${e.description} (${fmtDate(e.created_at)})\n`;
    }
  }

  return { text };
}

// ============================================================
// PROACTIVE INTELLIGENCE HANDLERS
// ============================================================

async function getWeeklyOutlook(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayDay = now.getDate();
  const weekEndDay = todayDay + 7;
  const todayStr = now.toISOString().split('T')[0];
  const in30DaysStr = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [billsRes, contractsRes] = await Promise.all([
    supabase.rpc('get_expected_bills', { p_user_id: userId, p_year: year, p_month: month }),
    supabase
      .from('subscriptions')
      .select('provider_name, contract_end_date, amount, billing_cycle')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('contract_end_date', 'is', null)
      .gte('contract_end_date', todayStr)
      .lte('contract_end_date', in30DaysStr)
      .order('contract_end_date', { ascending: true }),
  ]);

  const allBills = (billsRes.data ?? []) as Array<{
    provider_name: string; expected_amount: string; billing_day: number; occurrence_count: number;
  }>;
  const weekBills = allBills.filter(
    (b) => b.billing_day >= todayDay && b.billing_day <= weekEndDay && b.occurrence_count >= 2 && b.occurrence_count <= 30,
  );
  const contracts = contractsRes.data ?? [];

  if (weekBills.length === 0 && contracts.length === 0) {
    return { text: 'No bills due this week and no contracts ending in the next 30 days. All clear!' };
  }

  let text = '📅 *This Week\'s Financial Outlook*\n\n';

  if (weekBills.length > 0) {
    const weekTotal = weekBills.reduce((s, b) => s + (parseFloat(b.expected_amount) || 0), 0);
    text += `💸 *Bills due this week* — Total: *${fmt(weekTotal)}*\n`;
    for (const bill of weekBills) {
      const dayLabel = bill.billing_day === todayDay ? 'Today' : bill.billing_day === todayDay + 1 ? 'Tomorrow' : `Day ${bill.billing_day}`;
      text += `  • *${bill.provider_name}* — ${fmt(parseFloat(bill.expected_amount))} (${dayLabel})\n`;
    }
  } else {
    text += '✅ No bills expected this week\n';
  }

  if (contracts.length > 0) {
    text += '\n📋 *Contracts ending in 30 days*\n';
    for (const c of contracts) {
      const daysLeft = Math.ceil((new Date(c.contract_end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const monthly = c.billing_cycle === 'yearly' ? Number(c.amount) / 12 : c.billing_cycle === 'quarterly' ? Number(c.amount) / 3 : Number(c.amount);
      text += `  ${daysLeft <= 7 ? '🔴' : daysLeft <= 14 ? '🟠' : '🟡'} *${c.provider_name}* — ${fmt(monthly)}/month ends in ${daysLeft} days\n`;
    }
    text += '\n_Ask me to draft a switch letter or show available deals for any of these_';
  }

  return { text };
}

async function getMonthlyRecap(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  month?: string,
): Promise<ToolResult> {
  const now = new Date();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth(); // Default to previous month (1-indexed month is now.getMonth())
  
  if (targetMonth === 0) { // If it was Jan, previous month is Dec of previous year
    targetMonth = 12;
    targetYear -= 1;
  }

  if (typeof month === 'string' && month.includes('-')) {
    const parts = month.split('-').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      targetYear = parts[0];
      targetMonth = parts[1];
    }
  }

  const targetDate = new Date(targetYear, targetMonth - 1, 1);
  const prevDate = new Date(targetYear, targetMonth - 2, 1);

  const scope = await loadBotSpace(supabase, userId);

  let spending = 0;
  let prevSpending = 0;
  let income = 0;
  let top5: Array<{ category: string; total: number }> = [];

  if (scope.isDefault) {
    const [spendRes, prevSpendRes, incomeRes, breakdownRes] = await Promise.all([
      supabase.rpc('get_monthly_spending_total', { p_user_id: userId, p_year: targetYear, p_month: targetMonth }),
      supabase.rpc('get_monthly_spending_total', { p_user_id: userId, p_year: prevDate.getFullYear(), p_month: prevDate.getMonth() + 1 }),
      supabase.rpc('get_monthly_income_total', { p_user_id: userId, p_year: targetYear, p_month: targetMonth }),
      supabase.rpc('get_monthly_spending', { p_user_id: userId, p_year: targetYear, p_month: targetMonth }),
    ]);
    spending = parseFloat(spendRes.data) || 0;
    prevSpending = parseFloat(prevSpendRes.data) || 0;
    income = parseFloat(incomeRes.data) || 0;
    type SpendingRow = { category: string; category_total: string };
    top5 = ((breakdownRes.data as SpendingRow[]) ?? [])
      .map((r) => ({ category: r.category, total: parseFloat(r.category_total) || 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  } else {
    // Space-scoped: raw SELECT + in-JS aggregation matching the RPCs.
    const monthStart = targetDate.toISOString();
    const monthEnd = new Date(targetYear, targetMonth, 1).toISOString();
    const prevStart = prevDate.toISOString();
    const prevEnd = monthStart;

    const [curRes, prevRes] = await Promise.all([
      applyTxSpaceFilter(
        supabase.from('bank_transactions')
          .select('amount, user_category, income_type, category, connection_id, account_id')
          .eq('user_id', userId).gte('timestamp', monthStart).lt('timestamp', monthEnd),
        scope,
      ),
      applyTxSpaceFilter(
        supabase.from('bank_transactions')
          .select('amount, user_category, income_type, category, connection_id, account_id')
          .eq('user_id', userId).gte('timestamp', prevStart).lt('timestamp', prevEnd),
        scope,
      ),
    ]);

    const cats: Record<string, number> = {};
    for (const t of (curRes.data ?? []) as Array<{ amount: number; user_category: string | null; income_type: string | null; category: string | null }>) {
      if (isTransferLike(t)) continue;
      const amt = Number(t.amount);
      if (amt > 0) income += amt;
      else if (amt < 0) {
        if (t.user_category === 'income') continue;
        spending += -amt;
        const cat = t.user_category || 'other';
        cats[cat] = (cats[cat] ?? 0) + -amt;
      }
    }
    for (const t of (prevRes.data ?? []) as Array<{ amount: number; user_category: string | null; income_type: string | null; category: string | null }>) {
      if (isTransferLike(t)) continue;
      const amt = Number(t.amount);
      if (amt < 0 && t.user_category !== 'income') prevSpending += -amt;
    }
    top5 = Object.entries(cats)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  if (spending === 0 && income === 0) {
    const tag = scope.space && !scope.isDefault ? ` in ${scope.space.name}` : '';
    return { text: `No financial data found for ${targetDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}${tag}. Connect a bank account at paybacker.co.uk/dashboard/money-hub.` };
  }

  const monthLabel = targetDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const savingsRate = income > 0 ? ((income - spending) / income) * 100 : 0;
  const spendingDiff = spending - prevSpending;

  const scopeHeader = scope.space && !scope.isDefault ? ` — ${scope.space.emoji ?? '📁'} ${scope.space.name}` : '';
  let text = `📊 *${monthLabel} Financial Recap${scopeHeader}*\n\n`;
  text += `💰 Income: *${fmt(income)}*\n`;
  text += `💸 Spending: *${fmt(spending)}*\n`;
  const net = income - spending;
  const netSign = net >= 0 ? '+' : '-';
  text += `${net >= 0 ? '✅' : '❌'} Net: *${netSign}${fmt(net)}*\n`;
  text += `${savingsRate >= 20 ? '🎉' : savingsRate >= 10 ? '👍' : '⚠️'} Savings rate: *${savingsRate.toFixed(1)}%*\n`;

  if (prevSpending > 0) {
    text += `${spendingDiff > 0 ? '📈' : '📉'} vs prior month: *${spendingDiff > 0 ? '+' : ''}${fmt(spendingDiff)}*\n`;
  }

  if (top5.length > 0) {
    text += '\n*Top Spending Categories*\n';
    const EMOJI: Record<string, string> = { food: '🛒', transport: '🚗', streaming: '📺', utility: '⚡', utilities: '⚡', bills: '📄', mortgage: '🏠', insurance: '🛡️', fitness: '💪', mobile: '📱', broadband: '🌐', other: '💰' };
    for (const c of top5) {
      const emoji = EMOJI[c.category.toLowerCase()] ?? '💰';
      const pct = spending > 0 ? ((c.total / spending) * 100).toFixed(0) : '0';
      text += `  ${emoji} ${c.category}: *${fmt(c.total)}* (${pct}%)\n`;
    }
  }

  return { text };
}

function normaliseMerchantLocal(name: string): string {
  return name
    .toLowerCase()
    .replace(/paypal\s*\*/gi, '')
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk)\b/g, '')
    .replace(/\d{5,}/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function merchantNamesMatch(a: string, b: string): boolean {
  const na = normaliseMerchantLocal(a);
  const nb = normaliseMerchantLocal(b);
  if (!na || !nb) return false;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return longer.includes(shorter.substring(0, Math.min(shorter.length, 8)));
}

async function getUnusedSubscriptions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const nintyDaysAgoCutoff = new Date(ninetyDaysAgo);

  const [subsRes, txnRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, provider_name, amount, billing_cycle, category, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('billing_cycle', ['monthly', 'quarterly']),
    supabase
      .from('bank_transactions')
      .select('merchant_name, description, amount')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', ninetyDaysAgo),
  ]);

  const subs = (subsRes.data ?? []).filter(
    (s) => !s.created_at || new Date(s.created_at) < nintyDaysAgoCutoff,
  );
  const txns = txnRes.data ?? [];

  if (subs.length === 0) {
    return { text: 'No established monthly/quarterly subscriptions found.' };
  }

  const unused = subs.filter(
    (sub) => !txns.some((t) => merchantNamesMatch(sub.provider_name, t.merchant_name || t.description || '')),
  );

  if (unused.length === 0) {
    return { text: 'All your active subscriptions have matching transactions in the last 90 days — no obvious zombie subscriptions detected.' };
  }

  const monthlyTotal = unused.reduce((sum, s) => {
    const amt = Number(s.amount);
    return sum + (s.billing_cycle === 'quarterly' ? amt / 3 : amt);
  }, 0);

  let text = `💤 *Potentially Unused Subscriptions*\n_(No matching transactions in 90 days)_\n\n`;
  for (const sub of unused.slice(0, 8)) {
    const monthly = sub.billing_cycle === 'quarterly' ? Number(sub.amount) / 3 : Number(sub.amount);
    text += `• *${sub.provider_name}* — ${fmt(Number(sub.amount))}/${sub.billing_cycle ?? 'month'} (~${fmt(monthly * 12)}/year)\n`;
  }
  if (unused.length > 8) text += `_...and ${unused.length - 8} more_\n`;

  text += `\n*Total: ~${fmt(monthlyTotal)}/month* you may not be using\n`;
  text += `\n_Ask me to cancel any of these or draft a cancellation email_`;

  return { text };
}

async function getDisputeStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const FCA_DEADLINE_DAYS = 56;

  const { data: disputes, error } = await supabase
    .from('disputes')
    .select('id, provider_name, issue_type, status, created_at, updated_at, disputed_amount, money_recovered')
    .eq('user_id', userId)
    .in('status', ['open', 'awaiting_response', 'escalated'])
    .order('created_at', { ascending: true });

  if (error || !disputes || disputes.length === 0) {
    return { text: 'No active disputes. Use "write a complaint letter to [company]" to start one.' };
  }

  const STATUS_EMOJI: Record<string, string> = { open: '🔴', awaiting_response: '🟡', escalated: '🔥' };

  let text = `📬 *Active Disputes (${disputes.length})*\n\n`;

  for (const d of disputes) {
    const daysSinceSent = Math.floor((now.getTime() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const daysUntilDeadline = FCA_DEADLINE_DAYS - daysSinceSent;
    const emoji = STATUS_EMOJI[d.status] ?? '❓';

    text += `${emoji} *${d.provider_name}* — ${d.issue_type}\n`;
    text += `  Status: ${d.status} | Sent: ${daysSinceSent} days ago\n`;

    if (daysUntilDeadline <= 0) {
      text += `  🚨 FCA deadline PASSED — escalate to ombudsman now\n`;
    } else if (daysUntilDeadline <= 14) {
      text += `  ⚠️ FCA deadline in ${daysUntilDeadline} days\n`;
    } else {
      text += `  📅 ${daysUntilDeadline} days until FCA deadline\n`;
    }

    if (daysSinceSent >= 14) {
      text += `  _No response in ${daysSinceSent} days — ask me to draft a follow-up_\n`;
    }
    text += '\n';
  }

  return { text: text.trim() };
}

async function getSavingsTotal(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data: savings, error } = await supabase
    .from('verified_savings')
    .select('amount_saved, saving_type, title, confirmed_at, annual_saving')
    .eq('user_id', userId)
    .order('confirmed_at', { ascending: false });

  if (error || !savings || savings.length === 0) {
    return {
      text: 'No verified savings recorded yet.\n\nWhen you win a dispute, cancel a subscription, or stop a price rise, I\'ll track it here. Ask me to write a complaint letter to get started!',
    };
  }

  const totalSaved = savings.reduce((sum, s) => sum + (Number(s.amount_saved) || 0), 0);
  const annualSavingTotal = savings.reduce((sum, s) => sum + (Number(s.annual_saving) || 0), 0);

  const byType: Record<string, number> = {};
  for (const s of savings) {
    const type = s.saving_type ?? 'other';
    byType[type] = (byType[type] ?? 0) + (Number(s.amount_saved) || 0);
  }

  const TYPE_LABELS: Record<string, string> = {
    dispute_won: '⚖️ Disputes won',
    cancelled_subscription: '✂️ Cancelled subscriptions',
    price_reverted: '📉 Price increases reversed',
    refund: '↩️ Refunds',
    other: '💰 Other savings',
  };

  let text = `🏆 *Your Total Savings with Paybacker*\n\n`;
  text += `*${fmt(totalSaved)}* saved to date\n`;
  if (annualSavingTotal > 0) text += `*${fmt(annualSavingTotal)}/year* in ongoing savings\n`;
  text += '\n*Breakdown:*\n';

  for (const [type, amount] of Object.entries(byType).sort(([, a], [, b]) => b - a)) {
    const label = TYPE_LABELS[type] ?? `💰 ${type}`;
    text += `  ${label}: *${fmt(amount)}*\n`;
  }

  if (savings.length > 0) {
    text += '\n*Recent Savings:*\n';
    for (const s of savings.slice(0, 5)) {
      text += `  • ${s.title ?? 'Saving'}: *${fmt(Number(s.amount_saved))}*\n`;
    }
    if (savings.length > 5) text += `  _...and ${savings.length - 5} more_\n`;
  }

  // Next milestone
  const MILESTONES = [50, 100, 250, 500, 1000, 2000, 5000];
  const nextMilestone = MILESTONES.find((m) => m > totalSaved);
  if (nextMilestone) {
    text += `\n🎯 Next milestone: ${fmt(nextMilestone)} — ${fmt(nextMilestone - totalSaved)} to go!`;
  } else {
    text += `\n🏆 You've hit every milestone — legendary savings!`;
  }

  return { text };
}

async function getReferralLink(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .single();

  let code = profile?.referral_code;

  if (!code) {
    // Generate a code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code = 'PB-' + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    await supabase.from('profiles').update({ referral_code: code }).eq('id', userId);
  }

  const shareUrl = `https://paybacker.co.uk/join?ref=${code}`;

  const { data: referrals } = await supabase
    .from('referrals')
    .select('referred_email, status, created_at')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });

  const list = referrals ?? [];
  const signedUp = list.filter(r => r.status === 'signed_up' || r.status === 'subscribed').length;
  const subscribed = list.filter(r => r.status === 'subscribed').length;

  let text = `*Your Paybacker Referral Link*\n\n`;
  text += `🔗 ${shareUrl}\n\n`;
  text += `*Your code:* \`${code}\`\n\n`;
  text += `*How it works:*\n`;
  text += `• Share your link with friends\n`;
  text += `• When they sign up: you earn 100 loyalty points\n`;
  text += `• When they subscribe: you BOTH get 1 free month\n\n`;

  text += `*Your referral stats:*\n`;
  text += `• Total referred: ${list.length}\n`;
  text += `• Signed up: ${signedUp}\n`;
  text += `• Subscribed (free month earned): ${subscribed}\n`;

  if (list.length > 0) {
    text += `\n*Recent referrals:*\n`;
    for (const r of list.slice(0, 5)) {
      const masked = r.referred_email
        ? r.referred_email.replace(/(.{2}).*(@.*)/, '$1***$2')
        : 'Unknown';
      const statusLabel = r.status === 'subscribed' ? '✅ Subscribed' : '⏳ Signed up';
      text += `• ${masked} — ${statusLabel}\n`;
    }
  }

  return { text };
}

async function getNetWorth(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const [assetsRes, liabilitiesRes] = await Promise.all([
    supabase.from('money_hub_assets').select('asset_name, asset_type, estimated_value').eq('user_id', userId),
    supabase.from('money_hub_liabilities').select('liability_name, liability_type, outstanding_balance, monthly_payment, interest_rate').eq('user_id', userId),
  ]);

  const assets = assetsRes.data ?? [];
  const liabilities = liabilitiesRes.data ?? [];

  if (assets.length === 0 && liabilities.length === 0) {
    return {
      text: `No net worth data found. Add your assets and liabilities on the Money Hub page at paybacker.co.uk/dashboard/money-hub to track your net worth.`,
    };
  }

  const totalAssets = assets.reduce((s, a) => s + (parseFloat(String(a.estimated_value)) || 0), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  let text = `*Net Worth Summary*\n\n`;
  text += `*Total assets:* ${fmt(totalAssets)}\n`;
  text += `*Total liabilities:* ${fmt(totalLiabilities)}\n`;
  text += `*Net worth:* *${netWorth >= 0 ? '' : '-'}${fmt(Math.abs(netWorth))}*\n`;

  if (assets.length > 0) {
    text += `\n*Assets:*\n`;
    for (const a of assets) {
      text += `• ${a.asset_name} (${a.asset_type}) — ${fmt(a.estimated_value)}\n`;
    }
  }

  if (liabilities.length > 0) {
    text += `\n*Liabilities:*\n`;
    for (const l of liabilities) {
      const rate = l.interest_rate ? ` @ ${l.interest_rate}%` : '';
      const monthly = l.monthly_payment ? ` (${fmt(l.monthly_payment)}/mo)` : '';
      text += `• ${l.liability_name} — ${fmt(l.outstanding_balance)}${rate}${monthly}\n`;
    }
  }

  return { text };
}

async function getExpectedBills(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayDay = now.getDate();

  // Fetch expected bills AND actual transactions this month in parallel
  const startOfMonth = new Date(year, month - 1, 1).toISOString();
  const endOfMonth = new Date(year, month, 1).toISOString();

  const [billsRes, txnRes, subsRes, manualRes] = await Promise.all([
    supabase.rpc('get_expected_bills', {
      p_user_id: userId,
      p_year: year,
      p_month: month,
    }),
    supabase
      .from('bank_transactions')
      .select('id, merchant_name, description, amount, timestamp')
      .eq('user_id', userId)
      .lt('amount', 0)  // debits only
      .gte('timestamp', startOfMonth)
      .lt('timestamp', endOfMonth)
      .order('timestamp', { ascending: false }),
    supabase
      .from('subscriptions')
      .select('provider_name, amount, next_billing_date, status')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('manual_bill_payments')
      .select('provider_name, amount, paid_date')
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month),
  ]);

  if (billsRes.error) {
    return { text: `Unable to load expected bills: ${billsRes.error.message}` };
  }

  const bills = (billsRes.data ?? []).filter(
    (b: any) => b.occurrence_count >= 2 && b.occurrence_count <= 30,
  );

  if (bills.length === 0) {
    return {
      text: `No expected bills found for this month. Connect a bank account at paybacker.co.uk/dashboard/money-hub to start tracking your recurring payments.`,
    };
  }

  // Build a list of actual debits this month with normalised names for matching
  const actualDebits = (txnRes.data ?? []).map(t => {
    const raw = (t.merchant_name || t.description || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    // Remove trailing reference numbers/dates that pollute matching
    const cleaned = raw.replace(/\s+\d{6,}.*$/, '').replace(/\s+(dd|ref|mandate)\b.*$/i, '').trim();
    return {
      name: cleaned,
      nameTokens: cleaned.split(/\s+/).filter(Boolean),
      amount: Math.abs(Number(t.amount)),
      date: new Date(t.timestamp),
    };
  });

  // Manual payment overrides (user said "mark X as paid" via Telegram)
  const manualPayments = new Map<string, { amount: number | null; date: string }>();
  for (const mp of (manualRes.data ?? [])) {
    const key = (mp.provider_name ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    manualPayments.set(key, { amount: mp.amount ? Number(mp.amount) : null, date: mp.paid_date });
  }

  // Intelligent matching: a bill is "paid" if we find a transaction this month where:
  //  1. The normalised names share significant overlap (token-based), AND
  //  2. The amount is within 20% of expected (bills fluctuate slightly)
  const matchBillToTransaction = (billName: string, expectedAmount: number) => {
    const normBill = billName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const billTokens = normBill.split(/\s+/).filter(Boolean);
    // Get the most significant token (longest, most unique word — skip common words)
    const COMMON_WORDS = new Set(['ltd', 'limited', 'uk', 'plc', 'the', 'direct', 'debit', 'payment', 'to', 'from', 'card']);
    const significantBillTokens = billTokens.filter(t => t.length >= 3 && !COMMON_WORDS.has(t));

    let bestMatch: { amount: number; date: Date } | null = null;
    let bestScore = 0;

    for (const debit of actualDebits) {
      // Score 1: Token overlap (how many significant bill tokens appear in the transaction name)
      let tokenMatches = 0;
      for (const bt of significantBillTokens) {
        if (debit.name.includes(bt) || debit.nameTokens.some((dt: string) => dt.includes(bt) || bt.includes(dt))) {
          tokenMatches++;
        }
      }
      const tokenScore = significantBillTokens.length > 0 ? tokenMatches / significantBillTokens.length : 0;

      // Score 2: Amount proximity (within 20% tolerance for variable bills like energy)
      const amountDiff = Math.abs(debit.amount - expectedAmount);
      const amountTolerance = expectedAmount * 0.20;
      const amountScore = amountDiff <= amountTolerance ? 1 : amountDiff <= expectedAmount * 0.5 ? 0.5 : 0;

      // Combined: need at least 50% token overlap AND reasonable amount match
      const combined = tokenScore * 0.6 + amountScore * 0.4;
      if (tokenScore >= 0.5 && combined > bestScore) {
        bestScore = combined;
        bestMatch = { amount: debit.amount, date: debit.date };
      }
    }

    // Also check direct exact-ish name match (first 6+ chars) for short provider names
    if (!bestMatch && normBill.length >= 4) {
      const prefix = normBill.substring(0, Math.min(normBill.length, 8));
      for (const debit of actualDebits) {
        if (debit.name.startsWith(prefix) || debit.name.includes(prefix)) {
          const amountDiff = Math.abs(debit.amount - expectedAmount);
          if (amountDiff <= expectedAmount * 0.25) {
            bestMatch = { amount: debit.amount, date: debit.date };
            break;
          }
        }
      }
    }

    return bestMatch;
  };

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let paidCount = 0;
  let unpaidCount = 0;
  let totalExpected = 0;
  let totalPaid = 0;
  let overdueCount = 0;

  const lines: string[] = [];
  const sorted = [...bills].sort((a: any, b: any) => a.billing_day - b.billing_day);

  for (const bill of sorted) {
    const expectedAmount = parseFloat(bill.expected_amount) || 0;
    totalExpected += expectedAmount;

    // Check manual payment override first (user said "mark X as paid" via Telegram)
    const normBillKey = (bill.provider_name ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const manualMatch = (() => {
      for (const [key, mp] of manualPayments) {
        if (normBillKey.includes(key) || key.includes(normBillKey.substring(0, Math.min(normBillKey.length, 8)))) {
          return mp;
        }
      }
      return null;
    })();

    const match = manualMatch
      ? { amount: manualMatch.amount ?? expectedAmount, date: new Date(manualMatch.date) }
      : matchBillToTransaction(bill.provider_name, expectedAmount);
    const billingDay = bill.billing_day || 0;
    const isDue = billingDay <= todayDay;

    let status: string;
    let detail = '';

    if (match) {
      // Bill was paid — check if amount differs from expected
      paidCount++;
      totalPaid += match.amount;
      const diff = match.amount - expectedAmount;
      if (Math.abs(diff) > 1 && !manualMatch) {
        // Amount differs (only flag for bank-matched payments, not manual overrides)
        const direction = diff > 0 ? '⬆️' : '⬇️';
        detail = ` — paid ${fmt(match.amount)} (${direction} ${fmt(Math.abs(diff))} vs expected)`;
      } else {
        detail = manualMatch ? ` — marked as paid manually` : ` — paid ${fmt(match.amount)}`;
      }
      status = '✅';
    } else if (isDue) {
      // Bill was due but no matching transaction found — flag as potentially missed
      unpaidCount++;
      overdueCount++;
      status = '❌';
      detail = ` — *due day ${billingDay}, no payment found*`;
    } else {
      // Bill not yet due
      unpaidCount++;
      status = '⏳';
      const daysUntil = billingDay - todayDay;
      detail = daysUntil === 1 ? ' — due tomorrow' : ` — due in ${daysUntil} days`;
    }

    const day = billingDay ? ` (day ${billingDay})` : '';
    lines.push(`${status} ${bill.provider_name}${day} — *${fmt(expectedAmount)}*${detail}`);
  }

  let text = `*Expected Bills — ${monthLabel}*\n\n`;
  text += lines.join('\n');
  text += `\n\n*Total expected:* ${fmt(totalExpected)}`;
  text += `\n*Paid so far:* ${fmt(totalPaid)} (${paidCount} bills)`;
  text += `\n*Outstanding:* ${unpaidCount} bills`;

  if (overdueCount > 0) {
    text += `\n\n⚠️ *${overdueCount} bill${overdueCount > 1 ? 's' : ''} past due date with no matching payment found.* Check your bank account or these may be overdue.`;
  }

  // Cross-reference with subscriptions that have next_billing_date this month but weren't in expected bills
  const subsDueThisMonth = (subsRes.data ?? []).filter(s => {
    if (!s.next_billing_date) return false;
    const nbd = new Date(s.next_billing_date);
    return nbd.getFullYear() === year && nbd.getMonth() + 1 === month;
  });
  const billNames = new Set(bills.map((b: any) => (b.provider_name || '').toLowerCase().substring(0, 6)));
  const missingSubs = subsDueThisMonth.filter(s => {
    const prefix = (s.provider_name || '').toLowerCase().substring(0, 6);
    return !billNames.has(prefix);
  });
  if (missingSubs.length > 0) {
    text += '\n\n📋 *Also tracked in your subscriptions:*\n';
    for (const s of missingSubs) {
      const nbd = new Date(s.next_billing_date);
      const dayNum = nbd.getDate();
      const isDue = dayNum <= todayDay;
      const subMatch = matchBillToTransaction(s.provider_name, Number(s.amount));
      const icon = subMatch ? '✅' : isDue ? '❌' : '⏳';
      const note = subMatch ? ` — paid ${fmt(subMatch.amount)}` : isDue ? ' — *no payment found*' : '';
      text += `${icon} ${s.provider_name} (day ${dayNum}) — *${fmt(Number(s.amount))}*${note}\n`;
    }
  }

  return { text };
}

async function getOverchargeAssessments(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('overcharge_assessments')
    .select('provider_name, subscription_category, current_price, market_avg_price, overcharge_score, estimated_annual_saving, signals, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('overcharge_score', { ascending: false });

  if (error) {
    return { text: `Unable to load overcharge assessments: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return {
      text: `No active overcharge assessments found. Assessments are generated automatically when you have a connected bank account with recurring payments.`,
    };
  }

  const totalSaving = data.reduce((s, a) => s + (parseFloat(String(a.estimated_annual_saving)) || 0), 0);

  let text = `*Overcharge Assessments*\n`;
  text += `Potential annual saving: *${fmt(totalSaving)}*\n\n`;

  for (const a of data) {
    const score = a.overcharge_score ?? 0;
    const risk = score >= 80 ? '🔴 High' : score >= 60 ? '🟠 Medium' : '🟡 Low';
    text += `*${a.provider_name}* (${a.subscription_category})\n`;
    text += `  Risk: ${risk} | Score: ${score}/100\n`;
    if (a.current_price && a.market_avg_price) {
      text += `  You pay: ${fmt(a.current_price)}/mo | Market avg: ${fmt(a.market_avg_price)}/mo\n`;
    }
    text += `  Potential saving: *${fmt(a.estimated_annual_saving)}/year*\n\n`;
  }

  return { text };
}

async function getProfile(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, email, phone, address, postcode, subscription_tier, subscription_status, created_at')
    .eq('id', userId)
    .single();

  if (!profile) {
    return { text: `Profile not found.` };
  }

  const name = profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Not set';
  const tier = profile.subscription_tier ?? 'free';
  const tierLabel: Record<string, string> = {
    free: 'Free',
    essential: 'Essential (£4.99/mo)',
    pro: 'Pro (£9.99/mo)',
  };
  const status = profile.subscription_status ?? 'active';
  const memberSince = profile.created_at ? fmtDate(profile.created_at) : 'Unknown';

  let text = `*Your Account Profile*\n\n`;
  text += `*Name:* ${name}\n`;
  text += `*Email:* ${profile.email ?? 'Not set'}\n`;
  text += `*Phone:* ${profile.phone ?? 'Not set'}\n`;
  text += `*Address:* ${[profile.address, profile.postcode].filter(Boolean).join(', ') || 'Not set'}\n\n`;
  text += `*Plan:* ${tierLabel[tier] ?? tier}\n`;
  text += `*Status:* ${status}\n`;
  text += `*Member since:* ${memberSince}\n`;

  if (tier === 'free') {
    text += `\n\n💡 _To unlock bank sync, full monthly spending breakdowns, budget tracking, and smart alerts — upgrade to Essentials (£4.99/mo) or Pro (£9.99/mo) at paybacker.co.uk/dashboard/upgrade_`;
  }

  return { text };
}

async function getTasks(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  status?: string,
  limit?: number,
): Promise<ToolResult> {
  const targetStatus = status && status !== 'all' ? status : null;
  const maxResults = limit ?? 20;

  let query = supabase
    .from('tasks')
    .select('id, title, description, type, status, priority, created_at, provider_name')
    .eq('user_id', userId)
    .neq('type', 'opportunity') // opportunities have their own tool
    .order('created_at', { ascending: false })
    .limit(maxResults);

  if (targetStatus) {
    query = query.eq('status', targetStatus);
  } else {
    query = query.in('status', ['pending', 'pending_review', 'in_progress']);
  }

  const { data, error } = await query;

  if (error) {
    return { text: `Unable to load tasks: ${error.message}` };
  }

  if (!data || data.length === 0) {
    const statusLabel = targetStatus ?? 'pending';
    return { text: `No ${statusLabel} tasks found. Tasks are created when you use the dispute tool, opportunity scanner, or create them manually.` };
  }

  const priorityEmoji: Record<string, string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪' };

  let text = `*Your Tasks (${data.length})*\n\n`;
  for (const t of data) {
    const p = priorityEmoji[t.priority ?? 'medium'] ?? '🟡';
    const provider = t.provider_name ? ` — ${t.provider_name}` : '';
    text += `${p} *${t.title}*${provider}\n`;
    text += `   ${t.type.replace(/_/g, ' ')} | ${fmtDate(t.created_at)}\n\n`;
  }

  return { text };
}

async function getScannerResults(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  status?: string,
): Promise<ToolResult> {
  const targetStatus = status && status !== 'all' ? status : 'pending_review';

  // Query both task types for opportunity scanner results
  // 'suggested' is used for low-confidence items; both are shown here
  const statusFilter =
    targetStatus === 'pending_review'
      ? ['pending_review', 'suggested']
      : [targetStatus];

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, description, priority, status, created_at, provider_name')
    .eq('user_id', userId)
    .eq('type', 'opportunity')
    .in('status', statusFilter)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    // Fallback: try money_hub_alerts which the scanner also populates
    const { data: alerts, error: alertErr } = await supabase
      .from('money_hub_alerts')
      .select('id, title, description, type, value_gbp, created_at, metadata')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(25);

    if (alertErr || !alerts || alerts.length === 0) {
      return {
        text: `No email scanner findings yet. Run a scan from paybacker.co.uk/dashboard/scanner to detect overcharges, price increases, and refund opportunities.`,
      };
    }

    const priorityEmoji: Record<string, string> = {
      flight_delay: '✈️', price_increase: '🔴', refund: '💰',
      overcharge: '🔴', forgotten_subscription: '💸', other: '🟡',
    };

    let fallbackText = `*Email Scanner Findings (${alerts.length})*\n\n`;
    for (const item of alerts) {
      const emoji = priorityEmoji[item.type] ?? '🟡';
      fallbackText += `${emoji} *${item.title}*\n`;
      if (item.description) fallbackText += `   ${item.description}\n`;
      if (item.value_gbp && Number(item.value_gbp) > 0) {
        fallbackText += `   Potential saving: *${fmt(item.value_gbp)}/year*\n`;
      }
      fallbackText += `   Found: ${fmtDate(item.created_at)}\n\n`;
    }
    fallbackText += `_Visit paybacker.co.uk/dashboard/scanner to action these findings._`;
    return { text: fallbackText };
  }

  // Also query email_scan_findings for the expanded scanner results
  const { data: extFindings } = await supabase
    .from('email_scan_findings')
    .select('id, finding_type, provider, title, description, amount, due_date, previous_amount, urgency, created_at')
    .eq('user_id', userId)
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(20);

  // Dispute correspondence (supplier responses)
  const { data: dispCorr } = await supabase
    .from('dispute_correspondence')
    .select('id, provider, subject, correspondence_type, summary, created_at')
    .eq('user_id', userId)
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(5);

  // Pending cancellations
  const { data: cancelPending } = await supabase
    .from('cancellation_tracking')
    .select('id, provider, effective_date, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);

  const hasExtended = (extFindings && extFindings.length > 0) || (dispCorr && dispCorr.length > 0);

  if (!data || data.length === 0) {
    if (!hasExtended) {
      // Also check money_hub_alerts before giving up
      const { data: alerts } = await supabase
        .from('money_hub_alerts')
        .select('id, title, description, type, value_gbp, created_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10);

      if (alerts && alerts.length > 0) {
        const priorityEmoji: Record<string, string> = {
          flight_delay: '✈️', price_increase: '🔴', refund: '💰',
          overcharge: '🔴', forgotten_subscription: '💸', other: '🟡',
        };
        let altText = `*Email Scanner Findings (${alerts.length})*\n\n`;
        for (const item of alerts) {
          const emoji = priorityEmoji[item.type] ?? '🟡';
          altText += `${emoji} *${item.title}*\n`;
          if (item.description) altText += `   ${item.description}\n`;
          if (item.value_gbp && Number(item.value_gbp) > 0) {
            altText += `   Potential saving: *${fmt(item.value_gbp)}/year*\n`;
          }
          altText += `   Found: ${fmtDate(item.created_at)}\n\n`;
        }
        altText += `_Visit paybacker.co.uk/dashboard/scanner to action these findings._`;
        return { text: altText };
      }

      return {
        text: `No email scanner findings yet. Connect Gmail or Outlook on the Scanner page (paybacker.co.uk/dashboard/scanner) to scan for overcharges, price increases, and refund opportunities.`,
      };
    }
  }

  const priorityEmoji: Record<string, string> = { high: '🔴', medium: '🟠', low: '🟡' };
  const typeEmoji: Record<string, string> = {
    bill: '📄', contract: '📋', dispute_response: '📩', cancellation_confirmation: '✅',
    bank_gap: '💸', price_increase: '🔴', flight_delay: '✈️', refund_opportunity: '💰',
    overcharge: '🔴', forgotten_subscription: '💸', renewal: '📅', deal_expiry: '⏰',
  };

  let text = '';
  const totalCount = (data?.length || 0) + (extFindings?.length || 0) + (dispCorr?.length || 0);
  text = `*Email Scanner Findings (${totalCount})*\n\n`;

  // Standard opportunity findings (tasks table)
  for (const item of data || []) {
    const p = priorityEmoji[item.priority ?? 'medium'] ?? '🟡';
    const provider = item.provider_name ? ` — ${item.provider_name}` : '';
    text += `${p} *${item.title}*${provider}\n`;
    try {
      const parsed = JSON.parse(item.description ?? '{}');
      if (parsed.description) text += `   ${parsed.description}\n`;
      if (parsed.amount && parsed.amount > 0) text += `   Potential saving: *${fmt(parsed.amount)}/year*\n`;
    } catch {
      if (item.description && item.description.length < 200) text += `   ${item.description}\n`;
    }
    text += `   Found: ${fmtDate(item.created_at)}\n\n`;
  }

  // Extended findings (bills, contracts, price increases, bank gaps)
  if (extFindings && extFindings.length > 0) {
    // Group by type for cleaner output
    const byType: Record<string, typeof extFindings> = {};
    for (const f of extFindings) {
      if (!byType[f.finding_type]) byType[f.finding_type] = [];
      byType[f.finding_type].push(f);
    }

    const typeLabels: Record<string, string> = {
      bill: 'Bills received', price_increase: 'Price increases', contract: 'Contracts detected',
      bank_gap: 'Not in your bank', cancellation_confirmation: 'Cancellations confirmed',
    };

    for (const [type, items] of Object.entries(byType)) {
      const emoji = typeEmoji[type] ?? '🟡';
      const label = typeLabels[type] ?? type.replace(/_/g, ' ');
      text += `*${label} (${items.length})*\n`;
      for (const f of items.slice(0, 3)) {
        const urgency = f.urgency === 'immediate' ? '🔴 ' : f.urgency === 'soon' ? '🟡 ' : '';
        let line = `${urgency}${emoji} *${f.provider}*`;
        if (f.amount) line += `: ${fmt(f.amount)}`;
        if (f.due_date) line += ` — due ${fmtDate(f.due_date)}`;
        text += `${line}\n`;
        if (f.description) text += `   ${f.description.substring(0, 120)}\n`;
      }
      text += '\n';
    }
  }

  // Dispute correspondence
  if (dispCorr && dispCorr.length > 0) {
    text += `*Supplier responses to disputes (${dispCorr.length})*\n`;
    for (const d of dispCorr) {
      const typeIcon = d.correspondence_type === 'rejection' ? '❌' : d.correspondence_type === 'resolution' ? '✅' : d.correspondence_type === 'escalation' ? '⚠️' : '📩';
      text += `${typeIcon} *${d.provider}*: ${d.subject || 'No subject'}\n`;
      if (d.summary) text += `   ${d.summary.substring(0, 120)}\n`;
    }
    text += '\nAsk me to help draft a follow-up response to any of these.\n\n';
  }

  // Pending cancellation verifications
  if (cancelPending && cancelPending.length > 0) {
    text += `*Pending cancellation verification (${cancelPending.length})*\n`;
    for (const c of cancelPending) {
      const eff = c.effective_date ? ` — effective ${fmtDate(c.effective_date)}` : '';
      text += `⏳ *${c.provider}*${eff}\n`;
    }
    text += '\nI\'m watching your bank statements to confirm these charges stopped.\n\n';
  }

  text += `_Visit paybacker.co.uk/dashboard/scanner to action these findings._`;

  return { text };
}

async function generateCancellationEmail(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider_name: string;
    category: string;
    amount?: number;
    account_email?: string;
  },
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, email')
    .eq('id', userId)
    .single();

  const fullName =
    profile?.full_name ??
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ??
    'Customer';

  const CATEGORY_LEGAL_CONTEXT: Record<string, string> = {
    broadband: `Reference Communications Act 2003 and Ofcom General Conditions. If out of contract: confirm right to cancel with 30 days notice. If in contract: request early termination charge details.`,
    mobile: `Reference Communications Act 2003 and Ofcom General Conditions. Request PAC code or STAC code. If out of contract: 30 days notice. If in contract: request early termination charges.`,
    energy: `Reference Ofgem Standards of Conduct and Ofgem Supplier Guaranteed Standards. Request final meter reading and final bill. Ask for any credit balance to be refunded within 10 working days (Ofgem requirement).`,
    insurance: `Reference Consumer Insurance (Disclosure and Representations) Act 2012 and FCA ICOBS. Request confirmation of any pro-rata refund for the unexpired portion.`,
    streaming: `Reference Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013. Request confirmation of cancellation and final billing date.`,
    fitness: `Reference Consumer Rights Act 2015. If gym has changed terms or facilities: reference right to cancel due to material change. Request written confirmation of cancellation.`,
    software: `Reference Consumer Contracts Regulations 2013 and Consumer Rights Act 2015 for digital content. Request cancellation confirmation and data deletion rights under GDPR.`,
    mortgage: `Reference FCA Mortgage Conduct of Business rules (MCOB). Request Early Repayment Charge (ERC) statement and full settlement figure.`,
    loan: `Reference Consumer Credit Act 1974, Section 94 (right to early settlement). Request settlement figure and any early repayment charges.`,
    utility: `Reference Water Industry Act 1991 (water) or Ofgem Standards of Conduct (energy). Request final bill and refund of any credit balance.`,
    council_tax: `Reference Council Tax (Administration and Enforcement) Regulations 1992. Write as a formal request to the council, not a consumer cancellation.`,
    gambling: `Reference Gambling Act 2005 and UK Gambling Commission Social Responsibility Code. Request immediate account closure and return of remaining balance.`,
    other: `Reference Consumer Rights Act 2015 and Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013. Request written confirmation of cancellation.`,
  };

  const legalContext = CATEGORY_LEGAL_CONTEXT[params.category] ?? CATEGORY_LEGAL_CONTEXT.other;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const costLine = params.amount ? `Cost: £${params.amount}/month` : '';
  const accountLine = params.account_email ? `Account email: ${params.account_email}` : (profile?.email ? `Account email: ${profile.email}` : '');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Write a formal cancellation letter from a UK consumer to ${params.provider_name}.

Customer name: ${fullName}
Today's date: ${today}
Provider: ${params.provider_name}
Category: ${params.category}
${costLine}
${accountLine}

Legal context:
${legalContext}

Requirements:
- Professional, formal tone
- Use correct legal references for this category (NOT generic Consumer Contracts Regulations unless appropriate)
- Request written confirmation of cancellation and final billing date
- Ask for any refund due
- Under 200 words
- Do NOT include subject line — body only, starting with "Dear ${params.provider_name} Customer Services,"
- Close with "Yours faithfully," and the customer name

Return as JSON: { "subject": "...", "body": "..." }`;

  let subject = `Cancellation Request — ${params.provider_name}`;
  let body = '';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      subject = parsed.subject ?? subject;
      body = parsed.body ?? rawText;
    } else {
      body = rawText;
    }
  } catch (err: any) {
    return { text: `Failed to generate cancellation email: ${err.message}` };
  }

  // Save to tasks for history
  await supabase.from('tasks').insert({
    user_id: userId,
    type: 'cancellation_email',
    title: `Cancellation: ${params.provider_name}`,
    description: `Cancellation email generated for ${params.provider_name} (${params.category})`,
    provider_name: params.provider_name,
    status: 'completed',
    priority: 'medium',
  });

  let text = `*Cancellation Email — ${params.provider_name}*\n\n`;
  text += `*Subject:* ${subject}\n\n`;
  text += `---\n${body}\n---\n\n`;
  text += `_Copy and send this to ${params.provider_name}'s customer services. Keep a record of when you send it._`;

  return { text };
}

// ============================================================
// MONEY HUB WRITE HANDLERS — subscription updates, FAC management
// ============================================================

async function updateSubscription(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider_name: string;
    billing_cycle?: string;
    amount?: number;
    next_billing_date?: string;
  },
): Promise<ToolResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from('subscriptions')
    .select('id, provider_name, billing_cycle, amount, next_billing_date')
    .eq('user_id', userId)
    .eq('status', 'active')
    .ilike('provider_name', `%${params.provider_name}%`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) return { text: `Failed to look up subscription: ${fetchErr.message}` };
  if (!existing) {
    return { text: `No active subscription found matching "${params.provider_name}". Use get_subscriptions to see what's tracked.` };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.billing_cycle) updates.billing_cycle = params.billing_cycle;
  if (params.amount !== undefined) updates.amount = params.amount;
  if (params.next_billing_date) updates.next_billing_date = params.next_billing_date;

  if (Object.keys(updates).length === 1) {
    return { text: 'Nothing to update — please specify a billing cycle, amount, or next billing date.' };
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', existing.id)
    .eq('user_id', userId);

  if (error) return { text: `Failed to update subscription: ${error.message}` };

  const changes: string[] = [];
  if (params.billing_cycle) {
    changes.push(`billing cycle: *${existing.billing_cycle ?? 'monthly'}* → *${params.billing_cycle}*`);
  }
  if (params.amount !== undefined) {
    changes.push(`amount: *${fmt(existing.amount)}* → *${fmt(params.amount)}*`);
  }
  if (params.next_billing_date) {
    changes.push(`next billing date: *${fmtDate(params.next_billing_date)}*`);
  }

  return { text: `Updated *${existing.provider_name}*:\n${changes.map(c => `• ${c}`).join('\n')}` };
}

async function dismissActionItem(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider_name: string; item_type: string },
): Promise<ToolResult> {
  const kw = params.provider_name.toLowerCase();
  const dismissed: string[] = [];
  const tryAll = params.item_type === 'any';

  // 1. Tasks (opportunity type)
  if (tryAll || params.item_type === 'task') {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, provider_name')
      .eq('user_id', userId)
      .eq('type', 'opportunity')
      .in('status', ['pending_review', 'suggested', 'pending']);

    const matches = (tasks ?? []).filter(t =>
      (t.provider_name ?? '').toLowerCase().includes(kw) ||
      (t.title ?? '').toLowerCase().includes(kw),
    );
    if (matches.length > 0) {
      await supabase
        .from('tasks')
        .update({ status: 'dismissed' })
        .in('id', matches.map(t => t.id));
      dismissed.push(`${matches.length} action item${matches.length > 1 ? 's' : ''}`);
    }
  }

  // 2. Email scan findings
  if (tryAll || params.item_type === 'finding') {
    const { data: findings } = await supabase
      .from('email_scan_findings')
      .select('id, provider, title')
      .eq('user_id', userId)
      .in('status', ['new', 'pending_review']);

    const matches = (findings ?? []).filter(f =>
      (f.provider ?? '').toLowerCase().includes(kw) ||
      (f.title ?? '').toLowerCase().includes(kw),
    );
    if (matches.length > 0) {
      await supabase
        .from('email_scan_findings')
        .update({ status: 'dismissed' })
        .in('id', matches.map(f => f.id));
      dismissed.push(`${matches.length} email finding${matches.length > 1 ? 's' : ''}`);
    }
  }

  // 3. Money Hub alerts
  if (tryAll || params.item_type === 'alert') {
    const { data: alerts } = await supabase
      .from('money_hub_alerts')
      .select('id, title')
      .eq('user_id', userId)
      .eq('status', 'active')
      .ilike('title', `%${params.provider_name}%`);

    if (alerts && alerts.length > 0) {
      await supabase
        .from('money_hub_alerts')
        .update({ status: 'dismissed' })
        .in('id', alerts.map(a => a.id));
      dismissed.push(`${alerts.length} alert${alerts.length > 1 ? 's' : ''}`);
    }
  }

  if (dismissed.length === 0) {
    return {
      text: `No action centre items found matching "${params.provider_name}". Use get_scanner_results to see what's in your action centre.`,
    };
  }

  return {
    text: `Dismissed ${dismissed.join(' and ')} for *${params.provider_name}* from your action centre. ✅`,
  };
}

async function markBillPaid(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider_name: string; amount?: number; paid_date?: string },
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const paidDate = params.paid_date ?? now.toISOString().split('T')[0];

  const { error } = await supabase
    .from('manual_bill_payments')
    .upsert(
      {
        user_id: userId,
        provider_name: params.provider_name,
        year,
        month,
        amount: params.amount ?? null,
        paid_date: paidDate,
      },
      { onConflict: 'user_id,provider_name,year,month' },
    );

  if (error) return { text: `Failed to mark bill as paid: ${error.message}` };

  const amtStr = params.amount ? ` (${fmt(params.amount)})` : '';
  const monthLabel = new Date(year, month - 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  return {
    text: `Marked *${params.provider_name}*${amtStr} as paid for ${monthLabel}. ✅\nIt will now show as paid in your expected bills.`,
  };
}

async function createSupportTicket(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  channel: 'telegram' | 'whatsapp' | 'chatbot',
  params: {
    subject: string;
    description: string;
    category: string;
    priority: string;
  },
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  // Look up the channel-appropriate session so Riley can reply via
  // the same channel the user raised the ticket from. Channel is
  // passed through executeToolCall so a WhatsApp-raised ticket stops
  // being mis-tagged as 'telegram' (Paul's bug 2026-04-29).
  let telegramChatId: number | null = null;
  let whatsappPhone: string | null = null;
  if (channel === 'telegram') {
    const { data: tgSession } = await supabase
      .from('telegram_sessions')
      .select('chat_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    telegramChatId = tgSession?.chat_id ?? null;
  } else if (channel === 'whatsapp') {
    const { data: waSession } = await supabase
      .from('whatsapp_sessions')
      .select('whatsapp_phone')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    whatsappPhone = waSession?.whatsapp_phone ?? null;
  }

  // Source reflects where the ticket was actually raised, not where
  // Riley happens to be reachable. Hardcoded mapping by call channel.
  const ticketSource: 'telegram' | 'whatsapp' | 'chatbot' = channel;

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      subject: params.subject,
      description: params.description,
      category: params.category,
      priority: params.priority,
      source: ticketSource,
      status: 'open',
      metadata: {
        channel,
        telegram_chat_id: telegramChatId,
        whatsapp_phone: whatsappPhone,
        session_lookup_at: new Date().toISOString(),
        // Bot is about to send the confirmation email synchronously
        // below — pre-mark this so the support-agent cron skips its
        // own (older-format) confirmation and we don't double-email.
        confirmation_sent: true,
      },
    })
    .select('id, ticket_number, created_at')
    .single();

  if (error || !ticket) {
    return { text: `Failed to create support ticket: ${error?.message ?? 'Unknown error'}` };
  }

  // Insert first message
  await supabase.from('ticket_messages').insert({
    ticket_id: ticket.id,
    sender_type: 'user',
    sender_name: profile?.email ?? 'User',
    message: params.description,
  });

  const ref = ticket.ticket_number || ticket.id.substring(0, 8).toUpperCase();
  const userEmail = profile?.email;
  const userName = profile?.full_name || 'there';

  // Send confirmation email via the shared helper (single template,
  // matches what the support-agent cron sends on its first pass).
  // Pre-marking metadata.confirmation_sent above guarantees we don't
  // double-email if the cron beats us to it.
  if (userEmail) {
    const { sendTicketConfirmationEmail } = await import('@/lib/support/confirmation-email');
    const firstName = (profile?.full_name || '').split(' ')[0] || 'there';
    const result = await sendTicketConfirmationEmail({
      toEmail: userEmail,
      userFirstName: firstName,
      ticketRef: ref,
      subject: params.subject,
      priority: params.priority,
    });
    if (!result.ok) {
      console.error('[createSupportTicket] Confirmation email failed:', result.error);
    }
  }

  // Trigger Riley immediately — fire-and-forget. Without this the user
  // waits up to 15 min for the cron to pick up their ticket. Riley
  // uses the same logic on this hot-path call as the cron does, so
  // the response is identical either way.
  if (process.env.CRON_SECRET) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
    fetch(`${origin}/api/cron/support-agent`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    }).catch((err) => {
      console.warn('[createSupportTicket] failed to trigger support-agent:', err);
    });
  }

  // Send notification email to support team
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from: 'Paybacker System <noreply@paybacker.co.uk>',
      to: 'support@paybacker.co.uk',
      subject: `New support ticket: ${ref} — ${params.subject}`,
      html: `<div style="font-family:sans-serif;padding:20px;max-width:600px;">
        <h2 style="color:#f59e0b;margin:0 0 16px;">New Support Ticket</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;font-weight:bold;">Ticket:</td><td>${ref}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">From:</td><td>${userEmail || 'Unknown'} (${userName})</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Subject:</td><td>${params.subject}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Category:</td><td>${params.category}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Priority:</td><td>${params.priority}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Source:</td><td>Telegram Bot</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        <h3 style="margin:0 0 8px;">Description:</h3>
        <pre style="white-space:pre-wrap;background:#f3f4f6;padding:15px;border-radius:8px;color:#111827;font-size:13px;">${params.description}</pre>
        <p style="color:#6b7280;font-size:12px;margin-top:16px;">View in admin: paybacker.co.uk/dashboard/admin</p>
      </div>`,
    });
  } catch (emailErr) {
    console.error('[createSupportTicket] Failed to send admin email:', emailErr);
  }

  let text = `*Support Ticket Created*\n\n`;
  text += `*Reference:* #${ref}\n`;
  text += `*Subject:* ${params.subject}\n`;
  text += `*Priority:* ${params.priority}\n`;
  text += `*Status:* Open\n\n`;
  text += `Our team will respond within 24 hours. You'll receive an email at ${userEmail ?? 'your registered email'} when we reply.\n\n`;
  text += `_Reply to the confirmation email if you need to add more details._`;

  return { text };
}

// ============================================================
// NOTIFICATION SCHEDULE HANDLERS
// ============================================================
// Implementations for the user-configurable schedule tools. The
// agent calls these when the user asks things like "send me a morning
// summary at 9am" or "stop sending renewal reminders". Tier gates +
// validation enforced here, not at the schema level — that way the
// agent can return helpful upgrade prompts to the user rather than a
// blank failure.

/**
 * Schedule a notification event for the user. Called by the agent
 * after parsing their natural-language request into structured args.
 */
async function setNotificationSchedule(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const event = args.event as NotificationEventType;
  const meta = getEventMeta(event);
  if (!meta) {
    return { text: `Unknown notification event: ${event}.` };
  }

  // Tier gate
  const tier = await getEffectiveTier(userId);
  if (tier === 'free') {
    return {
      text:
        `Custom notification schedules are part of Paybacker Essential and Pro. ` +
        `Upgrade and you can configure your ${meta.label} timing yourself.\n\n` +
        `paybacker.co.uk/pricing`,
    };
  }

  // Schedule-kind gate — only schedulable events accept this tool. The
  // agent should pick disable/enable for system events, but defend here
  // anyway in case it slips.
  if (
    meta.scheduleKind !== 'cron' &&
    meta.scheduleKind !== 'lead_time' &&
    meta.scheduleKind !== 'threshold'
  ) {
    return {
      text:
        `${meta.label} can't be rescheduled — it's a real-time alert that fires when something is detected. ` +
        `You can use disable_notification or enable_notification instead.`,
    };
  }

  // Validate matching args
  const cronExpr = (args.cron_expression as string | undefined) ?? null;
  const leadTimeDays = (args.lead_time_days as number[] | undefined) ?? null;
  const thresholdPercent = (args.threshold_percent as number | undefined) ?? null;
  const customPrompt = (args.custom_prompt as string | undefined) ?? null;

  if (meta.scheduleKind === 'cron') {
    if (!cronExpr) {
      return {
        text: `That event needs a time. Tell me when, e.g. "9am every morning" → I\'ll set it to "0 9 * * *".`,
      };
    }
    if (cronExpr.trim().split(/\s+/).length !== 5) {
      return { text: `Invalid cron expression: must be 5 fields. Got "${cronExpr}".` };
    }
  } else if (meta.scheduleKind === 'lead_time') {
    if (!leadTimeDays || leadTimeDays.length === 0) {
      return {
        text: `${meta.label} needs days-before triggers. E.g. [60, 14] for 60 and 14 days ahead.`,
      };
    }
    if (leadTimeDays.some((d) => d < 0 || d > 365)) {
      return { text: `Lead-time days must be between 0 and 365.` };
    }
  } else if (meta.scheduleKind === 'threshold') {
    if (thresholdPercent == null) {
      return { text: `${meta.label} needs a threshold percentage (0-200).` };
    }
    if (thresholdPercent < 0 || thresholdPercent > 200) {
      return { text: `Threshold must be 0-200.` };
    }
  }

  // Pro-only: custom_prompt
  if (customPrompt && tier !== 'pro') {
    return {
      text:
        `Custom prompts are a Pro feature. I can still set the timing for you on Essential — ` +
        `try again without the style preference.`,
    };
  }

  // Upsert via the user_chat unique index — same (user, event, source=user_chat)
  // overwrites previous, no duplicates.
  const row = {
    user_id: userId,
    event_type: event,
    schedule_kind: meta.scheduleKind,
    cron_expression: cronExpr,
    cron_timezone: 'Europe/London',
    lead_time_days: leadTimeDays,
    threshold:
      thresholdPercent != null
        ? { value: thresholdPercent, unit: 'percent' }
        : null,
    custom_prompt: customPrompt,
    enabled: true,
    source: 'user_chat',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('user_notification_schedules')
    .upsert(row, { onConflict: 'user_id,event_type' });

  if (error) {
    return { text: `Couldn't save your schedule: ${error.message}` };
  }

  // Friendly confirmation per kind
  if (meta.scheduleKind === 'cron') {
    return {
      text: `✓ Saved. ${meta.label} will fire on cron "${cronExpr}" (${row.cron_timezone}).`,
    };
  }
  if (meta.scheduleKind === 'lead_time') {
    return {
      text: `✓ Saved. ${meta.label} will fire ${leadTimeDays!.join(', ')} days before each trigger.`,
    };
  }
  return {
    text: `✓ Saved. ${meta.label} will fire when you reach ${thresholdPercent}% of the limit.`,
  };
}

async function toggleNotification(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  event: string,
  enabled: boolean,
): Promise<ToolResult> {
  const meta = getEventMeta(event as NotificationEventType);
  if (!meta) return { text: `Unknown notification event: ${event}.` };

  if (!enabled && meta.mandatory) {
    return {
      text: `${meta.label} can't be disabled — these are required service notifications (e.g. support replies). Without them you wouldn't know when we'd answered you.`,
    };
  }

  if (!enabled && meta.critical) {
    // The agent should already have warned the user, but enforce a soft
    // confirmation hint in the response. We DO honour the disable — users
    // are adults — but flag it.
    // (No interruption here; the user said disable, we disable.)
  }

  // Upsert: keep existing custom_prompt / cron / etc. if any.
  const existing = await supabase
    .from('user_notification_schedules')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', event)
    .eq('source', 'user_chat')
    .maybeSingle();

  if (existing.data) {
    const { error } = await supabase
      .from('user_notification_schedules')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', existing.data.id);
    if (error) return { text: `Couldn't update: ${error.message}` };
  } else {
    // No row yet — insert one as 'always_on' kind so the toggle is recorded.
    const { error } = await supabase.from('user_notification_schedules').insert({
      user_id: userId,
      event_type: event,
      schedule_kind: 'always_on',
      enabled,
      source: 'user_chat',
    });
    if (error) return { text: `Couldn't update: ${error.message}` };
  }

  // Also reflect in notification_preferences so the dispatcher honours
  // it across all channels even if no per-channel pref existed yet.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (profile) {
    const update = enabled
      ? {
          email: meta.defaultEmail,
          telegram: meta.defaultTelegram,
          whatsapp: meta.defaultWhatsapp,
          push: meta.defaultPush,
        }
      : { email: false, telegram: false, whatsapp: false, push: false };
    await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          event_type: event,
          ...update,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,event_type' },
      );
  }

  return {
    text: enabled
      ? `✓ ${meta.label} is back on.`
      : `✓ ${meta.label} is off. Tell me "turn ${meta.label} back on" any time.`,
  };
}

async function listNotificationSchedules(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const tier = await getEffectiveTier(userId);

  const { data: rows } = await supabase
    .from('user_notification_schedules')
    .select('event_type, schedule_kind, cron_expression, lead_time_days, threshold, custom_prompt, enabled')
    .eq('user_id', userId)
    .eq('source', 'user_chat')
    .order('event_type');

  interface ScheduleListRow {
    event_type: string;
    schedule_kind: string;
    cron_expression: string | null;
    lead_time_days: number[] | null;
    threshold: { value: number; unit: string } | null;
    custom_prompt: string | null;
    enabled: boolean;
  }
  const customByEvent = new Map<string, ScheduleListRow>();
  for (const r of (rows ?? []) as ScheduleListRow[]) customByEvent.set(r.event_type, r);

  let text = `*Your notification schedules*\n\n`;

  // Group by category so the user can quickly see what's scheduled, what's
  // detection-driven, and what's mandatory.
  const grouped: Record<string, string[]> = {
    schedulable: [],
    lead_time: [],
    threshold: [],
    system: [],
  };

  for (const meta of EVENT_CATALOG) {
    if (meta.scheduleKind === 'none') continue;

    const custom = customByEvent.get(meta.event);
    const enabled = custom?.enabled ?? true;

    let line = `${enabled ? '🔔' : '🔕'} ${meta.label}`;
    if (meta.proOnly) line += ` (Pro)`;
    if (meta.mandatory) line += ` _required_`;

    if (custom && enabled) {
      if (meta.scheduleKind === 'cron' && custom.cron_expression) {
        line += ` — _custom: ${custom.cron_expression}_`;
      } else if (meta.scheduleKind === 'lead_time' && custom.lead_time_days?.length) {
        line += ` — _${custom.lead_time_days.join(', ')}d ahead_`;
      } else if (meta.scheduleKind === 'threshold' && custom.threshold) {
        const t = custom.threshold as { value: number; unit: string };
        line += ` — _at ${t.value}${t.unit === 'percent' ? '%' : ''}_`;
      }
      if (custom.custom_prompt) {
        line += ` 🎨`;
      }
    } else if (meta.scheduleKind === 'cron' && meta.defaultCron) {
      line += ` — default ${meta.defaultCron}`;
    } else if (meta.scheduleKind === 'lead_time' && meta.defaultLeadTimeDays) {
      line += ` — default ${meta.defaultLeadTimeDays.join(', ')}d ahead`;
    }

    if (meta.scheduleKind === 'cron') grouped.schedulable.push(line);
    else if (meta.scheduleKind === 'lead_time') grouped.lead_time.push(line);
    else if (meta.scheduleKind === 'threshold') grouped.threshold.push(line);
    else grouped.system.push(line);
  }

  if (grouped.schedulable.length > 0) {
    text += `*Daily/weekly summaries* (you set the time):\n${grouped.schedulable.join('\n')}\n\n`;
  }
  if (grouped.lead_time.length > 0) {
    text += `*Reminders* (you set days-ahead):\n${grouped.lead_time.join('\n')}\n\n`;
  }
  if (grouped.threshold.length > 0) {
    text += `*Threshold alerts* (you set the trigger):\n${grouped.threshold.join('\n')}\n\n`;
  }
  if (grouped.system.length > 0) {
    text += `*Real-time alerts* (fire when detected):\n${grouped.system.join('\n')}\n\n`;
  }

  if (tier === 'free') {
    text += `_Upgrade to Essential or Pro to customise these times yourself._\n`;
  } else if (tier === 'essential') {
    text += `_Pro adds custom prompts (style preferences) per schedule._\n`;
  }

  return { text };
}

async function setQuietHours(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  args: { start: string; end: string },
): Promise<ToolResult> {
  const valid = (s: string) => /^$|^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
  if (!valid(args.start) || !valid(args.end)) {
    return { text: `Times must be HH:MM (24h) or empty. Got start="${args.start}" end="${args.end}".` };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      quiet_hours_start: args.start || null,
      quiet_hours_end: args.end || null,
    })
    .eq('id', userId);

  if (error) return { text: `Couldn't save quiet hours: ${error.message}` };

  if (!args.start && !args.end) {
    return { text: `✓ Quiet hours cleared. You'll receive Pocket Agent and push notifications 24/7.` };
  }
  return {
    text: `✓ Quiet hours: ${args.start} → ${args.end} (Europe/London). I'll hold Pocket Agent and push notifications during that window. Email still lands in your inbox.`,
  };
}

// ============================================================
// PARITY BATCH HANDLERS (2026-04-29)
// ============================================================

async function dismissPriceAlert(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider: string,
): Promise<ToolResult> {
  const { data: alerts } = await supabase
    .from('price_increase_alerts')
    .select('id, provider_name, new_amount, old_amount')
    .eq('user_id', userId)
    .eq('status', 'active')
    .ilike('provider_name', `%${provider}%`);
  if (!alerts || alerts.length === 0) {
    return { text: `No active price alerts found for "${provider}". Run detect_price_increases if you want me to check for new ones.` };
  }
  await supabase
    .from('price_increase_alerts')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .in('id', alerts.map((a) => a.id));
  return { text: `✓ Dismissed ${alerts.length} price alert${alerts.length === 1 ? '' : 's'} for ${alerts[0].provider_name}.` };
}

async function updateProfile(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { full_name?: string; phone?: string; contact_email?: string },
): Promise<ToolResult> {
  const updates: Record<string, string> = {};
  const changes: string[] = [];
  if (params.full_name?.trim()) {
    updates.full_name = params.full_name.trim();
    changes.push(`name → "${params.full_name.trim()}"`);
  }
  if (params.phone?.trim()) {
    updates.phone = params.phone.trim();
    changes.push(`phone → ${params.phone.trim()}`);
  }
  if (params.contact_email?.trim()) {
    updates.contact_email = params.contact_email.trim().toLowerCase();
    changes.push(`contact email → ${params.contact_email.trim().toLowerCase()}`);
  }
  if (changes.length === 0) {
    return { text: 'Tell me what to change — e.g. "set my name to Paul Airey", "update my phone to 07918188396".' };
  }
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) return { text: `Failed to update profile: ${error.message}` };
  return { text: `✓ Updated: ${changes.join(', ')}.` };
}

async function listEmailConnections(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data } = await supabase
    .from('email_connections')
    .select('email_address, provider_type, status, last_scanned_at, archived_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (!data || data.length === 0) {
    return { text: 'No email accounts connected. Connect Gmail or Outlook from your Profile page to enable inbox scanning + Watchdog.' };
  }
  let text = `*Connected email accounts (${data.length}):*\n`;
  for (const c of data) {
    const stale = c.archived_at ? ' (archived)' : c.status !== 'active' ? ` (${c.status})` : '';
    const last = c.last_scanned_at ? ` · last scanned ${fmtDate(c.last_scanned_at)}` : ' · never scanned';
    text += `\n• *${c.email_address}* — ${c.provider_type}${stale}${last}`;
  }
  return { text };
}

async function disconnectEmailConnection(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  emailAddress: string,
): Promise<ToolResult> {
  const target = emailAddress.toLowerCase().trim();
  const { data: conn } = await supabase
    .from('email_connections')
    .select('id, email_address')
    .eq('user_id', userId)
    .ilike('email_address', target)
    .maybeSingle();
  if (!conn) {
    return { text: `No email connection matching "${emailAddress}" — call list_email_connections to see what's linked.` };
  }
  await supabase
    .from('email_connections')
    .update({ status: 'disconnected', archived_at: new Date().toISOString() })
    .eq('id', conn.id);
  // Also disable any watchdog links using this connection
  await supabase
    .from('dispute_watchdog_links')
    .update({ sync_enabled: false, updated_at: new Date().toISOString() })
    .eq('email_connection_id', conn.id)
    .eq('sync_enabled', true);
  return { text: `✓ Disconnected ${conn.email_address}. Any Watchdog threads using it have been paused — re-link them after reconnecting.` };
}

async function addCorrespondenceNote(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider: string; entry_type: string; title?: string; content: string },
): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, params.provider);
  if (!resolved.ok) return { text: resolved.text };
  const allowed = ['user_note', 'phone_call', 'company_email', 'company_letter', 'company_response'];
  if (!allowed.includes(params.entry_type)) {
    return { text: `entry_type must be one of: ${allowed.join(', ')}` };
  }
  if (!params.content?.trim()) {
    return { text: 'Need some content for the note — re-send with the actual text.' };
  }
  const { error } = await supabase.from('correspondence').insert({
    dispute_id: resolved.dispute.id,
    user_id: userId,
    entry_type: params.entry_type,
    title: params.title || null,
    content: params.content,
    summary: params.content.slice(0, 200),
    entry_date: new Date().toISOString(),
    detected_from_email: false,
  });
  if (error) return { text: `Failed to save note: ${error.message}` };
  return { text: `✓ Logged "${params.title || params.entry_type.replace(/_/g, ' ')}" on the *${resolved.dispute.provider_name}* dispute timeline.` };
}

async function listWatchdogLinks(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider?: string,
): Promise<ToolResult> {
  let query = supabase
    .from('dispute_watchdog_links')
    .select('id, dispute_id, provider, subject, sender_address, sync_enabled, last_synced_at, last_message_date, disputes!inner(provider_name)')
    .eq('user_id', userId)
    .eq('sync_enabled', true)
    .order('updated_at', { ascending: false });
  if (provider) {
    query = query.ilike('disputes.provider_name', `%${provider}%`);
  }
  const { data } = await query;
  if (!data || data.length === 0) {
    return { text: provider ? `No active watchdog links for "${provider}".` : 'No active watchdog links. Use find_email_thread_for_dispute + link_email_thread_to_dispute on a dispute to start watching one.' };
  }
  let text = `*Watching ${data.length} email thread${data.length === 1 ? '' : 's'}:*\n`;
  for (const l of data) {
    const disputeName = (l as { disputes?: { provider_name?: string } }).disputes?.provider_name || 'unknown dispute';
    const lastSync = l.last_synced_at ? fmtDate(l.last_synced_at) : 'never';
    const lastMsg = l.last_message_date ? fmtDate(l.last_message_date) : 'no replies yet';
    text += `\n• *${disputeName}* — ${l.subject || '(no subject)'}\n  from ${l.sender_address || 'unknown'} · last synced ${lastSync} · last reply ${lastMsg}`;
  }
  return { text };
}

async function unlinkEmailThread(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider: string,
): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, provider);
  if (!resolved.ok) return { text: resolved.text };
  const { data: updated } = await supabase
    .from('dispute_watchdog_links')
    .update({ sync_enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('dispute_id', resolved.dispute.id)
    .eq('sync_enabled', true)
    .select('id');
  if (!updated || updated.length === 0) {
    return { text: `No active watchdog link to unlink on the *${resolved.dispute.provider_name}* dispute.` };
  }
  return { text: `✓ Stopped watching ${updated.length} email thread${updated.length === 1 ? '' : 's'} on the *${resolved.dispute.provider_name}* dispute. Any new supplier replies won't auto-import. Re-link any time with find_email_thread_for_dispute.` };
}

async function syncRepliesNow(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider: string,
): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, provider);
  if (!resolved.ok) return { text: resolved.text };
  // Trigger the existing sync endpoint via fetch so we reuse its logic.
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
  try {
    const res = await fetch(`${origin}/api/disputes/${resolved.dispute.id}/sync-replies-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        'X-User-Id': userId,
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      return { text: `Sync failed (${res.status}): ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    const imported = (data as { imported?: number }).imported ?? 0;
    return imported > 0
      ? { text: `✓ Synced *${resolved.dispute.provider_name}* — imported ${imported} new repl${imported === 1 ? 'y' : 'ies'}. Check the dispute timeline.` }
      : { text: `✓ Synced *${resolved.dispute.provider_name}* — no new replies since last check.` };
  } catch (err) {
    return { text: `Sync request failed: ${err instanceof Error ? err.message : 'unknown error'}. The watchdog cron will catch up on its next 30-min run.` };
  }
}

async function getNotifications(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  unreadOnly?: boolean,
): Promise<ToolResult> {
  let query = supabase
    .from('user_notifications')
    .select('id, type, title, body, read_at, created_at, dispute_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (unreadOnly) query = query.is('read_at', null);
  const { data } = await query;
  if (!data || data.length === 0) {
    return { text: unreadOnly ? 'No unread notifications.' : 'No notifications yet.' };
  }
  let text = `*${unreadOnly ? 'Unread' : 'Recent'} notifications (${data.length}):*\n`;
  for (const n of data) {
    const unreadDot = n.read_at ? '' : '🔵 ';
    text += `\n${unreadDot}*${n.title}*\n_${(n.body || '').slice(0, 120)}${(n.body || '').length > 120 ? '…' : ''}_\n${fmtDate(n.created_at)}`;
  }
  return { text };
}

async function markNotificationRead(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { notification_id?: string; all?: boolean },
): Promise<ToolResult> {
  if (params.all) {
    const { count } = await supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() }, { count: 'exact' })
      .eq('user_id', userId)
      .is('read_at', null);
    return { text: `✓ Marked ${count ?? 0} notification${count === 1 ? '' : 's'} as read.` };
  }
  if (!params.notification_id) {
    return { text: 'Pass either notification_id or all=true.' };
  }
  await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', params.notification_id)
    .eq('user_id', userId);
  return { text: `✓ Marked as read.` };
}

async function getMoneyRecoveryScore(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  // Compute an honest 0-100 score: 50% recovered savings vs. target,
  // 30% active-dispute progress, 20% subscription efficiency.
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_money_recovered')
    .eq('id', userId)
    .single();
  const recovered = Number(profile?.total_money_recovered || 0);
  const recoveredPct = Math.min(100, Math.floor((recovered / 1000) * 50)); // £1000 = 50 pts

  const { data: openDisputes } = await supabase
    .from('disputes')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['open', 'awaiting_response', 'escalated']);
  const activeCount = openDisputes?.length ?? 0;
  const disputePts = activeCount > 0 ? 30 : 10; // active engagement scores

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('id, status')
    .eq('user_id', userId);
  const total = subs?.length ?? 0;
  const cancelled = subs?.filter((s) => s.status === 'cancelled').length ?? 0;
  const subPts = total > 0 ? Math.floor((cancelled / total) * 20) : 10;

  const score = Math.min(100, recoveredPct + disputePts + subPts);
  let band = 'Getting started';
  if (score >= 80) band = 'Excellent';
  else if (score >= 60) band = 'Strong';
  else if (score >= 40) band = 'Building';
  else if (score >= 20) band = 'Just starting';
  return {
    text: `*Money Recovery Score: ${score}/100* — ${band}\n\n• Money recovered: ${fmt(recovered)} (${recoveredPct} pts)\n• Active disputes: ${activeCount} (${disputePts} pts)\n• Subscriptions cancelled: ${cancelled}/${total} (${subPts} pts)`,
  };
}

async function getTopMerchants(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { month?: string; limit?: number },
): Promise<ToolResult> {
  const limit = params.limit ?? 10;
  let query = supabase
    .from('bank_transactions')
    .select('merchant_name, amount')
    .eq('user_id', userId)
    .lt('amount', 0); // outgoing only
  if (params.month) {
    const start = `${params.month}-01`;
    const next = new Date(`${start}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    query = query.gte('timestamp', start).lt('timestamp', next.toISOString().slice(0, 10));
  }
  const { data } = await query.limit(5000);
  if (!data || data.length === 0) {
    return { text: params.month ? `No transactions for ${params.month}.` : 'No transactions yet — connect a bank to see top merchants.' };
  }
  const totals = new Map<string, { total: number; count: number }>();
  for (const t of data) {
    const m = t.merchant_name || 'Unknown';
    const cur = totals.get(m) ?? { total: 0, count: 0 };
    cur.total += Math.abs(Number(t.amount) || 0);
    cur.count += 1;
    totals.set(m, cur);
  }
  const top = Array.from(totals.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, limit);
  let text = `*Top ${top.length} merchants${params.month ? ` (${params.month})` : ' (all-time)'}:*\n`;
  top.forEach(([name, v], i) => {
    text += `\n${i + 1}. *${name}* — ${fmt(v.total)} across ${v.count} txn${v.count === 1 ? '' : 's'}`;
  });
  return { text };
}

async function getSavingsRate(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  // Last 3 months: income - spending / income.
  const now = new Date();
  const months: Array<{ key: string; income: number; spending: number }> = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
    const start = d.toISOString().slice(0, 10);
    const next = new Date(d);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const end = next.toISOString().slice(0, 10);
    const { data } = await supabase
      .from('bank_transactions')
      .select('amount')
      .eq('user_id', userId)
      .gte('timestamp', start)
      .lt('timestamp', end)
      .limit(5000);
    let income = 0;
    let spending = 0;
    for (const t of data ?? []) {
      const a = Number(t.amount) || 0;
      if (a > 0) income += a;
      else spending += Math.abs(a);
    }
    months.push({ key: start.slice(0, 7), income, spending });
  }
  let text = `*Savings rate (last 3 months):*\n`;
  for (const m of months) {
    const rate = m.income > 0 ? Math.round(((m.income - m.spending) / m.income) * 100) : 0;
    text += `\n• ${m.key}: ${rate}% (${fmt(m.income - m.spending)} saved on ${fmt(m.income)} income)`;
  }
  const totalIncome = months.reduce((s, m) => s + m.income, 0);
  const totalSpending = months.reduce((s, m) => s + m.spending, 0);
  const avgRate = totalIncome > 0 ? Math.round(((totalIncome - totalSpending) / totalIncome) * 100) : 0;
  text += `\n\n*3-month avg: ${avgRate}%*`;
  return { text };
}

async function detectPriceIncreasesNow(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
  try {
    const res = await fetch(`${origin}/api/price-alerts/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
    });
    const data = await res.json();
    const alerts = (data as { alerts?: unknown[] }).alerts ?? [];
    if (alerts.length === 0) {
      return { text: '✓ Ran the price-increase detector — no new rises found across your subscriptions.' };
    }
    return { text: `🔔 Found ${alerts.length} new price increase${alerts.length === 1 ? '' : 's'}. Call get_price_alerts to see them.` };
  } catch (err) {
    return { text: `Detection failed: ${err instanceof Error ? err.message : 'unknown'}.` };
  }
}

async function getContractAlertsForBot(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  withinDays?: number,
): Promise<ToolResult> {
  const days = withinDays ?? 60;
  const cutoff = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('subscriptions')
    .select('provider_name, contract_end_date, amount, billing_cycle, early_exit_fee, auto_renews')
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('contract_end_date', 'is', null)
    .gte('contract_end_date', today)
    .lte('contract_end_date', cutoff)
    .order('contract_end_date', { ascending: true });
  if (!data || data.length === 0) {
    return { text: `No contracts ending within ${days} days.` };
  }
  let text = `*Contracts ending within ${days} days:*\n`;
  for (const c of data) {
    text += `\n• *${c.provider_name}* — ends ${fmtDate(c.contract_end_date)} · ${fmt(c.amount)}/${c.billing_cycle}${c.auto_renews ? ' · auto-renews' : ''}${c.early_exit_fee ? ` · exit fee ${fmt(c.early_exit_fee)}` : ''}`;
  }
  return { text };
}

async function redeemLoyaltyPoints(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  rewardId?: string,
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('loyalty_points, loyalty_tier')
    .eq('id', userId)
    .single();
  const points = Number(profile?.loyalty_points ?? 0);
  if (!rewardId) {
    return {
      text: `You have *${points} points* (${profile?.loyalty_tier || 'Bronze'} tier). Open redemptions: paybacker.co.uk/dashboard/loyalty — pick a reward there and I can confirm redemption back here. (Redemption flow runs on the website to handle the discount-code generation.)`,
    };
  }
  return { text: `Pass through to website: paybacker.co.uk/dashboard/loyalty to redeem reward ${rewardId} (need ${points} points). Redemption confirmation will email you.` };
}

async function bankSyncNow(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
  try {
    const res = await fetch(`${origin}/api/bank/sync-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
    });
    if (!res.ok) {
      const txt = await res.text();
      return { text: `Sync failed (${res.status}): ${txt.slice(0, 200)}` };
    }
    return { text: `✓ Bank sync triggered. New transactions usually appear within 30 seconds — check Money Hub.` };
  } catch (err) {
    return { text: `Sync request failed: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

async function runEmailScan(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
  try {
    const res = await fetch(`${origin}/api/email/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
    });
    if (!res.ok) {
      const txt = await res.text();
      return { text: `Scan failed (${res.status}): ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    const findings = (data as { findings?: number; opportunities?: number }).findings ?? (data as { opportunities?: number }).opportunities ?? 0;
    return findings > 0
      ? { text: `🔎 Inbox scan complete — found ${findings} new opportunit${findings === 1 ? 'y' : 'ies'}. Call get_scanner_results to see them.` }
      : { text: `✓ Inbox scan complete — no new opportunities since last scan.` };
  } catch (err) {
    return { text: `Scan request failed: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

async function listSupportTickets(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  status?: string,
): Promise<ToolResult> {
  let query = supabase
    .from('support_tickets')
    .select('id, ticket_number, subject, status, priority, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10);
  if (status === 'open') {
    query = query.in('status', ['open', 'awaiting_reply', 'in_progress']);
  } else if (status === 'resolved') {
    query = query.in('status', ['resolved', 'closed']);
  }
  const { data } = await query;
  if (!data || data.length === 0) {
    return { text: 'No support tickets.' };
  }
  let text = `*Support tickets (${data.length}):*\n`;
  for (const t of data) {
    text += `\n• *${t.ticket_number || t.id.slice(0, 8)}* — ${t.subject}\n  ${t.status} · ${t.priority} · last updated ${fmtDate(t.updated_at)}`;
  }
  return { text };
}

async function addTicketMessage(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { ticket_ref: string; message: string },
): Promise<ToolResult> {
  if (!params.message?.trim()) return { text: 'Message text required.' };
  const isUuid = /^[0-9a-f]{8}-/i.test(params.ticket_ref);
  const { data: ticket } = isUuid
    ? await supabase.from('support_tickets').select('id, ticket_number').eq('id', params.ticket_ref).eq('user_id', userId).single()
    : await supabase.from('support_tickets').select('id, ticket_number').eq('ticket_number', params.ticket_ref.toUpperCase()).eq('user_id', userId).single();
  if (!ticket) return { text: `Ticket "${params.ticket_ref}" not found.` };
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).single();
  await supabase.from('ticket_messages').insert({
    ticket_id: ticket.id,
    sender_type: 'user',
    sender_name: profile?.email ?? 'User',
    message: params.message,
  });
  await supabase.from('support_tickets').update({ status: 'open', assigned_to: null, updated_at: new Date().toISOString() }).eq('id', ticket.id);
  return { text: `✓ Added your message to ${ticket.ticket_number || ticket.id.slice(0, 8)}. Riley will pick it up on the next 15-min sweep.` };
}

async function markSubscriptionCancellationSent(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider: string,
): Promise<ToolResult> {
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('id, provider_name')
    .eq('user_id', userId)
    .eq('status', 'active')
    .ilike('provider_name', `%${provider}%`);
  if (!subs || subs.length === 0) {
    return { text: `No active subscription found matching "${provider}".` };
  }
  if (subs.length > 1) {
    let t = `Multiple active subscriptions match "${provider}":\n`;
    for (const s of subs) t += `\n• ${s.provider_name}`;
    return { text: t + '\n\nNarrow it down with a more specific name.' };
  }
  await supabase
    .from('subscriptions')
    .update({ status: 'pending_cancellation', updated_at: new Date().toISOString() })
    .eq('id', subs[0].id);
  return { text: `✓ Marked *${subs[0].provider_name}* as pending cancellation. I'll watch your bank for the final charge — once it stops billing I'll flip it to fully cancelled.` };
}

async function refineLetter(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider: string; instruction: string },
): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, params.provider);
  if (!resolved.ok) return { text: resolved.text };
  // Pull the latest ai_letter for this dispute.
  const { data: letters } = await supabase
    .from('correspondence')
    .select('id, content')
    .eq('dispute_id', resolved.dispute.id)
    .eq('entry_type', 'ai_letter')
    .order('created_at', { ascending: false })
    .limit(1);
  if (!letters || letters.length === 0) {
    return { text: `No saved letter to refine on the *${resolved.dispute.provider_name}* dispute. Draft one first via draft_dispute_letter, save it, then refine.` };
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
  try {
    const res = await fetch(`${origin}/api/disputes/refine-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({
        letter: letters[0].content,
        instruction: params.instruction,
        disputeId: resolved.dispute.id,
      }),
    });
    const data = await res.json();
    const refined = (data as { letter?: string }).letter;
    if (!res.ok || !refined) {
      return { text: `Refine failed: ${(data as { error?: string }).error || 'unknown'}.` };
    }
    return { text: `*Refined letter for ${resolved.dispute.provider_name}:*\n\n${refined.slice(0, 3500)}\n\n📤 Reply *SAVE* to add this to the dispute history (replaces the previous draft on the timeline). Or ask for further tweaks.` };
  } catch (err) {
    return { text: `Refine request failed: ${err instanceof Error ? err.message : 'unknown'}.` };
  }
}

async function requestDataExport(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  format?: string,
): Promise<ToolResult> {
  const fmt2 = format === 'json' ? 'json' : 'csv';
  await supabase.from('business_log').insert({
    category: 'gdpr_request',
    title: `Data export requested — ${fmt2.toUpperCase()}`,
    content: `User ${userId} requested a GDPR data export (${fmt2}). Process within 30 days per UK GDPR — typically delivered within 24 hours via email.`,
    created_by: 'pocket-agent',
  });
  return { text: `✓ Data export requested in ${fmt2.toUpperCase()} format. Per UK GDPR you'll receive a download link by email within 30 days (typically within 24 hours). The link expires after 7 days for security. Email coming to your account address.` };
}

async function generateFormLetter(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { form_type: string; situation: string; desired_outcome: string },
): Promise<ToolResult> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
  try {
    const res = await fetch(`${origin}/api/forms/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({
        form_type: params.form_type,
        situation: params.situation,
        desired_outcome: params.desired_outcome,
      }),
    });
    const data = await res.json();
    const letter = (data as { letter?: string }).letter;
    if (!res.ok || !letter) {
      return { text: `Form generation failed: ${(data as { error?: string }).error || 'unknown'}.` };
    }
    return { text: `*${params.form_type.replace(/_/g, ' ')}:*\n\n${letter.slice(0, 3500)}\n\nCopy this, send to the relevant body, and reply SAVE if you want me to log it (currently form letters aren't tied to a Paybacker dispute timeline — that's coming).` };
  } catch (err) {
    return { text: `Form letter request failed: ${err instanceof Error ? err.message : 'unknown'}.` };
  }
}

// ============================================================
// PHASE 3a HANDLERS — edge actions
// ============================================================

async function completeTask(supabase: ReturnType<typeof getAdmin>, userId: string, taskId: string): Promise<ToolResult> {
  const { error } = await supabase.from('tasks').update({ status: 'completed', resolved_at: new Date().toISOString() }).eq('id', taskId).eq('user_id', userId);
  if (error) return { text: `Failed: ${error.message}` };
  return { text: '✓ Task marked complete.' };
}

async function snoozeTask(supabase: ReturnType<typeof getAdmin>, userId: string, taskId: string, days: number): Promise<ToolResult> {
  const days2 = Math.max(1, Math.min(30, days));
  const until = new Date(Date.now() + days2 * 86400_000).toISOString();
  const { error } = await supabase.from('tasks').update({ snooze_until: until, updated_at: new Date().toISOString() }).eq('id', taskId).eq('user_id', userId);
  if (error) return { text: `Snooze failed: ${error.message}. (The tasks table may not have a snooze_until column yet — feature partial.)` };
  return { text: `✓ Snoozed for ${days2} days. Will reappear ${fmtDate(until)}.` };
}

async function snoozeDispute(supabase: ReturnType<typeof getAdmin>, userId: string, provider: string, days: number): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, provider);
  if (!resolved.ok) return { text: resolved.text };
  const days2 = Math.max(1, Math.min(60, days));
  const newClock = new Date(Date.now() - 14 * 86400_000 + days2 * 86400_000).toISOString();
  await supabase.from('disputes').update({ last_letter_sent_at: newClock, last_reminder_sent: null, updated_at: new Date().toISOString() }).eq('id', resolved.dispute.id);
  const next = new Date(Date.now() + days2 * 86400_000);
  return { text: `✓ Snoozed *${resolved.dispute.provider_name}* by ${days2} days. Next reminder: ${fmtDate(next.toISOString())}.` };
}

async function escalateDispute(supabase: ReturnType<typeof getAdmin>, userId: string, channel: 'telegram' | 'whatsapp' | 'chatbot', provider: string): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, provider);
  if (!resolved.ok) return { text: resolved.text };
  const dispute = resolved.dispute;
  await supabase.from('disputes').update({ status: 'escalated', updated_at: new Date().toISOString() }).eq('id', dispute.id);
  // Auto-draft an escalation letter via draft_dispute_letter (re-uses existing engine).
  const result = await draftDisputeLetter(supabase, userId, channel, {
    provider: dispute.provider_name,
    issue_description: dispute.issue_summary || 'See dispute history',
    desired_outcome: 'Refund + ombudsman referral',
    issue_type: dispute.issue_type || 'complaint',
    reply_tone: 'firm',
  });
  return { text: `🟠 *${dispute.provider_name}* escalated. Drafted ombudsman letter:\n\n${result.text}` };
}

async function reopenDispute(supabase: ReturnType<typeof getAdmin>, userId: string, provider: string, reason: string): Promise<ToolResult> {
  const RESOLVED = ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed'];
  const { data: matches } = await supabase.from('disputes').select('id, provider_name, status').eq('user_id', userId).ilike('provider_name', `%${provider}%`).in('status', RESOLVED).order('updated_at', { ascending: false });
  if (!matches || matches.length === 0) return { text: `No closed dispute matching "${provider}" to re-open.` };
  const target = matches[0];
  await supabase.from('disputes').update({ status: 'open', resolved_at: null, money_recovered: null, updated_at: new Date().toISOString() }).eq('id', target.id);
  await supabase.from('correspondence').insert({ dispute_id: target.id, user_id: userId, entry_type: 'user_note', title: 'Dispute re-opened', content: reason, entry_date: new Date().toISOString() });
  return { text: `✓ Re-opened *${target.provider_name}*. Logged: "${reason}". Status back to open.` };
}

async function moveCorrespondence(supabase: ReturnType<typeof getAdmin>, userId: string, correspondenceId: string, targetProvider: string): Promise<ToolResult> {
  const resolved = await resolveActiveDisputeForBot(supabase, userId, targetProvider);
  if (!resolved.ok) return { text: resolved.text };
  const { error } = await supabase.from('correspondence').update({ dispute_id: resolved.dispute.id, updated_at: new Date().toISOString() }).eq('id', correspondenceId).eq('user_id', userId);
  if (error) return { text: `Move failed: ${error.message}` };
  return { text: `✓ Moved correspondence to *${resolved.dispute.provider_name}*.` };
}

async function deleteCorrespondenceEntry(supabase: ReturnType<typeof getAdmin>, userId: string, correspondenceId: string): Promise<ToolResult> {
  const { error } = await supabase.from('correspondence').delete().eq('id', correspondenceId).eq('user_id', userId);
  if (error) return { text: `Delete failed: ${error.message}` };
  return { text: '✓ Entry deleted from dispute timeline.' };
}

async function addNoteToSubscription(supabase: ReturnType<typeof getAdmin>, userId: string, provider: string, note: string): Promise<ToolResult> {
  const { data: subs } = await supabase.from('subscriptions').select('id, provider_name').eq('user_id', userId).eq('status', 'active').ilike('provider_name', `%${provider}%`);
  if (!subs || subs.length === 0) return { text: `No active subscription matching "${provider}".` };
  if (subs.length > 1) return { text: `Multiple matches for "${provider}" — narrow down: ${subs.map((s) => s.provider_name).join(', ')}` };
  await supabase.from('subscriptions').update({ notes: note, updated_at: new Date().toISOString() }).eq('id', subs[0].id);
  return { text: `✓ Note saved on *${subs[0].provider_name}*.` };
}

async function mergeSubscriptions(supabase: ReturnType<typeof getAdmin>, userId: string, keepProvider: string, mergeProvider: string): Promise<ToolResult> {
  const { data: keep } = await supabase.from('subscriptions').select('id, provider_name').eq('user_id', userId).eq('status', 'active').ilike('provider_name', `%${keepProvider}%`).limit(1).maybeSingle();
  const { data: merge } = await supabase.from('subscriptions').select('id, provider_name').eq('user_id', userId).eq('status', 'active').ilike('provider_name', `%${mergeProvider}%`).limit(1).maybeSingle();
  if (!keep || !merge) return { text: `Couldn't find both subscriptions. Keep: ${keep?.provider_name || '(not found)'}, Merge: ${merge?.provider_name || '(not found)'}.` };
  if (keep.id === merge.id) return { text: 'Same subscription — nothing to merge.' };
  await supabase.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), notes: `Merged into ${keep.provider_name} (${keep.id.slice(0, 8)})` }).eq('id', merge.id);
  return { text: `✓ Merged. *${merge.provider_name}* archived; *${keep.provider_name}* remains active.` };
}

async function tagTransaction(supabase: ReturnType<typeof getAdmin>, userId: string, transactionId: string, tag: string): Promise<ToolResult> {
  const tag2 = tag.slice(0, 32);
  const { error } = await supabase.from('bank_transactions').update({ user_tag: tag2 }).eq('id', transactionId).eq('user_id', userId);
  if (error) return { text: `Tag failed: ${error.message}. (transactions.user_tag column may not exist yet — feature partial.)` };
  return { text: `✓ Tagged: "${tag2}"` };
}

async function pauseAlertsUntil(supabase: ReturnType<typeof getAdmin>, userId: string, untilDate: string): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(untilDate)) return { text: 'Pass YYYY-MM-DD format (e.g. 2026-05-15).' };
  await supabase.from('telegram_alert_preferences').upsert({ user_id: userId, alerts_paused_until: untilDate, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return { text: `✓ Pocket Agent alerts paused until ${untilDate}. Watchdog and dispute follow-ups still fire — only proactive alerts (price rises, contract renewals, budget overruns) are silenced.` };
}

// ============================================================
// PHASE 3b HANDLERS — long-tail reads
// ============================================================

async function getLoginHistory(supabase: ReturnType<typeof getAdmin>, userId: string, limit?: number): Promise<ToolResult> {
  const lim = Math.min(50, limit ?? 10);
  // Most apps store this in auth.audit_log_entries (Supabase) which isn't directly queryable from the service role with a SELECT. Try business_log fallback.
  const { data } = await supabase.from('business_log').select('content, created_at').eq('created_by', 'auth-login').eq('details->>user_id', userId).order('created_at', { ascending: false }).limit(lim);
  if (!data || data.length === 0) return { text: 'No login history captured. Login audit logging is not yet enabled.' };
  let text = `*Recent ${data.length} logins:*\n`;
  for (const l of data) text += `\n• ${fmtDate(l.created_at)} — ${l.content.slice(0, 80)}`;
  return { text };
}

async function getActiveSessions(_supabase: ReturnType<typeof getAdmin>, _userId: string): Promise<ToolResult> {
  // Supabase auth sessions are not exposed via the standard table API — admin auth.users() endpoint required.
  return { text: 'Active session listing isn\'t exposed via the bot yet — sign out all devices via dashboard → Profile → Security.' };
}

async function getReferralStats(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  const { count: totalSignups } = await supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_user_id', userId);
  const { count: paidSignups } = await supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_user_id', userId).eq('converted', true);
  const { data: profile } = await supabase.from('profiles').select('referral_code, free_months_earned').eq('id', userId).single();
  return { text: `*Your referrals:*\n\n• Total signups attributed: ${totalSignups ?? 0}\n• Converted to paying: ${paidSignups ?? 0}\n• Free months earned: ${profile?.free_months_earned ?? 0}\n• Your code: ${profile?.referral_code || 'not generated yet'}\n\nShare your link via get_referral_link.` };
}

async function searchDisputes(supabase: ReturnType<typeof getAdmin>, userId: string, query: string): Promise<ToolResult> {
  const q = query.trim();
  if (q.length < 2) return { text: 'Search needs at least 2 characters.' };
  const { data } = await supabase.from('disputes').select('id, provider_name, status, issue_summary, created_at').eq('user_id', userId).or(`provider_name.ilike.%${q}%,issue_summary.ilike.%${q}%`).order('created_at', { ascending: false }).limit(10);
  if (!data || data.length === 0) return { text: `No disputes match "${q}".` };
  let text = `*${data.length} disputes match "${q}":*\n`;
  for (const d of data) text += `\n• *${d.provider_name}* — ${d.status} · ${fmtDate(d.created_at)}\n  _${(d.issue_summary || '').slice(0, 120)}_`;
  return { text };
}

async function getTransactionDetail(supabase: ReturnType<typeof getAdmin>, userId: string, transactionId: string): Promise<ToolResult> {
  const { data } = await supabase.from('bank_transactions').select('*').eq('id', transactionId).eq('user_id', userId).maybeSingle();
  if (!data) return { text: `Transaction ${transactionId} not found.` };
  let text = `*Transaction ${(data.transaction_id || data.id).slice(0, 8)}:*\n`;
  text += `\n• Date: ${fmtDate(data.timestamp)}`;
  text += `\n• Amount: ${fmt(Number(data.amount))}`;
  text += `\n• Merchant: ${data.merchant_name || '—'}`;
  text += `\n• Category: ${data.user_category || data.category || '—'}`;
  text += `\n• Raw description: "${data.description || ''}"`;
  if (data.connection_id) text += `\n• Bank: ${data.connection_id}`;
  if (data.is_recurring) text += `\n• Linked to a subscription`;
  return { text };
}

async function getDashboardStats(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  const [{ count: openDisputes }, { data: profile }, { data: subs }, { count: pendingTasks }] = await Promise.all([
    supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['open', 'awaiting_response', 'escalated']),
    supabase.from('profiles').select('total_money_recovered, subscription_tier').eq('id', userId).single(),
    supabase.from('subscriptions').select('amount, billing_cycle').eq('user_id', userId).eq('status', 'active'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending_review'),
  ]);
  let monthly = 0;
  for (const s of subs ?? []) {
    const a = parseFloat(String(s.amount)) || 0;
    if (s.billing_cycle === 'yearly') monthly += a / 12;
    else if (s.billing_cycle === 'quarterly') monthly += a / 3;
    else monthly += a;
  }
  return { text: `*Your dashboard:*\n\n• Tier: ${profile?.subscription_tier || 'free'}\n• Money recovered (lifetime): ${fmt(Number(profile?.total_money_recovered ?? 0))}\n• Active subscriptions: ${subs?.length ?? 0} · ${fmt(monthly)}/mo\n• Open disputes: ${openDisputes ?? 0}\n• Pending tasks: ${pendingTasks ?? 0}` };
}

async function getSavingsBreakdownByProvider(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  const { data } = await supabase.from('disputes').select('provider_name, money_recovered').eq('user_id', userId).gt('money_recovered', 0);
  if (!data || data.length === 0) return { text: 'No money recovered through disputes yet.' };
  const map = new Map<string, number>();
  for (const d of data) map.set(d.provider_name, (map.get(d.provider_name) ?? 0) + Number(d.money_recovered || 0));
  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  let text = `*Savings by provider:*\n`;
  for (const [name, total] of sorted) text += `\n• *${name}* — ${fmt(total)}`;
  text += `\n\n*Total: ${fmt(sorted.reduce((s, [, v]) => s + v, 0))}*`;
  return { text };
}

async function getRenewalCalendar(supabase: ReturnType<typeof getAdmin>, userId: string, withinDays?: number): Promise<ToolResult> {
  const days = withinDays ?? 90;
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  const { data } = await supabase.from('subscriptions').select('provider_name, contract_end_date, next_billing_date, amount, billing_cycle').eq('user_id', userId).eq('status', 'active');
  if (!data || data.length === 0) return { text: 'No active subscriptions.' };
  const events: Array<{ date: string; event: string; amount: number }> = [];
  for (const s of data) {
    if (s.contract_end_date && s.contract_end_date >= today && s.contract_end_date <= cutoff) events.push({ date: s.contract_end_date, event: `${s.provider_name} contract ends`, amount: Number(s.amount) });
    if (s.next_billing_date && s.next_billing_date >= today && s.next_billing_date <= cutoff) events.push({ date: s.next_billing_date, event: `${s.provider_name} renews`, amount: Number(s.amount) });
  }
  if (events.length === 0) return { text: `No renewals or contract endings in next ${days} days.` };
  events.sort((a, b) => a.date.localeCompare(b.date));
  let text = `*Renewal calendar (next ${days} days):*\n`;
  for (const e of events) text += `\n• ${fmtDate(e.date)} — ${e.event} (${fmt(e.amount)})`;
  return { text };
}

async function archiveSubscription(supabase: ReturnType<typeof getAdmin>, userId: string, provider: string): Promise<ToolResult> {
  const { data: subs } = await supabase.from('subscriptions').select('id, provider_name').eq('user_id', userId).ilike('provider_name', `%${provider}%`);
  if (!subs || subs.length === 0) return { text: `No subscription matching "${provider}".` };
  await supabase.from('subscriptions').update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', subs.map((s) => s.id));
  return { text: `✓ Archived ${subs.length} subscription${subs.length === 1 ? '' : 's'}.` };
}

async function archiveDispute(supabase: ReturnType<typeof getAdmin>, userId: string, provider: string): Promise<ToolResult> {
  const RESOLVED = ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed'];
  const { data: disputes } = await supabase.from('disputes').select('id, provider_name, status').eq('user_id', userId).ilike('provider_name', `%${provider}%`).in('status', RESOLVED);
  if (!disputes || disputes.length === 0) return { text: `No closed dispute matching "${provider}" to archive.` };
  await supabase.from('disputes').update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', disputes.map((d) => d.id));
  return { text: `✓ Archived ${disputes.length} closed dispute${disputes.length === 1 ? '' : 's'}.` };
}

async function getSubscriptionHistory(supabase: ReturnType<typeof getAdmin>, userId: string, limit?: number): Promise<ToolResult> {
  const lim = Math.min(50, limit ?? 20);
  const { data } = await supabase.from('subscriptions').select('provider_name, amount, billing_cycle, status, cancelled_at, money_saved').eq('user_id', userId).neq('status', 'active').order('cancelled_at', { ascending: false, nullsFirst: false }).limit(lim);
  if (!data || data.length === 0) return { text: 'No cancelled or archived subscriptions.' };
  let text = `*Subscription history (${data.length}):*\n`;
  for (const s of data) text += `\n• *${s.provider_name}* — ${s.status} ${s.cancelled_at ? `· cancelled ${fmtDate(s.cancelled_at)}` : ''}${s.money_saved ? ` · saved ${fmt(Number(s.money_saved))}` : ''}`;
  return { text };
}

async function getRefundStatus(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  const { data } = await supabase.from('disputes').select('provider_name, status, money_recovered, disputed_amount, resolved_at').eq('user_id', userId).in('status', ['awaiting_response', 'escalated', 'resolved_won', 'resolved_partial']).order('updated_at', { ascending: false }).limit(20);
  if (!data || data.length === 0) return { text: 'No active or resolved refund disputes.' };
  let text = `*Refund status:*\n`;
  for (const d of data) {
    const target = d.disputed_amount ? fmt(Number(d.disputed_amount)) : '—';
    const got = d.money_recovered ? fmt(Number(d.money_recovered)) : 'pending';
    text += `\n• *${d.provider_name}* — ${d.status} · target ${target} · received ${got}${d.resolved_at ? ` · closed ${fmtDate(d.resolved_at)}` : ''}`;
  }
  return { text };
}

async function getBlogPosts(limit?: number, topic?: string): Promise<ToolResult> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
  const lim = Math.min(20, limit ?? 5);
  let text = `*Recent Paybacker guides:*\n\nBrowse the full library at ${origin}/blog`;
  if (topic) text += ` — search for "${topic}"`;
  text += `\n\n(I don't have a live blog query yet — fetch the latest from the website directly.) Limit asked: ${lim}.`;
  return { text };
}

async function getConsumerLawNews(supabase: ReturnType<typeof getAdmin>, limit?: number): Promise<ToolResult> {
  const lim = Math.min(20, limit ?? 5);
  const { data } = await supabase.from('legal_update_queue').select('change_type, detected_change_summary, source_url, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(lim);
  if (!data || data.length === 0) return { text: 'No recent consumer law updates flagged.' };
  let text = `*Recent UK consumer-law updates:*\n`;
  for (const u of data) text += `\n• ${fmtDate(u.created_at)} — *${u.change_type.replace(/_/g, ' ')}*: ${(u.detected_change_summary || '').slice(0, 200)}`;
  return { text };
}

async function setMonthlyBudget(supabase: ReturnType<typeof getAdmin>, userId: string, amount: number): Promise<ToolResult> {
  if (amount <= 0) return { text: 'Amount must be positive.' };
  await supabase.from('profiles').update({ monthly_budget: amount, updated_at: new Date().toISOString() }).eq('id', userId);
  return { text: `✓ Monthly budget set to ${fmt(amount)}.` };
}

async function recordNegotiationOutcome(supabase: ReturnType<typeof getAdmin>, userId: string, provider: string, annualSaving: number, notes?: string): Promise<ToolResult> {
  if (annualSaving <= 0) return { text: 'Annual saving must be positive.' };
  await supabase.from('verified_savings').insert({ user_id: userId, provider_name: provider, annual_saving: annualSaving, source: 'negotiation', notes: notes || null, achieved_at: new Date().toISOString() });
  // Bump total_money_recovered
  const { data: profile } = await supabase.from('profiles').select('total_money_recovered').eq('id', userId).single();
  const newTotal = Number(profile?.total_money_recovered ?? 0) + annualSaving;
  await supabase.from('profiles').update({ total_money_recovered: newTotal }).eq('id', userId);
  return { text: `✓ Logged ${fmt(annualSaving)}/yr negotiated saving with *${provider}*. Lifetime total: ${fmt(newTotal)}.` };
}

// ============================================================
// PHASE 3c HANDLERS — browser handoff
// ============================================================

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

async function startBankConnection(): Promise<ToolResult> {
  return { text: `🏦 Connect a UK bank: ${SITE()}/dashboard/profile?connect=bank\n\nThis opens the Yapily connector — pick your bank, sign in, and Paybacker reads transactions only (read-only, FCA AISP). Takes ~60 seconds.` };
}

async function startEmailConnection(provider: string): Promise<ToolResult> {
  const slug = provider === 'outlook' ? 'outlook' : 'google';
  return { text: `📧 Connect ${provider}: ${SITE()}/dashboard/profile?connect=${slug}\n\nThis kicks off OAuth — sign in, grant read access, then Paybacker can scan for forgotten subscriptions and auto-import dispute replies.` };
}

async function startPlanUpgrade(targetTier: string, billing?: string): Promise<ToolResult> {
  const cycle = billing === 'yearly' ? 'yearly' : 'monthly';
  return { text: `💳 Upgrade to ${targetTier}: ${SITE()}/pricing?upgrade=${targetTier}&billing=${cycle}\n\nClick to land on Stripe Checkout. Cancel any time from /dashboard/profile.` };
}

async function startSubscriptionCancel(): Promise<ToolResult> {
  return { text: `Manage your Paybacker subscription: ${SITE()}/dashboard/profile?manage=billing\n\nThis opens the Stripe customer portal — cancel, change plan, or update payment method.` };
}

async function startAccountDeletion(supabase: ReturnType<typeof getAdmin>, userId: string, reason?: string): Promise<ToolResult> {
  await supabase.from('business_log').insert({ category: 'gdpr_request', title: 'Account deletion requested', content: `User ${userId} requested deletion via Pocket Agent. Reason: ${reason || '(none given)'}`, created_by: 'pocket-agent' });
  return { text: `⚠️ Account deletion requested. We've sent a confirmation email to your account address — click the link within 24h to confirm. Per UK GDPR right-to-erasure, deletion completes within 30 days. This is irreversible.` };
}

async function startDataExportDownload(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  // Look up the most recent gdpr export request
  const { data } = await supabase.from('business_log').select('content, created_at').eq('category', 'gdpr_request').ilike('content', `%${userId}%`).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return { text: `No data export requested yet. Run request_data_export first, then I'll have a download link within 24h.` };
  return { text: `Latest export requested ${fmtDate(data.created_at)}. Download link will be emailed to your account address once ready (within 24h of the request). Links expire after 7 days.` };
}

// ============================================================
// PHASE 3d HANDLERS — miscellaneous parity
// ============================================================

async function scanReceipt(receiptText: string, suggestedAction?: string): Promise<ToolResult> {
  const text = (receiptText || '').trim();
  if (!text) {
    return { text: 'No receipt text provided. Paste the contents of the receipt/bill and I\'ll pull out the merchant, amount and category.' };
  }
  if (text.length > 8000) {
    return { text: 'That\'s a lot of text. Trim it to just the receipt/bill body (~8k chars max) and resend.' };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: 'Receipt scanning is offline right now (AI key not configured). Try again later.' };
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Extract from this UK receipt / bill / invoice text:
- merchant: the company / supplier name
- amount: total amount in £ as a number (no currency symbol, no commas)
- date: in YYYY-MM-DD if present, else null
- category: ONE of mortgage, loans, credit, council_tax, energy, water, broadband, mobile, streaming, fitness, groceries, eating_out, fuel, shopping, insurance, transport, software, tax, professional, bills, other
- reference: any account / customer / order reference number, else null

Receipt text:
"""
${text.slice(0, 8000)}
"""

Return ONLY valid JSON, no other text. Example: {"merchant":"EE","amount":42.50,"date":"2026-04-30","category":"mobile","reference":"123456"}`;

  let extracted: { merchant?: string; amount?: number | string; date?: string | null; category?: string; reference?: string | null } = {};
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : '';
    const cleaned = responseText.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    extracted = JSON.parse(cleaned);
  } catch (err) {
    console.error('scan_receipt parse error:', err);
    return { text: 'Couldn\'t parse that receipt. Make sure the text includes a merchant, amount and (ideally) a date, then try again.' };
  }

  const merchant = extracted.merchant || 'Unknown';
  const amountNum = typeof extracted.amount === 'string' ? parseFloat(extracted.amount) : (extracted.amount ?? 0);
  const category = (extracted.category || 'other').toLowerCase();
  const categoryLabel = CATEGORY_LABELS[category] || extracted.category || 'Other';

  let body = `📄 *Receipt parsed*\n\n• Merchant: *${merchant}*\n• Amount: *${fmt(amountNum)}*\n• Category: ${categoryLabel}`;
  if (extracted.date) body += `\n• Date: ${fmtDate(extracted.date)}`;
  if (extracted.reference) body += `\n• Ref: ${extracted.reference}`;

  const action = suggestedAction || 'just_categorise';
  if (action === 'add_subscription') {
    body += `\n\nNext: I can add this as a recurring subscription — say "add ${merchant} to subscriptions" to confirm.`;
  } else if (action === 'create_dispute') {
    body += `\n\nNext: I can draft a dispute letter for ${merchant} — say "dispute this charge" to start.`;
  } else {
    body += `\n\nLet me know if you want to add this as a subscription, dispute it, or just file it.`;
  }

  return { text: body };
}

async function renewBankConsent(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  bankName?: string,
): Promise<ToolResult> {
  let query = supabase
    .from('bank_connections')
    .select('id, bank_name, status, consent_expires_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('status', 'in', '("revoked","expired_legacy")')
    .order('connected_at', { ascending: false });

  if (bankName) {
    query = query.ilike('bank_name', `%${bankName}%`);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    return { text: bankName
      ? `No bank connection matches "${bankName}". Try get_bank_connections to see what's connected.`
      : `No bank accounts connected. Connect one at ${SITE()}/dashboard/subscriptions?connectBank=true` };
  }

  // Prefer connections that actually need renewal
  const renewable = data.filter((c) => ['expiring_soon', 'expired', 'token_expired'].includes(c.status));
  const target = renewable[0] || data[0];

  if (!target) {
    return { text: `No bank connection matches "${bankName ?? ''}". Try get_bank_connections.` };
  }

  if (data.length > 1 && !bankName) {
    const list = data.map((c) => `• ${c.bank_name ?? 'Unknown'} (${c.status})`).join('\n');
    return { text: `You have ${data.length} bank connections:\n${list}\n\nSay "renew consent for [bank name]" so I know which one.` };
  }

  // Send users to the subscriptions page — this is the canonical bank-management
  // surface that lists expired connections with a Reconnect button per row, and
  // ?connectBank=true auto-opens the bank-picker modal so the OAuth re-auth flow
  // starts immediately. (The dashboard/profile page does NOT handle renew_bank.)
  const url = `${SITE()}/dashboard/subscriptions?connectBank=true`;
  const expiry = target.consent_expires_at ? ` (consent expires ${fmtDate(target.consent_expires_at)})` : '';
  const bankLabel = target.bank_name ?? 'your bank';
  return { text: `Renew consent for ${bankLabel} here: ${url}${expiry}\n\nThis opens the bank picker — pick ${bankLabel} again to re-authorise. UK Open Banking requires a 90-day re-auth and takes ~30 seconds via your bank app.` };
}

async function dismissContractAlert(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  alertId: string,
): Promise<ToolResult> {
  if (!alertId) {
    return { text: 'No alert id provided. Use get_contract_alerts (or list_contract_alerts) first to find the id.' };
  }

  const { data, error } = await supabase
    .from('contract_renewal_alerts')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('dismiss_contract_alert error:', error);
    return { text: `Couldn't dismiss that alert: ${error.message}` };
  }
  if (!data) {
    return { text: `No alert found with id ${alertId} on your account.` };
  }
  return { text: '✓ Contract alert dismissed.' };
}

async function dismissBankPrompt(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { error } = await supabase
    .from('profiles')
    .update({ bank_prompt_dismissed_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('dismiss_bank_prompt error:', error);
    return { text: `Couldn't dismiss the bank prompt: ${error.message}` };
  }
  return { text: '✓ "Connect a bank" banner dismissed. You won\'t see it on the dashboard again.' };
}

// ============================================================
// PHASE 4 HANDLERS — founder-only admin
// ============================================================

const FOUNDER_EMAILS = ['hello@paybacker.co.uk', 'aireypaul@googlemail.com'];

async function isFounder(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('email').eq('id', userId).single();
  return !!data?.email && FOUNDER_EMAILS.includes(data.email.toLowerCase());
}

async function getBusinessLog(supabase: ReturnType<typeof getAdmin>, userId: string, category?: string, limit?: number): Promise<ToolResult> {
  if (!(await isFounder(supabase, userId))) return { text: 'This tool is restricted to the founder account.' };
  const lim = Math.min(50, limit ?? 10);
  let q = supabase.from('business_log').select('category, title, content, created_at, created_by').order('created_at', { ascending: false }).limit(lim);
  if (category) q = q.eq('category', category);
  const { data } = await q;
  if (!data || data.length === 0) return { text: 'business_log empty for that filter.' };
  let text = `*business_log (${data.length}):*\n`;
  for (const r of data) text += `\n• ${fmtDate(r.created_at)} [${r.category}] *${r.title}* (${r.created_by})\n  _${(r.content || '').slice(0, 200)}_`;
  return { text };
}

async function getOpenSupportTicketsAdmin(supabase: ReturnType<typeof getAdmin>, userId: string, limit?: number): Promise<ToolResult> {
  if (!(await isFounder(supabase, userId))) return { text: 'Founder only.' };
  const lim = Math.min(50, limit ?? 20);
  const { data } = await supabase.from('support_tickets').select('ticket_number, subject, status, priority, created_at, source').in('status', ['open', 'awaiting_reply', 'in_progress']).order('created_at', { ascending: false }).limit(lim);
  if (!data || data.length === 0) return { text: '✓ No open support tickets.' };
  let text = `*Open tickets (${data.length}):*\n`;
  for (const t of data) text += `\n• *${t.ticket_number}* — ${t.subject} [${t.priority}/${t.source}] · ${fmtDate(t.created_at)}`;
  return { text };
}

async function getMrr(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  if (!(await isFounder(supabase, userId))) return { text: 'Founder only.' };
  const { data } = await supabase.from('profiles').select('subscription_tier, subscription_status').eq('subscription_status', 'active');
  const counts: Record<string, number> = {};
  for (const p of data ?? []) counts[p.subscription_tier] = (counts[p.subscription_tier] ?? 0) + 1;
  const essentialMrr = (counts.essential ?? 0) * 4.99;
  const proMrr = (counts.pro ?? 0) * 9.99;
  const totalMrr = essentialMrr + proMrr;
  return { text: `*Current MRR:*\n\n• Essential (£4.99): ${counts.essential ?? 0} → ${fmt(essentialMrr)}\n• Pro (£9.99): ${counts.pro ?? 0} → ${fmt(proMrr)}\n• Free: ${counts.free ?? 0}\n\n*Total MRR: ${fmt(totalMrr)} · ARR: ${fmt(totalMrr * 12)}*` };
}

async function getPendingDisputesAcrossUsers(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  if (!(await isFounder(supabase, userId))) return { text: 'Founder only.' };
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await supabase.from('disputes').select('provider_name, status, created_at, last_letter_sent_at').in('status', ['open', 'awaiting_response']).lte('created_at', cutoff).order('created_at', { ascending: true }).limit(20);
  if (!data || data.length === 0) return { text: 'No disputes 30+ days old without resolution.' };
  let text = `*Disputes 30+ days old (${data.length}):*\n`;
  for (const d of data) text += `\n• ${d.provider_name} — ${d.status} · opened ${fmtDate(d.created_at)} · last letter ${d.last_letter_sent_at ? fmtDate(d.last_letter_sent_at) : 'never'}`;
  return { text };
}

async function getRecentSignups(supabase: ReturnType<typeof getAdmin>, userId: string, limit?: number): Promise<ToolResult> {
  if (!(await isFounder(supabase, userId))) return { text: 'Founder only.' };
  const lim = Math.min(50, limit ?? 20);
  const { data } = await supabase.from('profiles').select('email, subscription_tier, created_at, signup_source').order('created_at', { ascending: false }).limit(lim);
  if (!data || data.length === 0) return { text: 'No signups.' };
  let text = `*Last ${data.length} signups:*\n`;
  for (const u of data) text += `\n• ${fmtDate(u.created_at)} — ${u.email} [${u.subscription_tier}]${u.signup_source ? ` via ${u.signup_source}` : ''}`;
  return { text };
}

async function getFailedPayments(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  if (!(await isFounder(supabase, userId))) return { text: 'Founder only.' };
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await supabase.from('profiles').select('email, subscription_tier, subscription_status, updated_at').in('subscription_status', ['past_due', 'unpaid', 'incomplete']).gte('updated_at', cutoff).order('updated_at', { ascending: false }).limit(30);
  if (!data || data.length === 0) return { text: '✓ No failed payments in the last 30 days.' };
  let text = `*Failed payments (${data.length}):*\n`;
  for (const u of data) text += `\n• ${u.email} [${u.subscription_tier}] — ${u.subscription_status} · ${fmtDate(u.updated_at)}`;
  return { text };
}

async function getLegalCoverageStatus(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  if (!(await isFounder(supabase, userId))) return { text: 'Founder only.' };
  const { data: refs } = await supabase.from('legal_references').select('verification_status');
  const total = refs?.length ?? 0;
  const counts: Record<string, number> = {};
  for (const r of refs ?? []) counts[r.verification_status] = (counts[r.verification_status] ?? 0) + 1;
  const { data: lastAlert } = await supabase.from('business_log').select('title, content, created_at').eq('category', 'legal_coverage_alert').order('created_at', { ascending: false }).limit(1).maybeSingle();
  let text = `*Legal coverage:*\n\n• Total refs: ${total}\n`;
  for (const [status, count] of Object.entries(counts)) text += `• ${status}: ${count}\n`;
  if (lastAlert) text += `\n*Last canary:* ${fmtDate(lastAlert.created_at)} — ${lastAlert.title}`;
  return { text };
}

async function getManagedAgentRunStatus(supabase: ReturnType<typeof getAdmin>, userId: string): Promise<ToolResult> {
  if (!(await isFounder(supabase, userId))) return { text: 'Founder only.' };
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await supabase.from('business_log').select('title, content, created_by, created_at').gte('created_at', cutoff).in('created_by', ['alert-tester', 'digest-compiler', 'support-triager', 'bug-triager', 'reviewer', 'builder', 'email-marketer', 'ux-auditor', 'feature-tester']).order('created_at', { ascending: false }).limit(20);
  if (!data || data.length === 0) return { text: 'No managed agent activity in the last 24h.' };
  let text = `*Managed agents (last 24h):*\n`;
  for (const r of data) text += `\n• ${fmtDate(r.created_at)} — *${r.created_by}*: ${r.title}`;
  return { text };
}
