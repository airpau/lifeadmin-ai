/**
 * Build a document pack: download the selected files from the private
 * `documents` bucket, draw the index PDF, zip everything and store the
 * ZIP at <user_id>/packs/<pack_id>/<name>.zip in the same bucket.
 *
 * Limits, for Vercel's 300 second functions:
 *  - MAX_PACK_BYTES (95 MB) of source files per pack, checked from the
 *    stored sizes before anything is downloaded and again as files
 *    arrive, so the ZIP with its index and CSV stays under the bucket's
 *    100 MB object limit (checked again on the finished ZIP)
 *  - a deadline passed by the route (about 240 seconds), checked before
 *    every download and before zipping, so a slow build fails cleanly
 *    with a message instead of being killed mid-upload
 *  - downloads run four at a time
 *
 * Files are stored in the ZIP without compression (PDFs, images and
 * Office files are already compressed); only text files are deflated.
 * Peak memory is about twice the pack size, well inside a function's
 * memory.
 */

import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENTS_BUCKET, DOC_TYPE_SINGULAR } from '@/lib/documents/types';
import { buildRegisterCsv } from '@/lib/documents/register';
import { MAX_DOCUMENT_BYTES } from '@/lib/documents/types';
import { asciiFilename } from '@/lib/documents/content-disposition';
import {
  attachmentFileName,
  cleanNamePart,
  correspondenceObjectPath,
  disputeAttachmentPlan,
  longDate,
  money,
  packDate,
  packFileName,
  seqLabel,
  uniqueNames,
} from '@/lib/documents/packs/common';
import { renderPackIndexPdf, type IndexExhibit, type IndexFileRow } from '@/lib/documents/packs/index-pdf';
import type { PackPreview } from '@/lib/documents/packs/load';
import type { AnyPackDefinition, PackDocument } from '@/lib/documents/packs/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/**
 * Most source bytes one pack may hold: 95 MB, so the ZIP plus the index
 * PDF and the CSV stays under the bucket's 100 MB object limit.
 */
export const MAX_PACK_BYTES = 95 * 1024 * 1024;
/** The documents bucket's object limit (migration 20261003130000). */
export const MAX_PACK_ZIP_BYTES = 100 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 4;
const CORRESPONDENCE_BUCKET = 'correspondence-files';

export class PackBuildError extends Error {
  constructor(message: string, readonly userMessage: string) {
    super(message);
  }
}

/** Re-exported for callers and tests that know it from here. */
export { correspondenceObjectPath };

