/**
 * Save one file into the documents vault: dedupe, classify, upload to
 * the private `documents` bucket, insert the row.
 *
 * Order matters for cost: the SHA-256 and (provider, message, part)
 * duplicate checks run BEFORE classification, so a file we already hold
 * never costs an Anthropic call.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, type DocType, type DocumentSource } from '@/lib/documents/types';
import { extensionForMime, sanitizeFilename } from '@/lib/documents/attachments';
import type { ClassificationResult } from '@/lib/documents/classify';
import { countDocumentsThisMonth } from '@/lib/documents/plan';
import { asciiFilename } from '@/lib/documents/content-disposition';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Storage object path. Always under the user's own prefix (the bucket read policy depends on it). */
export function storagePathFor(userId: string, sha256: string, mime: string, filename: string): string {
  return `${userId}/${sha256}.${extensionForMime(mime, filename)}`;
}

export interface StoreDocumentInput {
  userId: string;
  source: DocumentSource;
  connectionId?: string | null;
  provider?: string | null;
  messageId?: string | null;
  partKey?: string | null;
  driveSourceFileId?: string | null;
  emailSubject?: string | null;
  emailFrom?: string | null;
  emailDate?: string | null;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  /** Called only for a new file. */
  classify: () => Promise<{ result: ClassificationResult; model: string }>;
  /**
   * When the same file was saved before and then deleted by the user:
   * true brings it back (an explicit import), false leaves it deleted
   * (automatic filing must not resurrect something the user removed).
   */
  allowReviveDeleted?: boolean;
  /**
   * Monthly cap for the user's plan (PlanLimits.documentsPerMonth), or
   * null when uncapped. Written to documents.quota_limit_at_insert so the
   * documents_monthly_cap trigger checks it atomically, under a per-user
   * lock, at insert time. Concurrent runs can therefore never overrun it.
   */
  quotaLimit?: number | null;
}

export interface StoredDocument {
  id: string;
  doc_type: DocType;
  doc_date: string | null;
  supplier: string | null;
  filename: string;
  mime_type: string;
  created_at: string;
}

export type StoreOutcome =
  | { status: 'saved'; doc: StoredDocument; classification: ClassificationResult }
  | { status: 'duplicate'; existingId: string }
  | { status: 'skipped'; reason: 'too_large' | 'empty' }
  | { status: 'quota' }
  | { status: 'error'; message: string };

