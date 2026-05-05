import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateComplaintLetter } from '@/lib/agents/complaints-agent';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall } from '@/lib/claude-rate-limit';
import { trackLetterGenerated } from '@/lib/meta-conversions';
import { awardPoints } from '@/lib/loyalty';
import { getProviderTerms } from '@/lib/provider-match';
import { checkIpRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  checkRefFreshness,
  refreshSingleRef,
  findFreshSubstitute,
  freshnessOf,
  freshnessTier,
  tierWarning,
  findTieredSubstitute,
  findChainSubstitute,
  postFlightSanitise,
} from '@/lib/legal-refs-guardrail';
import { CITATION_PERMISSIVE_STATUSES } from '@/lib/legal-refs-statuses';
import { loadFreshLegalRefs } from '@/lib/legal-data/freshness-gate';

// Claude takes 10-20s for complaint letters — extend beyond Vercel's 10s default
// 120s — the engine's worst-case path is two Claude calls (citation
// guarantee retry) plus retrieval, plus thread-context loading. 60s
// was too tight and surfaced as "Load failed" in Safari (a Vercel
// 504 hitting fetch). 120s gives comfortable headroom while still
// far below Vercel Pro's serverless ceiling.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // IP-based rate limiting — 5 requests per minute per IP
    const ip = getClientIp(request);
    const ipLimit = await checkIpRateLimit(ip, '/api/complaints/generate', 5);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a moment.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(ipLimit.retryAfterMs / 1000)),
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(ipLimit.resetAt.getTime() / 1000)),
          },
        }
      );
    }

    // Check plan limits
    const usageCheck = await checkUsageLimit(user.id, 'complaint_generated');
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Monthly limit reached',
          upgradeRequired: true,
          used: usageCheck.used,
          limit: usageCheck.limit,
          tier: usageCheck.tier,
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.companyName || !body.issueDescription || !body.desiredOutcome) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // If this letter is part of an existing dispute, load the full thread
    let threadContext = '';
    if (body.disputeId) {
      const { data: correspondence } = await supabase
        .from('correspondence')
        .select('entry_type, title, content, entry_date')
        .eq('dispute_id', body.disputeId)
        .order('entry_date', { ascending: true });

      if (correspondence && correspondence.length > 0) {
        const letterCount = correspondence.filter((c: any) => c.entry_type === 'ai_letter').length;
        const entries = correspondence.map((c: any) => {
          const date = new Date(c.entry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          const typeLabel: Record<string, string> = {
            ai_letter: 'Our letter sent',
            company_email: 'Email from company',
            company_letter: 'Letter from company',
            phone_call: 'Phone call summary',
            user_note: 'Note',
            company_response: 'Company response',
          };
          return `[${date}] ${typeLabel[c.entry_type] || c.entry_type}${c.title ? ` — ${c.title}` : ''}:\n${c.content}`;
        });
        const nextLetterNum = letterCount + 1;
        threadContext = `\n\nPREVIOUS CORRESPONDENCE (this is follow-up letter #${nextLetterNum} in an ongoing dispute — reference earlier letters and responses, escalate appropriately for letter #${nextLetterNum}):\n${entries.join('\n\n---\n\n')}`;
      }

      // Load contract extractions for this dispute
      const { data: contracts } = await supabase
        .from('contract_extractions')
        .select('*')
        .eq('dispute_id', body.disputeId)
        .order('created_at', { ascending: false })
        .limit(1);

      // Fallback: if no contract linked to dispute, check by provider name
      let contractData = contracts && contracts.length > 0 ? contracts : null;
      if (!contractData && body.companyName) {
        const { data: providerContracts } = await supabase
          .from('contract_extractions')
          .select('*')
          .eq('user_id', user.id)
          .ilike('provider_name', body.companyName)
          .order('created_at', { ascending: false })
          .limit(1);
        contractData = providerContracts && providerContracts.length > 0 ? providerContracts : null;
      }

      if (contractData && contractData.length > 0) {
        const c = contractData[0];
        const terms = [
          c.minimum_term && `Minimum term: ${c.minimum_term}`,
          c.notice_period && `Notice period: ${c.notice_period}`,
          c.cancellation_fee && `Cancellation fee: ${c.cancellation_fee}`,
          c.early_exit_fee && `Early exit fee: ${c.early_exit_fee}`,
          c.price_increase_clause && `Price increase clause: ${c.price_increase_clause}`,
          c.auto_renewal && `Auto-renewal: ${c.auto_renewal}`,
          c.cooling_off_period && `Cooling-off period: ${c.cooling_off_period}`,
        ].filter(Boolean).join('\n');

        const unfairClauses = (c.unfair_clauses || []).map((uc: string) => `- ${uc}`).join('\n');

        threadContext += `\n\nUSER'S CONTRACT TERMS (use these to strengthen the argument — cite their own contract against them):\n${terms}`;
        if (unfairClauses) {
          threadContext += `\n\nPOTENTIALLY UNFAIR CLAUSES IN THEIR CONTRACT:\n${unfairClauses}`;
        }
      } else if (body.companyName) {
        // No personal contract uploaded — check collective provider intelligence as fallback
        const normalisedName = body.companyName.trim().toLowerCase();
        const { data: intel } = await supabase
          .from('provider_intelligence')
          .select('*')
          .eq('provider_name_normalised', normalisedName)
          .limit(1)
          .maybeSingle();

        if (intel && intel.sample_size >= 3) {
          const intelParts = [
            intel.common_notice_period && `Typical notice period: ${intel.common_notice_period}`,
            intel.common_minimum_term && `Typical minimum term: ${intel.common_minimum_term}`,
            intel.common_early_exit_fee && `Typical early exit fee: ${intel.common_early_exit_fee}`,
            intel.avg_monthly_cost != null && `Average monthly cost seen: £${Number(intel.avg_monthly_cost).toFixed(2)}`,
            intel.has_price_increase_clause_pct != null && intel.has_price_increase_clause_pct > 50 &&
              `Price increase clause found in ${intel.has_price_increase_clause_pct}% of contracts — this is common for this provider`,
            intel.auto_renewal_pct != null && intel.auto_renewal_pct > 50 &&
              `Auto-renewal found in ${intel.auto_renewal_pct}% of contracts`,
          ].filter(Boolean).join('\n');

          if (intelParts) {
            threadContext += `\n\nAGGREGATE PROVIDER INTELLIGENCE (based on analysis of ${intel.sample_size} contracts from ${body.companyName} users — no personal contract uploaded, use this as context):\n${intelParts}`;
          }

          if (intel.common_unfair_clauses && Array.isArray(intel.common_unfair_clauses) && intel.common_unfair_clauses.length > 0) {
            threadContext += `\n\nCOMMONLY REPORTED UNFAIR CLAUSES FOR THIS PROVIDER:\n${(intel.common_unfair_clauses as string[]).map((uc: string) => `- ${uc}`).join('\n')}`;
          }
        }
      }
    }

    // Fetch verified legal references for this letter type
    // Also fetch the dispute's provider_type and issue_type for category targeting
    // (prevents gym/goods refs on broadband/energy complaints, and narrows 'government' to the specific sub-type)
    let disputeProviderType: string | null = null;
    let disputeIssueType: string | null = null;
    if (body.disputeId) {
      const { data: disputeRow } = await supabase
        .from('disputes')
        .select('provider_type, issue_type, description, desired_outcome, amount, status')
        .eq('id', body.disputeId)
        .single();
      disputeProviderType = disputeRow?.provider_type || null;
      disputeIssueType = disputeRow?.issue_type || null;

      if (disputeRow && threadContext) {
        threadContext += `\n\nORIGINAL DISPUTE DETAILS:\nDescription: ${disputeRow.description || 'N/A'}\nDesired Outcome: ${disputeRow.desired_outcome || 'N/A'}\nDisputed Amount: £${disputeRow.amount || '0'}\n`;
      }
    }

    const issueTypeToCategory: Record<string, string[]> = {
      // 'complaint' is the catch-all letterType for "I'm being charged
      // something I don't think I owe / didn't agree to". Most of those
      // involve a payment (card, PayPal, direct debit, BNPL), so we
      // include 'finance' by default — the dynamic detector below can
      // still narrow further. Without 'finance' here the engine misses
      // Payment Services Regs 2017 reg 76 (unauthorised payment refund)
      // which is often the STRONGEST ground.
      complaint: ['general', 'finance'],
      energy_dispute: ['general', 'energy'],
      broadband_complaint: ['general', 'broadband'],
      flight_compensation: ['general', 'travel'],
      parking_appeal: ['general', 'parking'],
      debt_dispute: ['general', 'debt', 'finance'],
      refund_request: ['general', 'finance'],
      hmrc_tax_rebate: ['hmrc', 'general'],
      council_tax_band: ['council_tax', 'general'],
      dvla_vehicle: ['dvla', 'general'],
      nhs_complaint: ['nhs', 'general'],
      gym_membership: ['gym', 'general'],
      insurance_dispute: ['insurance', 'finance', 'general'],
    };

    // Provider-type fallback — used only when issue_type doesn't give us a specific category.
    // 'government' maps broadly; issue_type (e.g. council_tax_band) narrows it correctly in step 1.
    const providerTypeToCategory: Record<string, string[]> = {
      broadband: ['broadband', 'general'],
      energy: ['energy', 'general'],
      mobile: ['broadband', 'general'],
      insurance: ['insurance', 'general'],
      travel: ['travel', 'general'],
      parking: ['parking', 'general'],
      finance: ['finance', 'general'],
      debt: ['debt', 'finance', 'general'],
      government: ['council_tax', 'hmrc', 'dvla', 'general'],
      nhs: ['nhs', 'general'],
      gym: ['gym', 'general'],
      general: ['general'],
    };

    // Two-step resolution: issue_type is more specific, so try it first.
    // This prevents a 'government' provider_type from pulling in HMRC refs on a council tax dispute.
    let categories =
      issueTypeToCategory[disputeIssueType || ''] ||
      issueTypeToCategory[body.letterType || ''] ||
      (disputeProviderType ? providerTypeToCategory[disputeProviderType] : null) ||
      ['general'];

    // Dynamic augmentation — scan the scenario text for sector signals
    // and add the matching category if not already present. This is
    // the same trick the B2B engine uses (src/lib/b2b/disputes.ts
    // detectScenarioCategory) and it catches cases the static
    // letterType→category map misses.
    //
    // Most-impactful signal: PAYMENT keywords. An unauthorised PayPal /
    // card / direct-debit charge is fundamentally a finance dispute
    // even when the user clicked 'complaint' as the letter type, and
    // the engine MUST cite Payment Services Regulations 2017 reg 76
    // (unauthorised payment refund) — pulling 'finance' makes that
    // ref available to Claude.
    const scenarioForDetect = (
      `${body.issueDescription ?? ''} ${body.companyName ?? ''} ${body.desiredOutcome ?? ''}`
    ).toLowerCase();

    function augment(category: string, regex: RegExp) {
      if (regex.test(scenarioForDetect) && !categories.includes(category)) {
        categories = [...categories, category];
      }
    }

    // Finance signals — payment instruments, chargeback, unauthorised
    // charges, BNPL, debit/credit cards. We deliberately include
    // 'paypal' / 'klarna' / 'clearpay' as merchant-specific signals
    // because users say "PayPal charged me" not "I had an unauthorised
    // payment under PSR 2017".
    augment('finance', /\b(paypal|klarna|clearpay|chargeback|section\s*75|s\.?\s*75|cca\s*1974|credit\s*card|debit\s*card|direct\s*debit|standing\s*order|unauthori[sz]ed\s*(payment|charge|transaction|debit)|(took|charged|deducted|debited)\s*(£|gbp|money)|payment\s*(taken|removed|deducted)|automatic\s*(charge|renewal|payment)|recurring\s*(charge|payment)|subscription)\b/);

    // Travel signals (flight cancellation / delay).
    augment('travel', /\b(flight|airline|cancel(?:l?ed)?\s*(my\s+)?flight|delay(?:ed)?\s*(my\s+)?flight|baggage|boarding|ryanair|easyjet|jet2|tui|british\s*airways|wizz\s*air|caa\b|uk261|eu261)\b/);

    // Energy signals.
    augment('energy', /\b(energy|gas|electric(ity)?|ofgem|british\s*gas|octopus(\s*energy)?|edf|ovo|e\.?on|sse\b|scottish\s*power|smart\s*meter|back-?bill)\b/);

    // Broadband / telecoms.
    augment('broadband', /\b(broadband|mobile\s*(?:contract|provider|tariff|bill)?|isp|ofcom|talktalk|mid-?contract\s*(price\s*rise|increase))\b/);

    // Debt / collection.
    augment('debt', /\b(debt\s*(claim|collection)|bailiff|enforcement\s*officer|statute\s*barred|lowell|cabot|intrum)\b/);

    // Insurance.
    augment('insurance', /\b(insurance|insurer|claim\s*declined|underwriter|loss\s*adjuster|policy\s*(claim|wording|exclusion))\b/);

    // 2026-04-28 — INCIDENT FIX. Previously this filter was
    // .in('verification_status', ['current', 'updated']) which silently
    // dropped 28+ critical rules flagged 'needs_review' (Ofcom
    // Auto-Compensation, Ofgem back-billing rules, GC C1/C4, rail
    // passenger rights, etc.). Engine was generating letters BLIND to
    // these rules, missing money owed to the user.
    //
    // Now we include 'needs_review' refs too — the rule's EXISTENCE is
    // verified even when specific quantitative values may have drifted.
    // The rows are annotated below with [UNDER REVIEW — verify current
    // figure] so Claude knows to use directional language for any
    // numeric value (rate per day, threshold, etc.) when citing them.
    //
    // 'url_dead' is EXCLUDED — it means the source URL has 404'd
    // (or 5xx'd) for 3+ consecutive verify-legal-refs runs and the
    // rule may have moved or been repealed. Rules in this state need
    // founder review (find a new source URL or mark superseded)
    // BEFORE the engine cites them. See verify-legal-refs cron for
    // promotion logic.
    const { data: legalRefs } = await supabase
      .from('legal_references')
      .select('id, category, law_name, section, summary, source_url, escalation_body, strength, applies_to, verification_status')
      .in('category', categories)
      .in('verification_status', CITATION_PERMISSIVE_STATUSES as unknown as string[]);

    // Filter out 'general' refs that have a sector-specific applies_to array which doesn't
    // overlap with the current dispute's categories. This prevents gym/fitness legal refs
    // (mislabelled as 'general') from appearing in broadband or energy letters.
    const relevantRefs = (legalRefs || []).filter(r => {
      if (r.category !== 'general') return true; // Non-general refs are already scoped correctly
      const appliesTo: string[] = Array.isArray(r.applies_to) ? r.applies_to : [];
      if (appliesTo.length === 0) return true; // Truly general — no sector restriction
      // Only include if applies_to overlaps with the dispute's categories
      return appliesTo.some((a: string) => categories.includes(a.toLowerCase()));
    });

    // Check if any referenced laws have pending updates in the review queue
    // Surfaces a warning so admin knows the letter may cite a law under review
    let pendingLegalUpdates = false;
    const refIds = relevantRefs.map(r => r.id).filter(Boolean);
    if (refIds.length > 0) {
      const { data: pendingQueue } = await supabase
        .from('legal_update_queue')
        .select('id')
        .in('legal_reference_id', refIds)
        .eq('status', 'pending')
        .limit(1);
      if (pendingQueue && pendingQueue.length > 0) {
        pendingLegalUpdates = true;
        // Log for admin awareness — not shown to users
        void supabase.from('business_log').insert({
          category: 'legal_intelligence',
          action: 'letter_generated_with_pending_updates',
          details: {
            user_id: user.id,
            company: body.companyName,
            pending_ref_ids: refIds,
            note: 'Letter generated while some referenced laws have pending legal update queue items',
          },
        });
      }
    }

    // PR β — pre-send freshness guardrail. Check the refs we INTEND to
    // feed into the prompt; for any stale/broken row, attempt a
    // synchronous Perplexity refresh (5s cap), then if still stale find
    // a fresh substitute in the same category. If no substitute exists
    // we strip the row and add a footer note in the letter. Never
    // blocks the user — degrade gracefully.
    let guardrailFooterNote: string | null = null;
    // Tier 2-4 + chain fallback warnings collected here — appended to
    // the letter footer at the end so the user sees the same "verified
    // X days ago" caveat the B2B response surfaces in _compliance_warnings.
    // B2C never blocks: even a tier-4 ref or chain fallback is preferable
    // to stripping the citation entirely.
    const guardrailTierWarnings: string[] = [];
    if (relevantRefs.length > 0) {
      const freshness = await checkRefFreshness(supabase, refIds);
      if (!freshness.ok && freshness.stale.length > 0) {
        const usedIds = new Set<string>((refIds as unknown[]).filter((x: unknown): x is string => typeof x === 'string'));
        for (const { id: staleId, reason } of freshness.stale) {
          // Attempt synchronous refresh first. Tier-aware: tier 1 → use
          // silently; tier 2-4 → use + warning; null → fall through.
          const refreshed = await refreshSingleRef(supabase, staleId);
          if (refreshed) {
            const t = freshnessTier(refreshed);
            if (t) {
              const idx = relevantRefs.findIndex((r: any) => r.id === staleId);
              if (idx >= 0) {
                relevantRefs[idx] = { ...relevantRefs[idx], ...refreshed };
              }
              const w = tierWarning(refreshed, t);
              if (w) guardrailTierWarnings.push(w);
              continue;
            }
          }
          // Same-category tiered substitute (tier 1 → 4).
          const original = relevantRefs.find((r: any) => r.id === staleId);
          const category = original?.category;
          if (category) {
            const sub = await findTieredSubstitute(supabase, category, [...usedIds]);
            if (sub) {
              const idx = relevantRefs.findIndex((r: any) => r.id === staleId);
              if (idx >= 0) {
                relevantRefs[idx] = { ...sub.ref, applies_to: original?.applies_to || [] } as any;
                usedIds.add(sub.ref.id);
              }
              const w = tierWarning(sub.ref, sub.tier);
              if (w) guardrailTierWarnings.push(w);
              continue;
            }
            // Category fallback chain (energy → utilities → general etc.).
            const chained = await findChainSubstitute(supabase, category, [...usedIds]);
            if (chained) {
              const idx = relevantRefs.findIndex((r: any) => r.id === staleId);
              if (idx >= 0) {
                relevantRefs[idx] = { ...chained.ref, applies_to: original?.applies_to || [] } as any;
                usedIds.add(chained.ref.id);
              }
              guardrailTierWarnings.push(
                `No fresh ref for '${category}' — substituted with '${chained.fallbackCategory}' (${chained.ref.law_name})`,
              );
              const w = tierWarning(chained.ref, chained.tier);
              if (w) guardrailTierWarnings.push(w);
              continue;
            }
          }
          // No substitute even via the chain — strip the row and flag a footer note.
          const idx = relevantRefs.findIndex((r: any) => r.id === staleId);
          if (idx >= 0) relevantRefs.splice(idx, 1);
          guardrailFooterNote = "We couldn't verify the current statute reference for this point. Please confirm before sending.";
          void supabase.from('business_log').insert({
            category: 'legal_intelligence',
            action: 'guardrail_stripped_stale_ref',
            details: { user_id: user.id, ref_id: staleId, reason, company: body.companyName },
          });
        }
      }
    }
    // Promote tier 2-4 warnings into the footer note. Multiple warnings
    // are joined; if the strip-fallback note also fired we keep both.
    if (guardrailTierWarnings.length > 0) {
      const tierFooter = guardrailTierWarnings.join(' · ');
      guardrailFooterNote = guardrailFooterNote
        ? `${guardrailFooterNote} ${tierFooter}`
        : tierFooter;
    }

    // Phase 4 — single freshness gate. Every cited ref id passes
    // through `loadFreshLegalRefs` so the audit log captures B2C
    // citations alongside B2B. The cascade above has already done
    // refresh/substitute work — we run the gate with allowStale=true
    // so it only records provenance, never re-does work.
    try {
      const finalRefIds = relevantRefs.map((r) => r.id).filter((x): x is string => typeof x === 'string');
      if (finalRefIds.length > 0) {
        await loadFreshLegalRefs(finalRefIds, { caller: 'b2c', allowStale: true });
      }
    } catch (err) {
      console.warn('[freshness-gate] B2C audit failed (non-fatal):', (err as Error).message);
    }

    let verifiedLegalRefs = '';
    if (relevantRefs.length > 0) {
      verifiedLegalRefs = relevantRefs.map((r) => {
        // Annotate needs_review rows so Claude knows to USE the rule
        // (the rule exists and is binding) but treat any specific
        // figure inside the summary as potentially-out-of-date. The
        // engine's prompt-side anti-hallucination guard does the
        // rest: it'll cite the rule with directional language ("you
        // are entitled to per-day compensation under the Ofcom
        // Auto-Compensation Scheme; the current rate published by
        // Ofcom should be applied") rather than a specific stale £.
        const reviewFlag = r.verification_status === 'needs_review'
          ? ' [UNDER REVIEW — quantitative values may be slightly out-of-date; cite the rule and use directional language for specific figures]'
          : '';
        return `- ${r.law_name}${r.section ? `, ${r.section}` : ''}: ${r.summary}${r.escalation_body ? ` (Escalate to: ${r.escalation_body})` : ''}${reviewFlag} [Source: ${r.source_url}]`;
      }).join('\n');
    }

    // Fetch provider-specific terms (cancellation, complaints, ombudsman)
    const providerTerms = await getProviderTerms(supabase, body.companyName);
    let providerContext = '';
    if (providerTerms) {
      const parts = [
        providerTerms.complaints_email && `Send complaints to: ${providerTerms.complaints_email}`,
        providerTerms.complaints_url && `Complaints page: ${providerTerms.complaints_url}`,
        providerTerms.complaints_response_days && `They have ${providerTerms.complaints_response_days} days to respond`,
        providerTerms.ombudsman_name && `If unresolved, escalate to ${providerTerms.ombudsman_name} (${providerTerms.ombudsman_url})`,
        providerTerms.notice_period_days && `Their notice period is ${providerTerms.notice_period_days} days`,
        providerTerms.early_exit_fee_info && `Early exit fees: ${providerTerms.early_exit_fee_info}`,
        providerTerms.cancellation_method && `Cancellation method: ${providerTerms.cancellation_method}`,
        providerTerms.price_increase_exit_rights && `Price increase exit rights: ${providerTerms.price_increase_exit_rights}`,
      ].filter(Boolean);

      if (parts.length > 0) {
        providerContext = `\n\nPROVIDER-SPECIFIC INFORMATION FOR ${providerTerms.display_name}:\n${parts.join('\n')}`;
        // Add "send to" instruction
        if (providerTerms.complaints_email) {
          providerContext += `\n\nAddress this letter to ${providerTerms.display_name} at ${providerTerms.complaints_email}. Include "Send this letter to: ${providerTerms.complaints_email}" as a note after the letter.`;
        }
      }
    }

    // Append provider context to thread context
    threadContext += providerContext;

    // Check Claude rate limit
    const rateLimit = await checkClaudeRateLimit(user.id, usageCheck.tier);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Log and generate complaint letter using Claude
    logClaudeCall({
      userId: user.id,
      route: '/api/complaints/generate',
      model: 'claude-sonnet-4-6',
      estimatedInputTokens: 1300,
      estimatedOutputTokens: 2000,
    });
    const result = await generateComplaintLetter({
      companyName: body.companyName,
      issueDescription: body.issueDescription,
      desiredOutcome: body.desiredOutcome,
      amount: body.amount,
      accountNumber: body.accountNumber,
      incidentDate: body.incidentDate,
      previousContact: body.previousContact,
      feedback: body.feedback,
      previousLetter: body.previousLetter,
      letterType: body.letterType,
      billContext: body.billContext,
      threadContext,
      verifiedLegalRefs,
    });

    // Cross-check: warn if AI cited laws not in our verified refs
    if (legalRefs && legalRefs.length > 0 && result.legalReferences?.length > 0) {
      const knownLaws = new Set(legalRefs.map((r: any) => r.law_name.toLowerCase()));
      for (const cited of result.legalReferences) {
        const citedLower = cited.toLowerCase();
        const matched = [...knownLaws].some(k => citedLower.includes(k));
        if (!matched) {
          console.warn(`[anti-hallucination] AI cited unknown reference: "${cited}" — not in verified legal_references`);
        }
      }
    }

    // Auto-fill user profile data into placeholders
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, phone, mobile_number, address, postcode')
      .eq('id', user.id)
      .single();

    if (profile && result.letter) {
      const name = profile.full_name || '';
      const email = profile.email || user.email || '';
      const phone = profile.phone || profile.mobile_number || '';
      const addr = profile.address || '';
      const pc = profile.postcode || '';
      const fullAddress = addr && pc ? `${addr}, ${pc}` : addr || pc || '';

      result.letter = result.letter
        .replace(/\[YOUR NAME\]/gi, name)
        .replace(/\[YOUR FULL NAME\]/gi, name)
        .replace(/\[YOUR EMAIL\]/gi, email)
        .replace(/\[YOUR EMAIL ADDRESS\]/gi, email)
        .replace(/\[YOUR PHONE\]/gi, phone)
        .replace(/\[YOUR PHONE NUMBER\]/gi, phone)
        .replace(/\[YOUR TELEPHONE\]/gi, phone)
        .replace(/\[YOUR ADDRESS\]/gi, fullAddress || '[Address not provided]')
        .replace(/\[YOUR POSTCODE\]/gi, pc || '[Postcode not provided]')
        .replace(/\[ACCOUNT NUMBER\]/gi, body.accountNumber || '[Account number not provided]');
    }

    // PR β — POST-FLIGHT validation. The pre-flight pass only controls
    // what we feed INTO the prompt. The model can still dredge a stale
    // or fabricated UK statute out of training data and stamp it into
    // the letter. Run a regex pass over the output, cross-check every
    // detected citation against the fresh pool we fed in, and either
    // substitute (closest fresh law_name) or strip rogues.
    let postFlightWarnings: string[] = [];
    if (result.letter && relevantRefs.length > 0) {
      const t0 = Date.now();
      const pf = postFlightSanitise(
        result.letter,
        relevantRefs.map((r: any) => ({ law_name: r.law_name, category: r.category }))
      );
      const elapsed = Date.now() - t0;
      if (elapsed > 100) {
        console.warn(`[guardrail] post-flight took ${elapsed}ms (>100ms budget) — non-blocking`);
      }
      if (pf.rogue.length > 0) {
        result.letter = pf.sanitised;
        postFlightWarnings = pf.warnings;
        console.warn(`[guardrail] post-flight stripped/substituted ${pf.rogue.length} rogue citation(s): ${pf.rogue.join(', ')}`);
        void supabase.from('business_log').insert({
          category: 'legal_intelligence',
          action: 'guardrail_postflight_sanitised',
          details: {
            user_id: user.id,
            company: body.companyName,
            rogue: pf.rogue,
            warnings: pf.warnings,
          },
        });
        if (!guardrailFooterNote) {
          guardrailFooterNote = 'Some statutory references were removed during compliance review — please verify before sending.';
        }
      }
    }

    // PR β — guardrail footer note. If at least one stale ref had no
    // fresh substitute and was stripped from the prompt, OR a rogue
    // post-flight citation was removed, surface a single-line note in
    // the letter footer so the user knows to double-check before
    // sending.
    if (guardrailFooterNote && result.letter) {
      result.letter = `${result.letter}\n\n---\nNote: ${guardrailFooterNote}`;
    }

    // Build rights pills — start from relevantRefs (already filtered by category/sector) so that
    // gym, fitness, or other mislabelled 'general' refs never appear in unrelated dispute letters,
    // then further narrow to what the AI actually cited.
    const allFetchedRefs = relevantRefs.length > 0 ? relevantRefs : (legalRefs || []);
    let matchedRefs = allFetchedRefs;

    if (result.legalReferences && result.legalReferences.length > 0) {
      const citedLower = result.legalReferences.map((r: string) => r.toLowerCase());
      const categorySpecific = allFetchedRefs.filter((r: any) => {
        const lawLower = r.law_name.toLowerCase();
        const sectionLower = (r.section || '').toLowerCase();
        return citedLower.some((cited: string) => {
          if (sectionLower) {
            return cited.includes(lawLower) && cited.includes(sectionLower);
          }
          return cited.includes(lawLower) || lawLower.includes(cited.substring(0, 20));
        });
      }).sort((a: any, b: any) => {
        // prioritise category-specific over 'general'
        if (a.category !== 'general' && b.category === 'general') return -1;
        if (a.category === 'general' && b.category !== 'general') return 1;
        return 0;
      });
      // Only filter if we matched at least 1 ref; otherwise fall back to all fetched
      if (categorySpecific.length > 0) {
        matchedRefs = categorySpecific;
      }
    }

    const rightsPills = matchedRefs.map((r: any) => ({
      label: `${r.law_name}${r.section ? ` ${r.section}` : ''}`,
      url: r.source_url,
      strength: r.strength,
    }));

    // Save task to database
    const { data: task } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        type: 'complaint_letter',
        title: `Complaint to ${body.companyName}`,
        description: body.issueDescription,
        provider_name: body.companyName,
        disputed_amount: body.amount ? parseFloat(body.amount) : null,
        account_number: body.accountNumber,
        status: 'pending_review',
        dispute_id: body.disputeId || null,
      })
      .select()
      .single();

    // Log agent run
    if (task) {
      // Calculate cost: Sonnet input=$3/1M, output=$15/1M
      const inputCost = (result.usage?.input_tokens || 0) * 0.000003;
      const outputCost = (result.usage?.output_tokens || 0) * 0.000015;

      await supabase.from('agent_runs').insert({
        task_id: task.id,
        user_id: user.id,
        agent_type: 'complaint_writer',
        model_name: 'claude-sonnet-4-6',
        status: 'completed',
        input_data: body,
        // citationGuarantee on output_data for audit. UI reads this to
        // show a "we auto-added X citations — verify" badge when
        // forced_after_retry is non-empty.
        output_data: { ...result, rightsPills },
        legal_references: result.legalReferences,
        input_tokens: result.usage?.input_tokens || null,
        output_tokens: result.usage?.output_tokens || null,
        estimated_cost: parseFloat((inputCost + outputCost).toFixed(6)),
        completed_at: new Date().toISOString(),
      });
    }

    // PR γ — reverse-lookup audit. Fire-and-forget one row per cited
    // ref into legal_ref_usages so the admin "Where used" drawer and
    // the daily re-verify cron can prioritise high-traffic refs. Never
    // blocks the user — wrapped in `void` and best-effort.
    //
    // RLS on legal_ref_usages is service-role-only (no anon INSERT
    // policy), so the request-scoped `supabase` client (anon + user
    // session) would be silently rejected. Use a fresh service-role
    // client just for this insert.
    try {
      if (relevantRefs.length > 0 && result.legalReferences && result.legalReferences.length > 0) {
        const citedLower = result.legalReferences.map((r: string) => r.toLowerCase());
        const usageRows = relevantRefs
          .filter((r: any) => citedLower.some((c: string) => c.includes(r.law_name.toLowerCase()) || r.law_name.toLowerCase().includes(c.split(',')[0].trim())))
          .map((r: any) => ({
            ref_id: r.id,
            product: 'b2c-complaint',
            artefact_id: task?.id ?? null,
            artefact_kind: 'complaint_letter',
            user_id: user.id,
            cited_text: result.legalReferences.find((c: string) => c.toLowerCase().includes(r.law_name.toLowerCase())) || r.law_name,
          }));
        if (usageRows.length > 0) {
          const adminSb = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          void adminSb.from('legal_ref_usages').insert(usageRows);
        }
      }
    } catch (e) {
      console.warn('[legal_ref_usages] insert failed (non-fatal):', e);
    }

    // If part of a dispute, add to correspondence thread
    if (body.disputeId && task) {
      await supabase.from('correspondence').insert({
        dispute_id: body.disputeId,
        user_id: user.id,
        entry_type: 'ai_letter',
        title: `Complaint to ${body.companyName}`,
        content: result.letter,
        task_id: task.id,
        entry_date: new Date().toISOString(),
      });
      // Update dispute timestamp
      await supabase
        .from('disputes')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', body.disputeId);
    }

    // Record Claude call for rate limiting and increment plan usage
    await recordClaudeCall(user.id, usageCheck.tier);
    await incrementUsage(user.id, 'complaint_generated');

    // Award loyalty points
    awardPoints(user.id, 'complaint_generated', { company: body.companyName })
      .then(result => { if (result.awarded) console.log(`[loyalty] +${result.points} points for complaint`); })
      .catch(err => console.error('[loyalty] Failed to award points:', err.message));

    // Meta Conversions API - track letter generation as conversion event
    trackLetterGenerated({
      userId: user.id,
      email: user.email || undefined,
      provider: body.companyName,
    }).catch(() => {});

    return NextResponse.json({ ...result, taskId: task?.id, rightsPills, pendingLegalUpdates });
  } catch (error: any) {
    console.error('Complaint generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate complaint' },
      { status: 500 }
    );
  }
}
