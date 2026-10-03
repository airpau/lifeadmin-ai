/**
 * Google Drive for the documents vault, drive.file scope only.
 *
 *  - Import: download files the user picked in Google Picker (the Picker
 *    grants this app drive.file access to exactly those files). Google
 *    Docs, Sheets and Slides are exported to PDF.
 *  - Pro filing: create or find a "Paybacker" folder, then Type/Year
 *    subfolders (ensure-folder pattern ported from MailHub's
 *    driveOrganise.ts), and upload a copy of each document (resumable
 *    upload ported from MailHub's mailToDrive.ts).
 *
 * Token source, in order:
 *  1. drive_connections (this feature's own connect flow, tokens
 *     encrypted with stage one's token-crypto)
 *  2. google_sheets_connections (Pro users who already connected Sheets
 *     hold drive.file for the same Google OAuth client). Its tokens are
 *     read with decryptToken, which passes plain text through, and are
 *     NEVER written back from here: the Sheets export reads that row as
 *     plain text, so writing an encrypted token would break it.
 *
 * Every Google call uses fetchWithRetry. No restricted scope is used.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchWithRetry } from '@/lib/email/fetch-retry';
import { decryptToken, encryptToken, isTokenUnreadable } from '@/lib/email/token-crypto';
import { isPermanentRefreshFailure } from '@/lib/email/oauth-refresh-error';
import { refreshAccessToken } from '@/lib/gmail';
import { DOC_TYPE_LABELS, DOC_TYPE_SINGULAR, MAX_DOCUMENT_BYTES, type DocType } from '@/lib/documents/types';
import { extensionForMime, sanitizeFilename } from '@/lib/documents/attachments';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const PAYBACKER_FOLDER_NAME = 'Paybacker';

/** Google editor formats we export to PDF on import. */
const GOOGLE_EXPORTABLE = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
]);

export class DriveError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DriveError';
  }
}

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

export interface DriveAccess {
  accessToken: string;
  source: 'drive_connection' | 'sheets_connection';
  googleEmail: string | null;
  connectionId: string | null;
  rootFolderId: string | null;
}

export type DriveAccessResult =
  | { ok: true; access: DriveAccess }
  | { ok: false; reason: 'not_connected' | 'needs_reauth' | 'unavailable'; message: string };

/** Which Drive connection (if any) a user has, without refreshing tokens. */
export async function driveConnectionStatus(
  admin: Admin,
  userId: string,
): Promise<{ connected: boolean; source: DriveAccess['source'] | null; needsReauth: boolean; email: string | null }> {
  const { data: own } = await admin
    .from('drive_connections')
    .select('status, google_email')
    .eq('user_id', userId)
    .maybeSingle();
  if (own?.status === 'active') return { connected: true, source: 'drive_connection', needsReauth: false, email: own.google_email ?? null };
  const { data: sheets } = await admin
    .from('google_sheets_connections')
    .select('status, email')
    .eq('user_id', userId)
    .maybeSingle();
  if (sheets && (sheets.status ?? 'active') === 'active') {
    return { connected: true, source: 'sheets_connection', needsReauth: false, email: sheets.email ?? null };
  }
  return { connected: false, source: null, needsReauth: own?.status === 'needs_reauth', email: own?.google_email ?? null };
}