export async function storeDocument(admin: Admin, input: StoreDocumentInput): Promise<StoreOutcome> {
  const bytes = input.bytes;
  if (!bytes || bytes.length === 0) return { status: 'skipped', reason: 'empty' };
  if (bytes.length > MAX_DOCUMENT_BYTES) return { status: 'skipped', reason: 'too_large' };

  const sha = sha256Hex(bytes);
  const filename = sanitizeFilename(input.filename);
  const path = storagePathFor(input.userId, sha, input.mimeType, filename);

  // 1. Same bytes already held?
  const { data: bySha } = await admin
    .from('documents')
    .select('id, status, doc_type, doc_date, supplier, filename, mime_type, created_at')
    .eq('user_id', input.userId)
    .eq('sha256', sha)
    .maybeSingle();
  if (bySha) {
    if (bySha.status === 'active' || !input.allowReviveDeleted) return { status: 'duplicate', existingId: bySha.id };
    // Explicit re-import of something the user deleted: put the file back.
    const up = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: input.mimeType, upsert: true });
    if (up.error) return { status: 'error', message: `Storage upload failed: ${up.error.message}` };
    const { error } = await admin
      .from('documents')
      .update({ status: 'active', deleted_at: null, storage_path: path, storage_bucket: DOCUMENTS_BUCKET })
      .eq('id', bySha.id)
      .eq('user_id', input.userId);
    if (error) return { status: 'error', message: error.message };
    return {
      status: 'saved',
      doc: bySha as StoredDocument,
      classification: {
        doc_type: bySha.doc_type,
        is_document: true,
        supplier: bySha.supplier,
        amount: null,
        currency: null,
        vat_amount: null,
        doc_date: bySha.doc_date,
        due_date: null,
        expiry_date: null,
        renewal_date: null,
        summary: null,
        confidence: 0,
      },
    };
  }

  // 2. Same attachment of the same message already held (bytes differ only if the sender re-encoded)?
  if (input.messageId && input.provider && input.partKey) {
    const { data: byPart } = await admin
      .from('documents')
      .select('id')
      .eq('user_id', input.userId)
      .eq('provider', input.provider)
      .eq('message_id', input.messageId)
      .eq('part_key', input.partKey)
      .maybeSingle();
    if (byPart) return { status: 'duplicate', existingId: byPart.id };
  }

  // 3. Capped plans: a cheap count first so a run that has hit the cap
  // does not pay for a classification it cannot keep. The insert trigger
  // is still the real, atomic guard.
  if (input.quotaLimit !== null && input.quotaLimit !== undefined) {
    const used = await countDocumentsThisMonth(admin, input.userId);
    if (used >= input.quotaLimit) return { status: 'quota' };
  }

  // 4. New: classify (cost), upload, insert.
  const { result, model } = await input.classify();

  const up = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: input.mimeType, upsert: true });
  if (up.error) return { status: 'error', message: `Storage upload failed: ${up.error.message}` };

  const row = {
    user_id: input.userId,
    source: input.source,
    connection_id: input.connectionId ?? null,
    provider: input.provider ?? null,
    message_id: input.messageId ?? null,
    part_key: input.partKey ?? null,
    drive_source_file_id: input.driveSourceFileId ?? null,
    email_subject: input.emailSubject ? input.emailSubject.slice(0, 500) : null,
    email_from: input.emailFrom ? input.emailFrom.slice(0, 300) : null,
    email_date: input.emailDate ?? null,
    filename,
    mime_type: input.mimeType,
    size_bytes: bytes.length,
    sha256: sha,
    storage_bucket: DOCUMENTS_BUCKET,
    storage_path: path,
    doc_type: result.doc_type,
    supplier: result.supplier,
    amount: result.amount,
    currency: result.currency,
    vat_amount: result.vat_amount,
    doc_date: result.doc_date,
    due_date: result.due_date,
    expiry_date: result.expiry_date,
    renewal_date: result.renewal_date,
    summary: result.summary,
    confidence: result.confidence,
    classification_model: model,
    quota_limit_at_insert: input.quotaLimit ?? null,
  };

  const { data: inserted, error } = await admin
    .from('documents')
    .insert(row)
    .select('id, doc_type, doc_date, supplier, filename, mime_type, created_at')
    .single();

  if (error) {
    if (isQuotaExceededError(error)) {
      // The monthly cap was reached by another run between our checks
      // and this insert. Drop the object unless a row already owns it.
      const { data: owner } = await admin
        .from('documents')
        .select('id')
        .eq('user_id', input.userId)
        .eq('sha256', sha)
        .maybeSingle();
      if (!owner) await admin.storage.from(DOCUMENTS_BUCKET).remove([path]);
      return { status: 'quota' };
    }
    if ((error as { code?: string }).code === '23505') {
      // Lost a race with a parallel run. If no row owns our object path,
      // remove the object so storage never holds an orphan.
      const { data: owner } = await admin
        .from('documents')
        .select('id')
        .eq('user_id', input.userId)
        .eq('sha256', sha)
        .maybeSingle();
      if (!owner) await admin.storage.from(DOCUMENTS_BUCKET).remove([path]);
      return { status: 'duplicate', existingId: owner?.id ?? '' };
    }
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]);
    return { status: 'error', message: error.message };
  }

  return { status: 'saved', doc: inserted as StoredDocument, classification: result };
}

/** True for the error raised by the documents_monthly_cap trigger. */
export function isQuotaExceededError(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.message || '').includes('document_quota_exceeded');
}

/**
 * Short-lived signed URL for one stored object. The download name is
 * reduced to ASCII: Supabase Storage puts it into a Content-Disposition
 * header, which cannot carry characters outside Latin-1.
 */
export async function signedDocumentUrl(
  admin: Admin,
  path: string,
  opts: { expiresIn?: number; downloadName?: string | null } = {},
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, opts.expiresIn ?? 120, opts.downloadName ? { download: asciiFilename(opts.downloadName, 'document') } : undefined);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
