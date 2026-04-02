import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

export const maxExtractionDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface ContractExtractionResult {
  extractionId: string | null;
  contractEndDate: string | null;
  contractStartDate: string | null;
  providerName: string | null;
  subscriptionSynced: boolean;
  suggestedSubscriptionId: string | null;
  isContract: boolean;
  error?: string;
}

/**
 * Safety-net utility — call from any upload route after the file is stored.
 * Fetches the file from fileUrl, runs Claude Vision to detect contract terms,
 * saves to contract_extractions, and syncs contract_end_date to the linked
 * subscription (or suggests a match by provider name).
 *
 * Returns a non-throwing result — the caller's upload always succeeds regardless.
 */
export async function extractAndSaveEndDates(
  supabase: SupabaseClient,
  userId: string,
  fileUrl: string,
  options: {
    linkedSubscriptionId?: string | null;
    linkedDisputeId?: string | null;
    providerName?: string;
    fileName?: string;
    mimeType?: string;
  } = {}
): Promise<ContractExtractionResult> {
  const { linkedSubscriptionId, linkedDisputeId, providerName, fileName, mimeType } = options;

  const empty: ContractExtractionResult = {
    extractionId: null,
    contractEndDate: null,
    contractStartDate: null,
    providerName: providerName || null,
    subscriptionSynced: false,
    suggestedSubscriptionId: null,
    isContract: false,
  };

  try {
    // Fetch the file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return { ...empty, error: `Could not fetch file: ${response.status}` };
    }

    const contentType = mimeType || response.headers.get('content-type') || 'application/octet-stream';
    const isPdf = contentType.includes('pdf');
    const isImage = contentType.startsWith('image/');

    if (!isPdf && !isImage) {
      return { ...empty, error: 'Unsupported file type for extraction' };
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const fileBlock = isPdf
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: (contentType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'),
            data: base64,
          },
        };

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            {
              type: 'text',
              text: `You are analysing a UK consumer document${providerName ? ` from ${providerName}` : ''}.
Determine if this is a contract, bill, invoice, or terms document.
Return ONLY a JSON object:

{
  "is_contract": true or false,
  "provider_name": "company name if visible, or null",
  "contract_type": "energy, broadband, mobile, insurance, gym, streaming, finance, or other",
  "contract_start_date": "YYYY-MM-DD or null",
  "contract_end_date": "YYYY-MM-DD or null",
  "minimum_term": "e.g. '12 months', '24 months', or null",
  "notice_period": "e.g. '30 days', '14 days notice required', or null",
  "monthly_cost": number or null,
  "annual_cost": number or null,
  "cancellation_fee": "e.g. '£50 early exit fee', or null",
  "early_exit_fee": "the exact early termination charge wording, or null",
  "price_increase_clause": "what it says about price increases, or null",
  "auto_renewal": "whether the contract auto-renews and on what terms, or null",
  "cooling_off_period": "cancellation rights in first 14 days etc, or null",
  "extracted_terms": ["array of other notable terms"],
  "unfair_clauses": ["list of any unfair clauses under Consumer Rights Act 2015 Part 2"],
  "summary": "2-3 sentence plain English summary, or null if not a contract"
}

Set is_contract to false if this is a general email, screenshot, or unrelated document.
Set all other fields to null if is_contract is false.`,
            },
          ],
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return { ...empty, error: 'Unexpected AI response type' };
    }

    const raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ...empty, error: 'Could not parse AI response' };
    }

    const result = JSON.parse(jsonMatch[0]);

    if (!result.is_contract) {
      return { ...empty, isContract: false };
    }

    // Require at least one of dispute_id / subscription_id to satisfy DB constraint
    const saveDisputeId = linkedDisputeId || null;
    const saveSubscriptionId = linkedSubscriptionId || null;

    if (!saveDisputeId && !saveSubscriptionId) {
      return {
        ...empty,
        isContract: true,
        contractEndDate: result.contract_end_date || null,
        contractStartDate: result.contract_start_date || null,
        providerName: result.provider_name || providerName || null,
        error: 'No dispute or subscription to link extraction to',
      };
    }

    const { data: extraction, error: insertError } = await supabase
      .from('contract_extractions')
      .insert({
        user_id: userId,
        dispute_id: saveDisputeId,
        subscription_id: saveSubscriptionId,
        file_url: fileUrl,
        file_name: fileName || null,
        file_type: contentType,
        provider_name: result.provider_name || providerName || null,
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
      .select('id')
      .single();

    if (insertError || !extraction) {
      console.error('extractAndSaveEndDates: insert failed:', insertError);
      return {
        ...empty,
        isContract: true,
        contractEndDate: result.contract_end_date || null,
        contractStartDate: result.contract_start_date || null,
        providerName: result.provider_name || providerName || null,
        error: 'DB insert failed',
      };
    }

    let subscriptionSynced = false;
    let suggestedSubscriptionId: string | null = null;

    // Sync to directly linked subscription
    if (saveSubscriptionId && result.contract_end_date) {
      const syncFields: Record<string, unknown> = {};
      if (result.contract_start_date) syncFields.contract_start_date = result.contract_start_date;
      syncFields.contract_end_date = result.contract_end_date;
      if (result.minimum_term) {
        const months = parseInt(result.minimum_term);
        if (!isNaN(months)) syncFields.contract_term_months = months;
      }
      if (result.auto_renewal != null) {
        syncFields.auto_renews =
          typeof result.auto_renewal === 'boolean'
            ? result.auto_renewal
            : String(result.auto_renewal).toLowerCase().includes('yes');
      }
      if (result.early_exit_fee) {
        const fee = parseFloat(String(result.early_exit_fee).replace(/[^0-9.]/g, ''));
        if (!isNaN(fee)) syncFields.early_exit_fee = fee;
      }
      if (result.contract_type) syncFields.contract_type = result.contract_type;

      const { error: syncError } = await supabase
        .from('subscriptions')
        .update(syncFields)
        .eq('id', saveSubscriptionId)
        .eq('user_id', userId);
      subscriptionSynced = !syncError;
    }

    // When only linked to a dispute (no subscription), try to find a matching sub by provider name
    // and surface it as a suggestion — do NOT auto-sync without explicit user action
    if (saveDisputeId && !saveSubscriptionId && result.contract_end_date) {
      const nameToMatch = result.provider_name || providerName;
      if (nameToMatch) {
        const { data: matchedSubs } = await supabase
          .from('subscriptions')
          .select('id, provider_name')
          .eq('user_id', userId)
          .ilike('provider_name', nameToMatch)
          .limit(1);

        if (matchedSubs && matchedSubs.length > 0) {
          suggestedSubscriptionId = matchedSubs[0].id;
        }
      }
    }

    return {
      extractionId: extraction.id,
      contractEndDate: result.contract_end_date || null,
      contractStartDate: result.contract_start_date || null,
      providerName: result.provider_name || providerName || null,
      subscriptionSynced,
      suggestedSubscriptionId,
      isContract: true,
    };
  } catch (err) {
    console.error('extractAndSaveEndDates error:', err);
    return { ...empty, error: String(err) };
  }
}

/**
 * Sync a contract_end_date from a contract_extraction to its linked subscription.
 * Called after any extraction that has a subscription_id.
 */
export function buildSubscriptionSyncFields(result: {
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  minimum_term?: string | null;
  auto_renewal?: string | boolean | null;
  early_exit_fee?: string | null;
  contract_type?: string | null;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (result.contract_start_date) fields.contract_start_date = result.contract_start_date;
  if (result.contract_end_date) fields.contract_end_date = result.contract_end_date;
  if (result.minimum_term) {
    const months = parseInt(result.minimum_term);
    if (!isNaN(months)) fields.contract_term_months = months;
  }
  if (result.auto_renewal != null) {
    fields.auto_renews =
      typeof result.auto_renewal === 'boolean'
        ? result.auto_renewal
        : String(result.auto_renewal).toLowerCase().includes('yes');
  }
  if (result.early_exit_fee) {
    const fee = parseFloat(String(result.early_exit_fee).replace(/[^0-9.]/g, ''));
    if (!isNaN(fee)) fields.early_exit_fee = fee;
  }
  if (result.contract_type) fields.contract_type = result.contract_type;
  return fields;
}
