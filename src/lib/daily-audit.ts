// src/lib/daily-audit.ts
// Runs the morning health audit. Used by:
//   - src/app/api/cron/daily-audit/route.ts (Vercel cron → Telegram)
//   - any admin endpoint that wants the same digest
// Findings flagged `fixable: true` become inline Fix buttons in the Telegram message.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditFinding {
  id: string;
  severity: 'urgent' | 'medium' | 'info';
  title: string;
  detail: string;
  fixable: boolean;
}

export interface AuditResult {
  generated_at: string;
  db: {
    active_price_alerts: number;
    open_disputes: number;
    total_recovered_gbp: string;
    total_users: number;
    founding_members: number;
  };
  compliance: {
    legal_refs_total: number;
    legal_refs_url_dead: number;
    legal_refs_stale: number;
    pending_corrections: number;
    pending_corrections_high: number;
    pending_candidates: number;
    last_discovery_run_at: string | null;
  };
  findings: AuditFinding[];
  summary_markdown: string;
}

export async function runDailyAudit(admin: SupabaseClient): Promise<AuditResult> {
  const generated_at = new Date().toISOString();

  // 1. DB + compliance snapshots in parallel
  const [dbResp, complianceResp] = await Promise.all([
    admin.rpc('audit_db_snapshot'),
    admin.rpc('audit_compliance_snapshot'),
  ]);
  if (dbResp.error) throw new Error(`audit_db_snapshot: ${dbResp.error.message}`);
  if (complianceResp.error) throw new Error(`audit_compliance_snapshot: ${complianceResp.error.message}`);
  const db = dbResp.data as AuditResult['db'];
  const compliance = complianceResp.data as AuditResult['compliance'];

  // 2. Findings
  const findings: AuditFinding[] = [];

  // DB findings
  const reappearing = await admin.rpc('audit_reappearing_dismissed_alerts');
  if ((reappearing.data as number) > 0) {
    findings.push({
      id: 'fix_reappearing_dismissed_alerts',
      severity: 'urgent',
      title: `${reappearing.data} dismissed price alert(s) reappeared`,
      detail: 'A dismissed alert came back as active for the same user+merchant.',
      fixable: true,
    });
  }
  const backfill = await admin.rpc('audit_disputes_missing_recovered_gbp');
  if ((backfill.data as number) > 0) {
    findings.push({
      id: 'fix_backfill_recovered_gbp',
      severity: 'urgent',
      title: `${backfill.data} resolved_won dispute(s) missing recovered_amount_gbp`,
      detail: 'money_recovered set but recovered_amount_gbp is NULL; platform total is under-reported.',
      fixable: true,
    });
  }
  const wonUnread = await admin.rpc('audit_won_disputes_unread_replies');
  if ((wonUnread.data as number) > 0) {
    findings.push({
      id: 'clear_won_dispute_unread_counts',
      severity: 'medium',
      title: `${wonUnread.data} resolved dispute(s) still showing unread replies`,
      detail: 'Inbound-reply handler is not zeroing unread_reply_count on close.',
      fixable: true,
    });
  }

  // Compliance findings
  if (compliance.pending_corrections_high > 0) {
    findings.push({
      id: 'compliance_ack_no_content',
      severity: 'urgent',
      title: `${compliance.pending_corrections_high} high-confidence legal correction(s) waiting`,
      detail: 'Verifier flagged these statutes as needing review. Most have no proposed content change — bulk-ack as still-current to clear the queue.',
      fixable: true,
    });
  }
  if (compliance.legal_refs_url_dead > 0) {
    findings.push({
      id: 'compliance_review_dead_urls',
      severity: 'medium',
      title: `${compliance.legal_refs_url_dead} legal reference(s) with dead source URLs`,
      detail: 'Source legislation URLs are returning errors. Each needs a fresh canonical URL (manual research or Perplexity discovery run).',
      fixable: false,
    });
  }
  if (compliance.legal_refs_stale > 0) {
    findings.push({
      id: 'compliance_stale_refs',
      severity: 'medium',
      title: `${compliance.legal_refs_stale} statute(s) flagged stale with unapplied upstream changes`,
      detail: 'These show up daily until either acknowledged or the upstream change is ingested.',
      fixable: false,
    });
  }
  if (compliance.pending_candidates > 0) {
    findings.push({
      id: 'compliance_review_candidates',
      severity: 'info',
      title: `${compliance.pending_candidates} new legal candidate(s) discovered`,
      detail: 'Discovery job found these but human approval is needed before they go into the active reference set.',
      fixable: false,
    });
  }

  // 3. Markdown summary
  const lines: string[] = [];
  lines.push(`*Paybacker daily audit — ${generated_at.slice(0, 10)}*`);
  lines.push('');
  lines.push(`*DB*  ·  Alerts: *${db.active_price_alerts}*  ·  Disputes: *${db.open_disputes}*`);
  lines.push(`Recovered: *£${db.total_recovered_gbp}*  ·  Users: *${db.total_users}*`);
  lines.push('');
  lines.push(`*Compliance*  ·  Statutes: *${compliance.legal_refs_total}*  ·  Pending corrections: *${compliance.pending_corrections}* (high: ${compliance.pending_corrections_high})`);
  lines.push(`Dead URLs: *${compliance.legal_refs_url_dead}*  ·  Stale: *${compliance.legal_refs_stale}*  ·  New candidates: *${compliance.pending_candidates}*`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No actionable findings today.');
  } else {
    const urgent = findings.filter(f => f.severity === 'urgent');
    const medium = findings.filter(f => f.severity === 'medium');
    const info   = findings.filter(f => f.severity === 'info');
    if (urgent.length)  { lines.push('🔴 *Urgent*');  urgent.forEach(f => lines.push(`• ${f.title}`)); lines.push(''); }
    if (medium.length)  { lines.push('🟡 *Medium*');  medium.forEach(f => lines.push(`• ${f.title}`)); lines.push(''); }
    if (info.length)    { lines.push('🟢 *Info*');    info.forEach(f => lines.push(`• ${f.title}`));   }
  }

  return { generated_at, db, compliance, findings, summary_markdown: lines.join('\n') };
}
