/**
 * Ombudsman escalation pack — generate and read.
 *
 *   GET  /api/disputes/[id]/escalation-pack
 *        Returns the generated pack if one exists, plus the entitlement
 *        state so the UI knows whether to show "Open pack", "Generate" or
 *        "Buy for £14.99".
 *
 *   POST /api/disputes/[id]/escalation-pack
 *        Generates the pack. Requires either Dispute Pro (packs included)
 *        or an active `dispute_entitlements` row from a £14.99 one-off
 *        purchase. Free and Essential users can hold that entitlement —
 *        that is the entire point of the one-off product.
 *
 * Side effect worth knowing about: this route backfills
 * `disputes.fca_8_week_deadline`, a column created by migration
 * 20260501100000 that no code path has ever written. Rule 4 of the Dispute
 * Agent state machine (escalate when the eight-week clock expires) reads
 * it and could therefore never fire. Generating a pack now populates it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getEffectiveTier } from '@/lib/plan-limits';
import { checkEscalationPackAccess, redeemEntitlement } from '@/lib/escalation-pack/entitlements';
import { buildEscalationPack } from '@/lib/escalation-pack/build';
import { resolveOmbudsman } from '@/lib/escalation-pack/ombudsman';
import { ESCALATION_PACK_PRICE_GBP } from '@/lib/tier-rank';
import { captureServer } from '@/lib/posthog-server';

export const runtime = 'nodejs';
// Letter generation runs the full complaint engine including the
// citation-guarantee retry pass, so allow the same budget the other
// letter routes use.
export const maxDuration = 300;

/**
 * The Supabase client cannot infer a row shape from a `select()` built
 * from a const string, so it widens to `GenericStringError`. `disputes`
 * has ~50 additive columns across a dozen migrations and no generated
 * type, so a loose record is the honest representation here.
 */
type DisputeRow = Record<string, unknown>;

const DISPUTE_COLUMNS =
  'id, user_id, provider_name, provider_type, account_number, issue_type, issue_summary, ' +
  'desired_outcome, disputed_amount, status, created_at, first_letter_sent_at, ' +
  'fca_8_week_deadline, reminder_count, dispute_type, merchant_industry, transaction_date';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RLS scopes this to the owner.
  const { data: disputeData } = await supabase
    .from('disputes')
    .select(DISPUTE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  const dispute = disputeData as unknown as DisputeRow | null;
  if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });

  const tier = await getEffectiveTier(user.id);
  const access = await checkEscalationPackAccess(supabase, user.id, id, tier);

  const { data: pack } = await supabase
    .from('escalation_packs')
    .select('*')
    .eq('dispute_id', id)
    .maybeSingle();

  // Always show the routing, even without an entitlement — knowing WHICH
  // ombudsman covers your dispute is a reason to buy, not a thing to
  // withhold. What is paywalled is the drafted letter and the bundle.
  const routing = resolveOmbudsman({
    issueType: dispute.issue_type as string,
    disputeType: dispute.dispute_type as string,
    merchantIndustry: dispute.merchant_industry as string,
    providerType: dispute.provider_type as string,
    providerName: dispute.provider_name as string,
    issueSummary: dispute.issue_summary as string,
  });

  return NextResponse.json({
    dispute_id: id,
    tier,
    entitlement: {
      allowed: access.allowed,
      via: access.via,
      reason: access.reason,
      price_gbp: ESCALATION_PACK_PRICE_GBP,
    },
    routing: {
      sector_key: routing.sectorKey,
      sector_label: routing.sectorLabel,
      has_ombudsman: routing.hasOmbudsman,
      body_name: routing.route.name,
      body_url: routing.route.url,
      eligibility: routing.route.eligibility,
      time_limit: routing.route.timeLimit,
      cost: routing.route.cost,
      binding: routing.route.binding,
      sector_deadlines: routing.deadlines,
    },
    pack: pack ?? null,
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: disputeData } = await supabase
    .from('disputes')
    .select(DISPUTE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  const dispute = disputeData as unknown as DisputeRow | null;
  if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });

  const tier = await getEffectiveTier(user.id);
  const access = await checkEscalationPackAccess(supabase, user.id, id, tier);

  if (!access.allowed) {
    return NextResponse.json(
      {
        error: 'An Ombudsman escalation pack is required for this dispute.',
        requiresPurchase: true,
        price_gbp: ESCALATION_PACK_PRICE_GBP,
        checkoutUrl: `/api/disputes/${id}/escalation-pack/checkout`,
        upgradeUrl: '/upgrade?plan=dispute_pro&cycle=monthly',
      },
      { status: 402 },
    );
  }

  // Already generated? Return it rather than burning a second Claude call
  // (and, for a one-off buyer, rather than consuming a second entitlement).
  const { data: existing } = await supabase
    .from('escalation_packs')
    .select('*')
    .eq('dispute_id', id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ pack: existing, regenerated: false });
  }

  let built;
  try {
    built = await buildEscalationPack(supabase, dispute, user.id);
  } catch (e) {
    console.error('[escalation-pack] build failed:', e);
    return NextResponse.json(
      { error: 'Could not generate the escalation pack. Your entitlement has not been used — please try again.' },
      { status: 500 },
    );
  }

  const db = admin();

  const { data: saved, error: saveError } = await db
    .from('escalation_packs')
    .insert({
      user_id: user.id,
      dispute_id: id,
      entitlement_id: access.entitlement?.id ?? null,
      sector_key: built.sectorKey,
      ombudsman_name: built.routing.route.name,
      ombudsman_url: built.routing.route.url,
      ombudsman_eligibility: built.routing.route.eligibility,
      ombudsman_time_limit: built.routing.route.timeLimit,
      ombudsman_cost: built.routing.route.cost,
      ombudsman_binding: built.routing.route.binding,
      escalation_letter: built.escalationLetter,
      legal_references: built.legalReferences,
      next_steps: built.nextSteps,
      evidence_pack: built.evidencePack,
      evidence_item_count: built.evidencePack.length,
      eligible_from: built.eligibleFrom,
      referral_deadline: built.actByReminder,
      model: built.model,
    })
    .select('*')
    .single();

  if (saveError) {
    console.error('[escalation-pack] save failed:', saveError.message);
    return NextResponse.json({ error: 'Could not save the escalation pack.' }, { status: 500 });
  }

  // Consume the entitlement ONLY after a successful save, so a failed
  // generation never costs the user their £14.99. Tier-included access
  // (Dispute Pro) has no entitlement row to burn.
  if (access.via === 'entitlement' && access.entitlement) {
    await redeemEntitlement(db, access.entitlement.id, id);
  }

  // Backfill the eight-week clock if it was never set. Additive — we do
  // not overwrite a value someone else has already written.
  if (!dispute.fca_8_week_deadline && built.eligibleFrom) {
    await db
      .from('disputes')
      .update({ fca_8_week_deadline: built.eligibleFrom, updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('fca_8_week_deadline', null);
  }

  captureServer('escalation_pack_generated', user.id, {
    dispute_id: id,
    tier,
    via: access.via,
    sector: built.sectorKey ?? 'unmatched',
    has_ombudsman: built.routing.hasOmbudsman,
    evidence_items: built.evidencePack.length,
  });

  return NextResponse.json({ pack: saved, regenerated: false });
}