export async function getDriveAccess(admin: Admin, userId: string): Promise<DriveAccessResult> {
  // 1. The vault's own connection
  const { data: own } = await admin
    .from('drive_connections')
    .select('id, google_email, access_token, refresh_token, token_expiry, root_folder_id, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (own && own.status === 'active') {
    if (isTokenUnreadable(own.refresh_token) || isTokenUnreadable(own.access_token)) {
      return { ok: false, reason: 'unavailable', message: 'Stored Drive token could not be decrypted.' };
    }
    const access = decryptToken(own.access_token);
    const refresh = decryptToken(own.refresh_token);
    const expiresAt = own.token_expiry ? new Date(own.token_expiry).getTime() : 0;
    const base = {
      source: 'drive_connection' as const,
      googleEmail: own.google_email ?? null,
      connectionId: own.id as string,
      rootFolderId: own.root_folder_id ?? null,
    };
    if (access && expiresAt - Date.now() > 60_000) return { ok: true, access: { ...base, accessToken: access } };
    if (!refresh) {
      await admin.from('drive_connections').update({ status: 'needs_reauth', last_error: 'No refresh token' }).eq('id', own.id);
      return { ok: false, reason: 'needs_reauth', message: 'Please reconnect Google Drive.' };
    }
    try {
      const r = await refreshAccessToken(refresh);
      await admin
        .from('drive_connections')
        .update({
          access_token: encryptToken(r.access_token),
          token_expiry: new Date(Date.now() + (r.expires_in || 3600) * 1000).toISOString(),
          last_error: null,
        })
        .eq('id', own.id)
        .eq('status', 'active');
      return { ok: true, access: { ...base, accessToken: r.access_token } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Drive token refresh failed';
      if (isPermanentRefreshFailure(err)) {
        await admin
          .from('drive_connections')
          .update({ status: 'needs_reauth', last_error: 'Google Drive access was revoked or expired.' })
          .eq('id', own.id);
        return { ok: false, reason: 'needs_reauth', message: 'Please reconnect Google Drive.' };
      }
      return { ok: false, reason: 'unavailable', message };
    }
  }

  // 2. Fall back to an existing Sheets connection (drive.file, same client)
  const { data: sheets } = await admin
    .from('google_sheets_connections')
    .select('email, access_token, refresh_token, token_expiry, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (sheets && (sheets.status ?? 'active') === 'active') {
    const access = decryptToken(sheets.access_token);
    const refresh = decryptToken(sheets.refresh_token);
    const expiresAt = sheets.token_expiry ? new Date(sheets.token_expiry).getTime() : 0;
    const base = { source: 'sheets_connection' as const, googleEmail: sheets.email ?? null, connectionId: null, rootFolderId: null };
    if (access && expiresAt - Date.now() > 60_000) return { ok: true, access: { ...base, accessToken: access } };
    if (refresh) {
      try {
        // In memory only: see the header comment for why we never write back.
        const r = await refreshAccessToken(refresh);
        return { ok: true, access: { ...base, accessToken: r.access_token } };
      } catch (err) {
        return {
          ok: false,
          reason: isPermanentRefreshFailure(err) ? 'needs_reauth' : 'unavailable',
          message: 'Please reconnect Google Drive.',
        };
      }
    }
  }

  return { ok: false, reason: own?.status === 'needs_reauth' ? 'needs_reauth' : 'not_connected', message: 'Google Drive is not connected.' };
}

// ---------------------------------------------------------------------------
// Drive API
// ---------------------------------------------------------------------------

async function driveFetch(token: string, url: string, init: RequestInit = {}, label = 'drive'): Promise<Response> {
  const res = await fetchWithRetry(
    url,
    { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } },
    { label, timeoutMs: 40_000, maxElapsedMs: 60_000 },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new DriveError(`Drive API ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  return res;
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Find a folder by exact name in a parent, creating it if missing. Never duplicates on a normal run. */
export async function ensureFolder(token: string, name: string, parentId: string): Promise<string> {
  const query = `name = '${q(name)}' and '${q(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const found = (await (
    await driveFetch(token, `${DRIVE}/files?${new URLSearchParams({ q: query, fields: 'files(id,name)', pageSize: '10' })}`, {}, 'drive find folder')
  ).json()) as { files?: Array<{ id: string }> };
  if (found.files && found.files.length > 0) return found.files[0].id;
  const made = (await (
    await driveFetch(
      token,
      `${DRIVE}/files?fields=id`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }) },
      'drive create folder',
    )
  ).json()) as { id: string };
  return made.id;
}

/** The user's "Paybacker" root folder: the cached id if it still exists, else find or create it. */
export async function ensurePaybackerRoot(token: string, cachedId: string | null): Promise<string> {
  if (cachedId) {
    try {
      const meta = (await (
        await driveFetch(token, `${DRIVE}/files/${encodeURIComponent(cachedId)}?fields=id,trashed`, {}, 'drive root check')
      ).json()) as { id: string; trashed?: boolean };
      if (meta.id && !meta.trashed) return meta.id;
    } catch {
      // deleted or no longer visible to this app: recreate below
    }
  }
  return ensureFolder(token, PAYBACKER_FOLDER_NAME, 'root');
}

