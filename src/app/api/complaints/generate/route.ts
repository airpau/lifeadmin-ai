import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateComplaintLetter } from '@/lib/agents/complaints-agent';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate required fields
    if (!body.companyName || !body.issueDescription || !body.desiredOutcome) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate complaint letter using Claude
    const result = await generateComplaintLetter({
      companyName: body.companyName,
      issueDescription: body.issueDescription,
      desiredOutcome: body.desiredOutcome,
      amount: body.amount,
      accountNumber: body.accountNumber,
      incidentDate: body.incidentDate,
      previousContact: body.previousContact,
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
        model_name: 'claude-3-5-sonnet-20241022',
        status: 'completed',
        input_data: body,
        output_data: result,
        legal_references: result.legalReferences,
        completed_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Complaint generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate complaint' },
      { status: 500 }
    );
  }
}
