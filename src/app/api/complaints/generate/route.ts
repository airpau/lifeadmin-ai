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
        output_data: result,
        legal_references: result.legalReferences,
        input_tokens: result.usage?.input_tokens || null,
        output_tokens: result.usage?.output_tokens || null,
        estimated_cost: parseFloat((inputCost + outputCost).toFixed(6)),
        completed_at: new Date().toISOString(),
      });
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

    return NextResponse.json({ ...result, taskId: task?.id });
  } catch (error: any) {
    console.error('Complaint generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate complaint' },
      { status: 500 }
    );
  }
}