/** Drive filename in the "YYYY-MM-DD Type, Supplier.ext" house style (en and em dashes removed). */
export function driveFilenameFor(doc: {
  doc_type: DocType;
  doc_date: string | null;
  supplier: string | null;
  filename: string;
  mime_type: string;
  created_at?: string | null;
}): string {
  const date = doc.doc_date || (doc.created_at ? doc.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const supplier = (doc.supplier || '').replace(/[\u2013\u2014]+/g, ' ').replace(/\s+/g, ' ').trim();
  const ext = extensionForMime(doc.mime_type, doc.filename);
  const base = `${date} ${DOC_TYPE_SINGULAR[doc.doc_type] ?? 'Document'}${supplier ? `, ${supplier}` : ''}`;
  return sanitizeFilename(`${base}.${ext}`);
}

/** Resumable upload (works for any size up to the vault cap). */
export async function uploadToDrive(
  token: string,
  name: string,
  folderId: string,
  mime: string,
  bytes: Buffer,
): Promise<{ id: string; webViewLink: string | null }> {
  const start = await driveFetch(
    token,
    `${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime,
        'X-Upload-Content-Length': String(bytes.length),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    },
    'drive upload start',
  );
  const session = start.headers.get('location');
  if (!session) throw new DriveError('Drive did not return an upload session URL.', 502);
  const put = await driveFetch(
    token,
    session,
    { method: 'PUT', headers: { 'Content-Type': mime }, body: new Uint8Array(bytes) },
    'drive upload put',
  );
  const f = (await put.json()) as { id: string; webViewLink?: string };
  return { id: f.id, webViewLink: f.webViewLink ?? null };
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  trashed?: boolean;
}

export async function getDriveFileMeta(token: string, fileId: string): Promise<DriveFileMeta> {
  return (await (
    await driveFetch(token, `${DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,trashed`, {}, 'drive meta')
  ).json()) as DriveFileMeta;
}

/**
 * Download a picked file. Google editor files are exported to PDF;
 * other Google types (folders, forms, shortcuts) are refused.
 */
export async function downloadDriveFile(
  token: string,
  fileId: string,
): Promise<{ bytes: Buffer; mimeType: string; filename: string }> {
  const meta = await getDriveFileMeta(token, fileId);
  if (meta.trashed) throw new DriveError('That file is in the Drive bin.', 410);
  if (GOOGLE_EXPORTABLE.has(meta.mimeType)) {
    const res = await driveFetch(
      token,
      `${DRIVE}/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
      {},
      'drive export',
    );
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_DOCUMENT_BYTES) throw new DriveError('That file is larger than 15 MB.', 413);
    return { bytes, mimeType: 'application/pdf', filename: sanitizeFilename(`${meta.name}.pdf`) };
  }
  if (meta.mimeType.startsWith('application/vnd.google-apps.')) {
    throw new DriveError('That type of Google file cannot be imported.', 415);
  }
  if (meta.size && Number(meta.size) > MAX_DOCUMENT_BYTES) throw new DriveError('That file is larger than 15 MB.', 413);
  const res = await driveFetch(token, `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`, {}, 'drive download');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new DriveError('That file is larger than 15 MB.', 413);
  return { bytes, mimeType: meta.mimeType, filename: sanitizeFilename(meta.name) };
}

// ---------------------------------------------------------------------------
// Pro filing
// ---------------------------------------------------------------------------

/**
 * Per-run filing context for one user: resolves Drive access once,
 * caches folder ids, and remembers a failure so a broken connection is
 * not retried for every document in the batch.
 */
export class DriveFilingContext {
  private access: DriveAccess | null = null;
  private failed: string | null = null;
  private rootId: string | null = null;
  private folders = new Map<string, string>();

  constructor(private readonly admin: Admin, private readonly userId: string) {}

  private async resolve(): Promise<DriveAccess | null> {
    if (this.access || this.failed) return this.access;
    const r = await getDriveAccess(this.admin, this.userId);
    if (!r.ok) {
      this.failed = r.reason === 'not_connected' ? 'not_connected' : r.message;
      return null;
    }
    this.access = r.access;
    return this.access;
  }

  private async folderFor(docType: DocType, year: string): Promise<string> {
    const a = this.access!;
    if (!this.rootId) {
      this.rootId = await ensurePaybackerRoot(a.accessToken, a.rootFolderId);
      if (a.source === 'drive_connection' && a.connectionId && this.rootId !== a.rootFolderId) {
        await this.admin.from('drive_connections').update({ root_folder_id: this.rootId }).eq('id', a.connectionId);
      }
    }
    const key = `${docType}/${year}`;
    const cached = this.folders.get(key);
    if (cached) return cached;
    const typeFolder = await ensureFolder(a.accessToken, DOC_TYPE_LABELS[docType] ?? 'Other', this.rootId);
    const yearFolder = await ensureFolder(a.accessToken, year, typeFolder);
    this.folders.set(key, yearFolder);
    return yearFolder;
  }

  /**
   * Upload one stored document and record the result on its row.
   * Never throws: failures are written to documents.drive_error.
   * Returns 'not_connected' quietly when the user has no Drive.
   */
  async file(doc: {
    id: string;
    doc_type: DocType;
    doc_date: string | null;
    supplier: string | null;
    filename: string;
    mime_type: string;
    created_at?: string | null;
    bytes: Buffer;
  }): Promise<'filed' | 'not_connected' | 'failed'> {
    try {
      const access = await this.resolve();
      if (!access) {
        if (this.failed === 'not_connected') return 'not_connected';
        await this.admin.from('documents').update({ drive_error: (this.failed || 'Drive unavailable').slice(0, 300) }).eq('id', doc.id);
        return 'failed';
      }
      const year = (doc.doc_date || doc.created_at || new Date().toISOString()).slice(0, 4);
      const folderId = await this.folderFor(doc.doc_type, year);
      const name = driveFilenameFor(doc);
      const up = await uploadToDrive(access.accessToken, name, folderId, doc.mime_type, doc.bytes);
      await this.admin
        .from('documents')
        .update({ drive_file_id: up.id, drive_link: up.webViewLink, drive_filed_at: new Date().toISOString(), drive_error: null })
        .eq('id', doc.id);
      return 'filed';
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Drive filing failed';
      console.warn(`[documents.drive] filing ${doc.id} failed:`, message);
      try {
        await this.admin.from('documents').update({ drive_error: message.slice(0, 300) }).eq('id', doc.id);
      } catch {
        // bookkeeping only
      }
      return 'failed';
    }
  }
}
