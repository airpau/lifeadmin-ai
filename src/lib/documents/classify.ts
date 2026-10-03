/**
 * Document classification for the vault: one small Claude Haiku call per
 * NEW document (duplicates are caught by SHA-256 before this runs).
 *
 * Inputs are cheap on purpose: sender, subject, filename, file type and
 * up to 3,000 characters of the email body. PDF contents are not read:
 * the repo has no PDF text parser and this PR does not add one.
 *
 * The model must return strict JSON. parseClassification() validates
 * every field; anything malformed becomes null, and an unusable answer
 * (or any API failure) falls back to doc_type 'other' with low
 * confidence. Nothing here throws to the caller, so one bad document can
 * never sink a batch.
 *
 * Every call is logged to api_cost_ledger via logAnthropicCall.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logAnthropicCall } from '@/lib/cost-ledger';
import { DOC_TYPES, isDocType, type DocType } from '@/lib/documents/types';
import { parseWarrantyMonths } from '@/lib/documents/warranty';

/**
 * Same Haiku model id used by the inbox scanner (src/lib/gmail.ts,
 * src/lib/outlook.ts) and dispute outcome extraction. There is no shared
 * exported constant for it in the repo, so it is repeated here.
 */
export const DOCUMENT_CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

export interface ClassificationResult {
  doc_type: DocType;
  /** For email body snapshots: is this email itself a receipt or bill worth keeping? */
  is_document: boolean;
  supplier: string | null;
  amount: number | null;
  currency: string | null;
  vat_amount: number | null;
  doc_date: string | null;
  due_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  summary: string | null;
  /**
   * Length of a warranty or guarantee stated on the document, in months
   * (stage three). null when none is stated. warranty_until is worked
   * out from the purchase date in store.ts.
   */
  warranty_months: number | null;
  /** The product the warranty or guarantee covers, short. */
  warranty_product: string | null;
  /** 0 to 1 */
  confidence: number;
}

export function fallbackClassification(isDocument = true): ClassificationResult {
  return {
    doc_type: 'other',
    is_document: isDocument,
    supplier: null,
    amount: null,
    currency: null,
    vat_amount: null,
    doc_date: null,
    due_date: null,
    expiry_date: null,
    renewal_date: null,
    summary: null,
    warranty_months: null,
    warranty_product: null,
    confidence: 0.1,
  };
}

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

/** YYYY-MM-DD that is a real calendar date between 1990 and 2100, else null. */
export function validIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function money(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && v.trim()) n = Number(v.replace(/[£$€,\s]/g, ''));
  else return null;
  if (!Number.isFinite(n) || n < 0 || n >= 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

function shortText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.slice(0, max);
}

/**
 * Parse and validate a model answer. Returns null when the answer is not
 * usable at all (no JSON object, or no valid doc_type). Individual bad
 * fields are dropped to null rather than failing the whole answer.
 */
