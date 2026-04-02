import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * POST /api/contracts/analyse
 * Upload a contract (PDF or image) and extract key terms using Claude Vision.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const disputeId = formData.get('disputeId') as string | null;

  if (!file || !disputeId) {
    return NextResponse.json({ error: 'Missing file or disputeId' }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 });
  }

  // Verify dispute ownership
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id, provider_name')
    .eq('id', disputeId)
    .eq('user_id', user.id)
    .single();

  if (!dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  // Upload file to Supabase Storage
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `contracts/${user.id}/${disputeId}/${Date.now()}.${ext}`;

  const { data: upload, error: uploadError } = await supabase.storage
    .from('correspondence-files')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('Contract upload failed:', uploadError);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from('correspondence-files')
    .getPublicUrl(upload.path);

  // Convert file to base64 for Claude Vision
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  const isPdf = file.type === 'application/pdf';

  // Build the file content block with correct typing
  const fileBlock = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 } };

  // Send to Claude Vision for extraction
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        fileBlock,
        {
          type: 'text',
          text: `You are analysing a UK consumer contract or terms document for ${dispute.provider_name || 'a company'}.

Extract the following key terms and return ONLY a JSON object:

{
  "provider_name": "the company name if visible",
  "contract_start_date": "start date if found, or null",
  "contract_end_date": "end date / expiry if found, or null",
  "minimum_term": "e.g. '12 months', '24 months', or null",
  "notice_period": "e.g. '30 days', '14 days notice required', or null",
  "cancellation_fee": "e.g. '£50 early exit fee', or null",
  "early_exit_fee": "the exact early termination charge wording, or null",
  "price_increase_clause": "what it says about price increases during the contract, or null",
  "auto_renewal": "whether the contract auto-renews and on what terms, or null",
  "cooling_off_period": "cancellation rights in first 14 days etc, or null",
  "unfair_clauses": ["list of any clauses that may be unfair under the Consumer Rights Act 2015 Part 2, with brief explanation for each"],
  "summary": "A 2-3 sentence plain English summary of what this contract means for the consumer. No legal jargon."
}

If you can't find a particular term, set it to null. For unfair_clauses, flag anything that seems one-sided, hidden, or that a reasonable consumer wouldn't expect.`,
        },
      ],
    }],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    return NextResponse.json({ error: 'Unexpected response from AI' }, { status: 500 });
  }

  // Parse JSON response
  let raw = content.text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Could not parse contract analysis' }, { status: 500 });
  }

  const result = JSON.parse(jsonMatch[0]);

  // Save to database
  const { data: extraction, error: insertError } = await supabase
    .from('contract_extractions')
    .insert({
      dispute_id: disputeId,
      user_id: user.id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: file.type,
      provider_name: result.provider_name || dispute.provider_name,
      contract_start_date: result.contract_start_date,
      contract_end_date: result.contract_end_date,
      minimum_term: result.minimum_term,
      notice_period: result.notice_period,
      cancellation_fee: result.cancellation_fee,
      early_exit_fee: result.early_exit_fee,
      price_increase_clause: result.price_increase_clause,
      auto_renewal: result.auto_renewal,
      cooling_off_period: result.cooling_off_period,
      extracted_terms: result,
      unfair_clauses: result.unfair_clauses || [],
      raw_summary: result.summary,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Failed to save contract extraction:', insertError);
    return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 });
  }

  // Sync contract_end_date to a matching subscription (dispute flow has no subscription_id,
  // so we match by provider name as a best-effort sync)
  let suggestedSubscriptionId: string | null = null;
  if (result.contract_end_date) {
    const providerName = result.provider_name || dispute.provider_name;
    if (providerName) {
      const { data: matchedSubs } = await supabase
        .from('subscriptions')
        .select('id, provider_name, contract_end_date')
        .eq('user_id', user.id)
        .ilike('provider_name', providerName)
        .limit(1);

      if (matchedSubs && matchedSubs.length > 0) {
        suggestedSubscriptionId = matchedSubs[0].id;

        // Only overwrite if the subscription has no contract_end_date yet
        if (!matchedSubs[0].contract_end_date) {
          await supabase
            .from('subscriptions')
            .update({ contract_end_date: result.contract_end_date })
            .eq('id', suggestedSubscriptionId)
            .eq('user_id', user.id);
        }
      }
    }
  }

  return NextResponse.json({ ...extraction, suggested_subscription_id: suggestedSubscriptionId });
}
