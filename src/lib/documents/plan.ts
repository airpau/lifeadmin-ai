/**
 * Plan gating for the documents vault.
 *
 * Every documents route and the filing pipeline go through these
 * helpers, which read the new PlanLimits fields (documentsPerMonth,
 * autoDocumentFiling, documentReminders, driveDocumentFiling,
 * accountantRegister, driveImportMaxFiles). Tier resolution is
 * getEffectiveTier, so an onboarding trial and Household seats get what
 * they are entitled to, and no gate is ever written as tier === 'pro'.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PLAN_LIMITS, getEffectiveTier, type PlanLimits } from '@/lib/plan-limits';
import type { PlanTier } from '@/lib/tier-rank';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/** Server safety cap on files per Drive import request, for every plan. */
export const DRIVE_IMPORT_HARD_CAP = 10;

export interface DocumentEntitlements {
  tier: PlanTier;
  documentsPerMonth: number | null;
  autoDocumentFiling: boolean;
  documentReminders: boolean;
  driveDocumentFiling: boolean;
  accountantRegister: boolean;
  /** Effective per-request Drive import cap (never above DRIVE_IMPORT_HARD_CAP). */
  driveImportMaxFiles: number;
  /** Pack builds a calendar month. null = unlimited. Previews are free on every plan. */
  packBuildsPerMonth: number | null;
  priceRiseWatch: boolean;
  warrantyReminders: boolean;
  documentDigest: boolean;
  packSharing: boolean;
}

export function limitsFor(tier: PlanTier | string | null | undefined): PlanLimits {
  return PLAN_LIMITS[(tier as PlanTier) ?? 'free'] ?? PLAN_LIMITS.free;
}

/** Pure: entitlements for a tier. Unknown tiers get Free. */
export function documentEntitlements(tier: PlanTier | string | null | undefined): DocumentEntitlements {
  const known = (tier && Object.prototype.hasOwnProperty.call(PLAN_LIMITS, tier) ? tier : 'free') as PlanTier;
  const l = PLAN_LIMITS[known];
  return {
    tier: known,
    documentsPerMonth: l.documentsPerMonth,
    autoDocumentFiling: l.autoDocumentFiling,
    documentReminders: l.documentReminders,
    driveDocumentFiling: l.driveDocumentFiling,
    accountantRegister: l.accountantRegister,
    driveImportMaxFiles: Math.min(l.driveImportMaxFiles ?? DRIVE_IMPORT_HARD_CAP, DRIVE_IMPORT_HARD_CAP),
    packBuildsPerMonth: l.packBuildsPerMonth,
    priceRiseWatch: l.priceRiseWatch,
    warrantyReminders: l.warrantyReminders,
    documentDigest: l.documentDigest,
    packSharing: l.packSharing,
  };
}

/** Pure: first instant of the current calendar month, UTC. */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Pure: remaining saves this month. null = unlimited. Never negative. */
export function remainingDocumentQuota(limit: number | null, usedThisMonth: number): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - Math.max(0, usedThisMonth));
}

/**
 * Documents saved this calendar month (UTC), INCLUDING ones since
 * deleted, so delete and re-find cannot be used to go round the cap.
 */
export async function countDocumentsThisMonth(admin: Admin, userId: string, now: Date = new Date()): Promise<number> {
  const { count, error } = await admin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', monthStartUtc(now).toISOString());
  if (error) {
    // Fail closed for the cap: if we cannot count, assume the cap is used.
    console.error('[documents.plan] count failed:', error.message);
    return Number.MAX_SAFE_INTEGER;
  }
  return count ?? 0;
}

export interface DocumentQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
}

export async function documentQuota(admin: Admin, userId: string, ent: DocumentEntitlements): Promise<DocumentQuota> {
  if (ent.documentsPerMonth === null) return { limit: null, used: 0, remaining: null };
  const used = await countDocumentsThisMonth(admin, userId);
  return {
    limit: ent.documentsPerMonth,
    used: used === Number.MAX_SAFE_INTEGER ? ent.documentsPerMonth : used,
    remaining: remainingDocumentQuota(ent.documentsPerMonth, used),
  };
}

/** Resolve a user's documents entitlements (trial and Household aware). */
export async function getDocumentEntitlements(userId: string): Promise<DocumentEntitlements> {
  const tier = await getEffectiveTier(userId);
  return documentEntitlements(tier);
}

/** Consumer-voice upgrade messages for gated features. */
export const UPGRADE_COPY = {
  reminders: 'Reminders before renewals and due dates come with Essential. Upgrade from £4.99 a month and never get caught out by an auto-renewal again.',
  autoFiling: 'Automatic daily filing comes with Essential. Upgrade and we will file new receipts and bills for you every day.',
  driveFiling: 'Filing a copy into your own Google Drive comes with Pro.',
  register: 'The accountant register and share links come with Pro.',
  quota: (limit: number) =>
    `You have saved ${limit} documents this month, which is the Free plan limit. Upgrade to Essential for unlimited documents and automatic filing.`,
  driveImportOne: 'On the Free plan you can import one file from Google Drive at a time. Upgrade to import several at once.',
  packBuilds: (limit: number) =>
    `You have built ${limit === 1 ? 'your free pack' : `${limit} packs`} this month. Upgrade to Essential to build as many packs as you need. You can still check what any pack would contain.`,
  priceRiseWatch: 'Price-rise watch comes with Essential. We compare your bills and renewals year on year and tell you when a supplier puts its price up.',
  warrantyReminders: 'Warranty reminders come with Essential. You can still save and edit warranty dates on any plan.',
  packSharing: 'Sharing a pack by link comes with Pro. You can still download the pack and send it yourself.',
} as const;

// ---------------------------------------------------------------------------
// Document packs: monthly build allowance (Free)
// ---------------------------------------------------------------------------

export interface PackBuildQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
}

/**
 * Pack builds used this calendar month (UTC). A pack counts once a month
 * however many times it is rebuilt, and still counts after it is deleted
 * (counted_build_at is kept on the soft-deleted row). The atomic check is
 * document_pack_claim_build(); this is for display.
 */
export async function packBuildQuota(admin: Admin, userId: string, ent: DocumentEntitlements, now: Date = new Date()): Promise<PackBuildQuota> {
  if (ent.packBuildsPerMonth === null) return { limit: null, used: 0, remaining: null };
  const { count, error } = await admin
    .from('document_packs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('counted_build_at', monthStartUtc(now).toISOString());
  const used = error ? ent.packBuildsPerMonth : count ?? 0;
  return { limit: ent.packBuildsPerMonth, used, remaining: Math.max(0, ent.packBuildsPerMonth - used) };
}