/** File name for the ZIP itself: ASCII, no spaces at the ends. */
export function packZipName(title: string): string {
  const base = asciiFilename(cleanNamePart(title, 80), 'Paybacker pack').replace(/[^A-Za-z0-9 ,()_'-]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${base || 'Paybacker pack'}.zip`;
}

const TEXT_TYPES = /^(text\/|application\/(json|xml|csv))/;

interface BundleFile {
  name: string;
  bytes: Buffer;
  mime: string;
}

async function downloadObject(admin: Admin, bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

export interface BuiltPack {
  storagePath: string;
  sizeBytes: number;
  fileCount: number;
  zipName: string;
  /** Documents that could not be downloaded (left out, noted in the index). */
  skipped: number;
}

export async function buildPackBundle(
  admin: Admin,
  args: {
    userId: string;
    packId: string;
    title: string;
    def: AnyPackDefinition;
    preview: PackPreview;
    deadlineAt: number;
    previousPath?: string | null;
    now?: Date;
  },
): Promise<BuiltPack> {
  const { userId, packId, def, preview, deadlineAt } = args;
  const selected = preview.selection.selected;
  const dispute = preview.ctx.dispute ?? null;

  if (preview.bytes > MAX_PACK_BYTES) {
    throw new PackBuildError('pack too large', `This pack would be ${Math.ceil(preview.bytes / 1048576)} MB, over the ${MAX_PACK_BYTES / 1048576} MB limit. Remove some documents and try again.`);
  }

  // Correspondence attachments: the user's own files on this dispute,
  // never one whose name looks like an identity document.
  const attachments = disputeAttachmentPlan(dispute, userId).included;
  const total = selected.length + attachments.length;

  // Names first, so the index and the ZIP agree.
  const docNames = uniqueNames(selected.map((d, i) => packFileName(i + 1, total, d)));
  const attNames = attachments.map((x, j) =>
    attachmentFileName(selected.length + j + 1, total, x.c.dated ? x.c.dated.slice(0, 10) : null, dispute?.provider_name ?? null, x.a.filename, x.a.type),
  );

  const files: Array<BundleFile | null> = new Array(total).fill(null);
  let running = 0;
  let skipped = 0;
  const checkTime = () => {
    if (Date.now() > deadlineAt) {
      throw new PackBuildError('deadline', 'This pack took too long to build. Try again, or remove some documents to make it smaller.');
    }
  };

  await runLimited(selected, DOWNLOAD_CONCURRENCY, async (d: PackDocument, i) => {
    checkTime();
    const bytes = d.storage_path ? await downloadObject(admin, DOCUMENTS_BUCKET, d.storage_path) : null;
    if (!bytes) {
      skipped++;
      return;
    }
    running += bytes.length;
    if (running > MAX_PACK_BYTES) throw new PackBuildError('pack too large', `This pack is over the ${MAX_PACK_BYTES / 1048576} MB limit. Remove some documents and try again.`);
    files[i] = { name: docNames[i], bytes, mime: d.mime_type };
  });
  await runLimited(attachments, DOWNLOAD_CONCURRENCY, async (x, j) => {
    checkTime();
    const bytes = await downloadObject(admin, CORRESPONDENCE_BUCKET, x.path);
    if (!bytes || bytes.length > MAX_DOCUMENT_BYTES) {
      skipped++;
      return;
    }
    running += bytes.length;
    if (running > MAX_PACK_BYTES) throw new PackBuildError('pack too large', `This pack is over the ${MAX_PACK_BYTES / 1048576} MB limit. Remove some documents and try again.`);
    files[selected.length + j] = { name: attNames[j], bytes, mime: x.a.type || 'application/octet-stream' };
  });
  checkTime();

  // ---- index PDF ----------------------------------------------------------
  const fileRows: IndexFileRow[] = [
    ...selected.map((d, i) => ({
      seq: seqLabel(i + 1, total),
      date: packDate(d),
      type: DOC_TYPE_SINGULAR[d.doc_type] ?? 'Document',
      supplier: d.supplier ?? '',
      amount: money(d.amount, d.currency),
      fileName: docNames[i],
      note: files[i] ? null : 'could not be included',
    })),
    ...attachments.map((x, j) => ({
      seq: seqLabel(selected.length + j + 1, total),
      date: x.c.dated ? x.c.dated.slice(0, 10) : '',
      type: 'Attachment',
      supplier: dispute?.provider_name ?? '',
      amount: '',
      fileName: attNames[j],
      note: files[selected.length + j] ? `with Exhibit ${x.c.seq}` : 'could not be included',
    })),
  ];
  const exhibits: IndexExhibit[] = (dispute?.correspondence ?? []).map((c) => ({
    ref: `Exhibit ${c.seq}`,
    heading: c.title ? `${c.label}: ${c.title}` : c.label,
    dated: c.dated ? longDate(c.dated) : 'Undated',
    body: (c.content || c.summary || '').slice(0, 8000),
  }));
  const notes: string[] = [];
  if (preview.selection.excluded.length) {
    const n = preview.selection.excluded.length;
    notes.push(`${n} file${n === 1 ? ' was' : 's were'} left out because ${n === 1 ? 'it looks' : 'they look'} like an identity document. Identity documents are never put in a pack.`);
  }
  if (preview.selection.truncated) notes.push('This pack holds the first 300 documents only.');
  if (skipped) notes.push(`${skipped} file${skipped === 1 ? '' : 's'} could not be read from storage and ${skipped === 1 ? 'is' : 'are'} not in the ZIP.`);

  const now = args.now ?? new Date();
  const pdf = await renderPackIndexPdf({
    title: args.title,
    packName: def.name,
    audience: def.audience,
    description: preview.description,
    generatedOn: longDate(now.toISOString().slice(0, 10)),
    checklist: preview.checklist,
    summary: def.summary ? def.summary(selected, preview.ctx) : [],
    timeline: preview.timeline,
    files: fileRows,
    exhibits,
    notes,
    footnote: def.footnote ?? null,
  });
  checkTime();

  // ---- ZIP ----------------------------------------------------------------
  const zip = new JSZip();
  zip.file('00 Index.pdf', pdf, { compression: 'STORE' });
  for (const f of files) {
    if (!f) continue;
    zip.file(f.name, f.bytes, TEXT_TYPES.test(f.mime) || /\.html?$/i.test(f.name) ? { compression: 'DEFLATE', compressionOptions: { level: 6 } } : { compression: 'STORE' });
  }
  if (def.includeRegisterCsv) {
    const csv = buildRegisterCsv(selected, (d) => docNames[selected.indexOf(d)] ?? '');
    zip.file('Register.csv', csv, { compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  const zipBytes = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
  checkTime();
  if (zipBytes.length > MAX_PACK_ZIP_BYTES) {
    throw new PackBuildError('zip too large', `This pack came to more than ${MAX_PACK_ZIP_BYTES / 1048576} MB. Remove some documents and try again.`);
  }

  const zipName = packZipName(args.title);
  const storagePath = `${userId}/packs/${packId}/${zipName.replace(/[^A-Za-z0-9._-]+/g, '-')}`;
  const up = await admin.storage.from(DOCUMENTS_BUCKET).upload(storagePath, zipBytes, { contentType: 'application/zip', upsert: true });
  if (up.error) {
    throw new PackBuildError(`upload failed: ${up.error.message}`, 'We could not save the pack. Please try again. If it keeps happening, remove some documents to make it smaller.');
  }
  if (args.previousPath && args.previousPath !== storagePath && args.previousPath.startsWith(`${userId}/packs/`)) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([args.previousPath]);
  }

  return { storagePath, sizeBytes: zipBytes.length, fileCount: files.filter(Boolean).length + 1 + (def.includeRegisterCsv ? 1 : 0), zipName, skipped };
}