export function parseClassification(raw: string | null | undefined): ClassificationResult | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const type = typeof obj.doc_type === 'string' ? obj.doc_type.toLowerCase().trim() : '';
  if (!isDocType(type)) return null;

  let confidence = typeof obj.confidence === 'number' ? obj.confidence : Number(obj.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.3;
  if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
  confidence = Math.min(1, Math.max(0, confidence));

  const currencyRaw = typeof obj.currency === 'string' ? obj.currency.trim().toUpperCase() : '';
  const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : null;
  const amount = money(obj.amount);

  return {
    doc_type: type,
    is_document: typeof obj.is_document === 'boolean' ? obj.is_document : true,
    supplier: shortText(obj.supplier, 120),
    amount,
    currency: amount !== null ? currency ?? 'GBP' : currency,
    vat_amount: money(obj.vat_amount),
    doc_date: validIsoDate(obj.doc_date),
    due_date: validIsoDate(obj.due_date),
    expiry_date: validIsoDate(obj.expiry_date),
    renewal_date: validIsoDate(obj.renewal_date),
    summary: shortText(obj.summary, 300),
    warranty_months: parseWarrantyMonths(obj.warranty_months),
    warranty_product: shortText(obj.warranty_product, 120),
    confidence: Math.round(confidence * 1000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface ClassifyInput {
  mode: 'attachment' | 'email_body' | 'drive';
  sender?: string | null;
  subject?: string | null;
  filename: string;
  mimeType: string;
  bodyText?: string | null;
  emailDate?: string | null;
}

const SYSTEM = `You file a UK household's paperwork. You are shown ONE document's context (sender, subject, filename, file type and, when available, the text of the email it came with). Return JSON only, no prose and no code fences.

doc_type is exactly one of: ${DOC_TYPES.join(', ')}.
- receipt: proof of a payment already made (order receipt, card payment confirmation)
- invoice: a request for payment for goods or services, often with VAT
- bill: a recurring utility, telecoms, council tax or similar bill
- statement: bank, card, loan, mortgage, pension or account statement
- certificate: gas safety, EPCR, EPC, MOT, insurance certificate, warranty certificate
- policy: insurance policy schedule or policy document
- contract: an agreement, tenancy, terms the person signed up to
- letter: formal correspondence (HMRC, council, bank letter) that is none of the above
- other: anything else

is_document: false ONLY when you are shown an email with no attachment and that email is not itself a receipt, invoice, bill or statement worth keeping (newsletters, marketing, shipping updates without prices). Otherwise true.

Dates are YYYY-MM-DD or null. due_date = payment due. renewal_date = when a policy, contract or subscription renews. expiry_date = when a certificate, warranty or document expires. doc_date = the document's own date. Never invent a date that is not stated or clearly implied.
amount and vat_amount are numbers in the document currency (no symbols) or null. currency is a 3 letter code, default GBP for UK documents.
supplier is the company name, short (for example "British Gas", "Amazon", "HMRC").
summary is one plain English sentence, at most 25 words, British spelling.
warranty_months: when a receipt, invoice or warranty certificate STATES a warranty or guarantee length for something bought (for example "2 year guarantee" = 24, "12 months manufacturer warranty" = 12), the length in whole months. Otherwise null. Never guess a length that is not stated. Ignore extended warranties that were offered but not bought.
warranty_product is the item that warranty covers, short (for example "Bosch washing machine"), or null.
confidence is 0 to 1.

JSON shape:
{"doc_type":"...","is_document":true,"supplier":null,"amount":null,"currency":null,"vat_amount":null,"doc_date":null,"due_date":null,"expiry_date":null,"renewal_date":null,"summary":"...","warranty_months":null,"warranty_product":null,"confidence":0.0}`;

let _client: Anthropic | undefined;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function buildClassifierPrompt(input: ClassifyInput): string {
  const body = (input.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
  return [
    `Source: ${input.mode === 'drive' ? 'imported from Google Drive' : input.mode === 'email_body' ? 'an email with no attachment (the email itself)' : 'an email attachment'}`,
    input.sender ? `Sender: ${input.sender.slice(0, 200)}` : null,
    input.subject ? `Subject: ${input.subject.slice(0, 300)}` : null,
    input.emailDate ? `Email date: ${input.emailDate}` : null,
    `Filename: ${input.filename.slice(0, 200)}`,
    `File type: ${input.mimeType}`,
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    body ? `Email text:\n"""\n${body}\n"""` : 'Email text: (none available)',
    'Return the JSON.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Classify one document. Never throws. `usedFallback` is true when the
 * model could not be reached or its answer could not be used;
 * `apiError` is true only when the call itself failed.
 */
export async function classifyDocument(
  input: ClassifyInput,
  ctx: { userId: string; endpoint: string },
): Promise<{ result: ClassificationResult; usedFallback: boolean; apiError: boolean; model: string }> {
  try {
    const message = await client().messages.create({
      model: DOCUMENT_CLASSIFIER_MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildClassifierPrompt(input) }],
    });
    logAnthropicCall({
      model: DOCUMENT_CLASSIFIER_MODEL,
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
      endpoint: ctx.endpoint,
      userId: ctx.userId,
      metadata: { feature: 'documents_vault', mode: input.mode },
    });
    const block = message.content.find((b) => b.type === 'text');
    const parsed = parseClassification(block && block.type === 'text' ? block.text : null);
    if (!parsed) {
      return { result: fallbackClassification(input.mode !== 'email_body'), usedFallback: true, apiError: false, model: DOCUMENT_CLASSIFIER_MODEL };
    }
    return { result: parsed, usedFallback: false, apiError: false, model: DOCUMENT_CLASSIFIER_MODEL };
  } catch (err) {
    console.warn('[documents.classify] failed:', err instanceof Error ? err.message : err);
    // An email body we could not classify is NOT kept (we only keep
    // body snapshots we are confident are receipts); attachments are.
    // apiError lets the pipeline leave the message unprocessed so it is
    // retried next run, instead of recording a permanent outcome.
    return { result: fallbackClassification(input.mode !== 'email_body'), usedFallback: true, apiError: true, model: DOCUMENT_CLASSIFIER_MODEL };
  }
}
