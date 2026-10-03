// POST /api/documents/drive/import: import files the user picked in
// Google Picker. Body: { fileIds: string[] }.
//
// Each file is downloaded with the user's own drive.file token (Google
// Docs, Sheets and Slides exported to PDF), then deduped, classified and
// stored exactly like an email document. Free: one file per request and
// the monthly document cap; paid plans: up to DRIVE_IMPORT_HARD_CAP.
// Files that came FROM Drive are not filed back into Drive.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { UPGRADE_COPY, documentQuota, getDocumentEntitlements } from '@/lib/documents/plan';
import { DriveError, downloadDriveFile, getDriveAccess } from '@/lib/documents/drive';
import { isAllowedDocumentMime, mimeFor } from '@/lib/documents/attachments';
import { classifyDocument } from '@/lib/documents/classify';
import { storeDocument } from '@/lib/documents/store';

export const runtime = 'nodejs';
export const maxDuration = 120;

const FILE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();

  const body = (await req.json().catch(() => ({}))) as { fileIds?: unknown };
  const ids = Array.isArray(body.fileIds) ? Array.from(new Set(body.fileIds.filter((v): v is string => typeof v === 'string' && FILE_ID_RE.test(v)))) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Pick at least one file.' }, { status: 400 });

  const ent = await getDocumentEntitlements(user.id);
  if (ids.length > ent.driveImportMaxFiles) {
    return NextResponse.json(
      {
        error: ent.tier === 'free' ? UPGRADE_COPY.driveImportOne : `You can import up to ${ent.driveImportMaxFiles} files at a time.`,
        upgradeRequired: ent.tier === 'free',
        minimumPlan: 'essential',
        maxFiles: ent.driveImportMaxFiles,
      },
      { status: ent.tier === 'free' ? 403 : 400 },
    );
  }

  const quota = await documentQuota(admin, user.id, ent);
  if (quota.remaining !== null && quota.remaining <= 0) {
    return NextResponse.json(
      { error: UPGRADE_COPY.quota(quota.limit ?? 0), upgradeRequired: true, minimumPlan: 'essential', quota },
      { status: 403 },
    );
  }

  const access = await getDriveAccess(admin, user.id);
  if (!access.ok) {
    return NextResponse.json({ error: 'Connect Google Drive first.', needsDrive: true, connectUrl: '/api/auth/google-drive' }, { status: 400 });
  }
  const token = access.access.accessToken;

  let remaining = quota.remaining;
  const results: Array<{ fileId: string; status: 'saved' | 'duplicate' | 'skipped' | 'error'; documentId?: string; message?: string }> = [];

  for (const fileId of ids) {
    if (remaining !== null && remaining <= 0) {
      results.push({ fileId, status: 'skipped', message: UPGRADE_COPY.quota(quota.limit ?? 0) });
      continue;
    }
    try {
      const file = await downloadDriveFile(token, fileId);
      const mime = mimeFor(file.filename, file.mimeType);
      if (!isAllowedDocumentMime(mime)) {
        results.push({ fileId, status: 'skipped', message: 'That type of file cannot be stored in the vault. PDFs, photos and Office files work best.' });
        continue;
      }
      const outcome = await storeDocument(admin, {
        userId: user.id,
        source: 'drive',
        provider: 'google_drive',
        driveSourceFileId: fileId,
        filename: file.filename,
        mimeType: mime,
        bytes: file.bytes,
        allowReviveDeleted: true,
        classify: async () => {
          const r = await classifyDocument(
            { mode: 'drive', filename: file.filename, mimeType: mime },
            { userId: user.id, endpoint: '/api/documents/drive/import' },
          );
          return { result: r.result, model: r.model };
        },
      });
      if (outcome.status === 'saved') {
        if (remaining !== null) remaining--;
        results.push({ fileId, status: 'saved', documentId: outcome.doc.id });
      } else if (outcome.status === 'duplicate') {
        results.push({ fileId, status: 'duplicate', documentId: outcome.existingId, message: 'Already in your vault.' });
      } else if (outcome.status === 'skipped') {
        results.push({ fileId, status: 'skipped', message: outcome.reason === 'too_large' ? 'That file is larger than 15 MB.' : 'That file is empty.' });
      } else {
        results.push({ fileId, status: 'error', message: 'We could not save that file. Please try again.' });
      }
    } catch (err) {
      const status = err instanceof DriveError ? err.status : 0;
      const message =
        status === 413
          ? 'That file is larger than 15 MB.'
          : status === 404 || status === 403
            ? 'We do not have access to that file. Please pick it again.'
            : status === 415
              ? 'That type of Google file cannot be imported.'
              : 'Google Drive did not return that file. Please try again.';
      console.warn('[documents.drive-import] failed:', err instanceof Error ? err.message : err);
      results.push({ fileId, status: 'error', message });
    }
  }

  return NextResponse.json({
    saved: results.filter((r) => r.status === 'saved').length,
    results,
    quota: await documentQuota(admin, user.id, ent),
  });
}
