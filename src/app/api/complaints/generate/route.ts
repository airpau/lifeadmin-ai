import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateComplaintLetter } from '@/lib/agents/complaints-agent';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall } from '@/lib/claude-rate-limit';
import { trackLetterGenerated } from '@/lib/meta-conversions';
import { awardPoints } from '@/lib/loyalty';

// Claude takes 10-20s for complaint letters — extend beyond Vercel's 10s default
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        threadContext = `\n\nPREVIOUS CORRESPONDENCE (this is an ongoing dispute — reference earlier letters and responses):\n${entries.join('\n\n---\n\n')}`;
      }

      // Load contract extractions for this dispute
      const { data: contracts } = await supabase
        .from('contract_extractions')
        .select('*')
        .eq('dispute_id', body.disputeId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (contracts && contracts.length > 0) {
        const c = contracts[0];
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
      }
    }

    // Fetch verified legal references for this letter type
    const issueTypeToCategory: Record<string, string[]> = {
      complaint: ['general'],
      energy_dispute: ['general', 'energy'],
      broadband_complaint: ['general', 'broadband'],
      flight_compensation: ['general', 'travel'],
      parking_appeal: ['general', 'parking'],
      debt_dispute: ['general', 'debt', 'finance'],
      refund_request: ['general', 'finance'],
      hmrc_tax_rebate: ['hmrc'],
      council_tax_band: ['council_tax'],
      dvla_vehicle: ['dvla'],
      nhs_complaint: ['nhs'],
    };

    const categories = issueTypeToCategory[body.letterType || 'complaint'] || ['general'];
    const { data: legalRefs } = await supabase
      .from('legal_references')
      .select('law_name, section, summary, source_url, escalation_body, strength')
      .in('category', categories)
      .in('verification_status', ['current', 'updated']);

    let verifiedLegalRefs = '';
    if (legalRefs && legalRefs.length > 0) {
      verifiedLegalRefs = legalRefs.map(r =>
        `- ${r.law_name}${r.section ? `, ${r.section}` : ''}: ${r.summary}${r.escalation_body ? ` (Escalate to: ${r.escalation_body})` : ''} [Source: ${r.source_url}]`
      ).join('\n');
    }

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

    // Build rights pills data for the UI (needed before agent run log)
    const rightsPills = (legalRefs || []).map((r: any) => ({
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
        output_data: { ...result, rightsPills },
        legal_references: result.legalReferences,
        input_tokens: result.usage?.input_tokens || null,
        output_tokens: result.usage?.output_tokens || null,
        estimated_cost: parseFloat((inputCost + outputCost).toFixed(6)),
        completed_at: new Date().toISOString(),
      });
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

    return NextResponse.json({ ...result, taskId: task?.id, rightsPills });
  } catch (error: any) {
    console.error('Complaint generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate complaint' },
      { status: 500 }
    );
  }
}
