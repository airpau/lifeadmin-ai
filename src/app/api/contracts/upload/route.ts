import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * POST /api/contracts/upload
 * Upload a contract (PDF or image) to the Contract Vault.
 * Optionally link to a dispute_id or subscription_id.
 * Claude Vision extracts key terms.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const disputeId = formData.get('disputeId') as string | null;
  const subscriptionId = formData.get('subscriptionId') as string | null;
  const customProviderName = formData.get('customProviderName') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 });
  }

  // Get provider name from dispute, subscription, or custom input
  let providerName = customProviderName || '';
  if (disputeId) {
    const { data: d } = await supabase.from('disputes').select('provider_name').eq('id', disputeId).eq('user_id', user.id).single();
    providerName = d?.provider_name || providerName;
  }
  if (subscriptionId) {
    const { data: s } = await supabase.from('subscriptions').select('provider_name').eq('id', subscriptionId).eq('user_id', user.id).single();
    providerName = s?.provider_name || providerName;
  }

  // Upload to private contracts bucket
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { data: upload, error: uploadError } = await supabase.storage
    .from('contracts')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('Contract upload failed:', uploadError);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }

  // Get signed URL (private bucket)
  const { data: signedUrl } = await supabase.storage
    .from('contracts')
    .createSignedUrl(upload.path, 60 * 60 * 24 * 365); // 1 year

  const fileUrl = signedUrl?.signedUrl || upload.path;

  // Claude Vision extraction
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  const isPdf = file.type === 'application/pdf';
  const fileBlock = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 } };

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        fileBlock,
        {
          type: 'text',
          text: `You are analysing a UK consumer contract or terms document${providerName ? ` for ${providerName}` : ''}.

Extract the following key terms and return ONLY a JSON object:

{
  "provider_name": "the company name if visible",
  "contract_type": "energy, broadband, mobile, insurance, gym, streaming, finance, or other",
  "contract_start_date": "YYYY-MM-DD or null",
  "contract_end_date": "YYYY-MM-DD or null",
  "minimum_term": "e.g. '12 months', '24 months', or null",
  "notice_period": "e.g. '30 days', '14 days notice required', or null",
  "monthly_cost": number or null,
  "annual_cost": number or null,
  "cancellation_fee": "e.g. '£50 early exit fee', or null",
  "early_exit_fee": "the exact early termination charge wording, or null",
  "price_increase_clause": "what it says about price increases during the contract, or null",
  "auto_renewal": "whether the contract auto-renews and on what terms, or null",
  "cooling_off_period": "cancellation rights in first 14 days etc, or null",
  "extracted_terms": ["array of other notable terms in plain English"],
  "unfair_clauses": ["list of any clauses that may be unfair under the Consumer Rights Act 2015 Part 2, with brief explanation for each"],
  "summary": "A 2-3 sentence plain English summary of what this contract means for the consumer. No legal jargon."
}

Set terms to null if not found. For unfair_clauses, flag anything one-sided, hidden, or that a reasonable consumer wouldn't expect.`,
        },
      ],
    }],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    return NextResponse.json({ error: 'Unexpected response from AI' }, { status: 500 });
  }

  let raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Could not parse contract analysis' }, { status: 500 });
  }

  let result: any;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: 'Could not parse contract analysis' }, { status: 500 });
  }

  // Save to database
  const { data: extraction, error: insertError } = await supabase
    .from('contract_extractions')
    .insert({
      user_id: user.id,
      dispute_id: disputeId || null,
      subscription_id: subscriptionId || null,
      file_url: fileUrl,
      file_name: file.name,
      file_type: file.type,
      provider_name: result.provider_name || providerName,
      contract_type: result.contract_type || null,
      contract_start_date: result.contract_start_date || null,
      contract_end_date: result.contract_end_date || null,
      minimum_term: result.minimum_term || null,
      notice_period: result.notice_period || null,
      monthly_cost: result.monthly_cost || null,
      annual_cost: result.annual_cost || null,
      cancellation_fee: result.cancellation_fee || null,
      early_exit_fee: result.early_exit_fee || null,
      price_increase_clause: result.price_increase_clause || null,
      auto_renewal: result.auto_renewal || null,
      cooling_off_period: result.cooling_off_period || null,
      extracted_terms: result,
      unfair_clauses: result.unfair_clauses || [],
      raw_summary: result.summary || null,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Failed to save contract extraction:', insertError);
    return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 });
  }

  // If linked to a subscription, sync extracted data back
  if (subscriptionId && extraction) {
    const syncFields: any = {};
    if (result.contract_start_date) syncFields.contract_start_date = result.contract_start_date;
    if (result.contract_end_date) syncFields.contract_end_date = result.contract_end_date;
    if (result.minimum_term) {
      const months = parseInt(String(result.minimum_term));
      if (!isNaN(months)) syncFields.contract_term_months = months;
    }
    if (result.auto_renewal != null) syncFields.auto_renews = String(result.auto_renewal).toLowerCase().includes('yes') || result.auto_renewal === true;
    if (result.early_exit_fee) syncFields.early_exit_fee = parseFloat(String(result.early_exit_fee).replace(/[^0-9.]/g, '')) || null;
    if (result.contract_type) syncFields.contract_type = result.contract_type;

    if (Object.keys(syncFields).length > 0) {
      await supabase.from('subscriptions').update(syncFields).eq('id', subscriptionId).eq('user_id', user.id);
    }
  }

  return NextResponse.json(extraction);
}
