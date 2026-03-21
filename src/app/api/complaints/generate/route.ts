import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateComplaintLetter } from '@/lib/agents/complaints-agent';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall } from '@/lib/claude-rate-limit';

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
    const rateLimit = checkClaudeRateLimit(user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Claude rate limit reached (${rateLimit.used}/10 calls in the last hour). Please wait before trying again.` },
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
    });

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
      await supabase.from('agent_runs').insert({
        task_id: task.id,
        user_id: user.id,
        agent_type: 'complaint_writer',
        model_name: 'claude-sonnet-4-6',
        status: 'completed',
        input_data: body,
        output_data: result,
        legal_references: result.legalReferences,
        completed_at: new Date().toISOString(),
      });
    }

    // Record Claude call for rate limiting and increment plan usage
    recordClaudeCall(user.id);
    await incrementUsage(user.id, 'complaint_generated');

    return NextResponse.json({ ...result, taskId: task?.id });
  } catch (error: any) {
    console.error('Complaint generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate complaint' },
      { status: 500 }
    );
  }
}
