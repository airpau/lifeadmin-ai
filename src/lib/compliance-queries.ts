/**
 * Shared compliance-queue queries (PR ζ).
 *
 * Every cross-PR table read is wrapped in try/catch so this module
 * gracefully no-ops if a sibling PR (γ/δ/ε) hasn't merged yet:
 *   - legal_ref_corrections (ε)
 *   - legal_ref_candidates  (δ)
 *   - legal_ref_verifications (γ)
 *   - legal_ref_usages       (γ)
 *
 * Returning null (not throwing) is the contract — callers branch on
 * presence rather than catching.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export interface PendingCorrectionRow {
  id: string;
  ref_id: string | null;
  proposed_change: unknown;
  before_value: string | null;
  after_value: string | null;
  status: string | null;
  created_at: string;
  enrichment_data?: unknown;
}

export interface PendingCandidateRow {
  id: string;
  category: string | null;
  proposed_law: string | null;
  source_url: string | null;
  status: string | null;
  created_at: string;
  enrichment_data?: unknown;
}

export interface StaleRefRow {
  id: string;
  law_name: string;
  section: string | null;
  category: string | null;
  verification_status: string | null;
  last_verified: string | null;
  source_url: string | null;
}

export async function safeCount(supabase: Supa, table: string, filter?: (q: any) => any): Promise<number | null> {
  try {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    if (filter) query = filter(query);
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function pendingCorrectionsCount(supabase: Supa): Promise<number | null> {
  return safeCount(supabase, 'legal_ref_corrections', (q) => q.eq('status', 'pending'));
}

export async function pendingCandidatesCount(supabase: Supa): Promise<number | null> {
  return safeCount(supabase, 'legal_ref_candidates', (q) => q.eq('status', 'pending'));
}

export async function staleRefsCount(supabase: Supa): Promise<number | null> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('legal_references')
      .select('id', { count: 'exact', head: true })
      .or(`last_verified.lt.${cutoff},last_verified.is.null`);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function brokenRefsCount(supabase: Supa): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('legal_references')
      .select('id', { count: 'exact', head: true })
      .in('verification_status', ['broken', 'stale', 'error', 'url_dead', 'needs_review']);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function topPendingCorrections(supabase: Supa, limit = 5): Promise<PendingCorrectionRow[] | null> {
  try {
    const { data, error } = await supabase
      .from('legal_ref_corrections')
      .select('id, ref_id, proposed_change, before_value, after_value, status, created_at, enrichment_data')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) return null;
    return (data || []) as PendingCorrectionRow[];
  } catch {
    return null;
  }
}

export async function topStaleRefsCitedRecently(
  supabase: Supa,
  limit = 5,
): Promise<Array<StaleRefRow & { uses_30d: number }> | null> {
  try {
    // Pull stale refs first
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: refs, error } = await supabase
      .from('legal_references')
      .select('id, law_name, section, category, verification_status, last_verified, source_url')
      .or(
        `verification_status.in.(broken,stale,error,url_dead,needs_review),last_verified.lt.${cutoff}`,
      )
      .limit(50);
    if (error || !refs) return null;

    // Cross-ref usages in last 30 days
    const usageCounts: Record<string, number> = {};
    try {
      const { data: usages } = await supabase
        .from('legal_ref_usages')
        .select('ref_id')
        .gte('used_at', cutoff);
      if (usages) {
        for (const u of usages) {
          const id = (u as { ref_id: string }).ref_id;
          if (id) usageCounts[id] = (usageCounts[id] || 0) + 1;
        }
      }
    } catch {
      // legal_ref_usages doesn't exist yet — fall through with zero counts
    }

    const enriched = (refs as StaleRefRow[]).map((r) => ({
      ...r,
      uses_30d: usageCounts[r.id] || 0,
    }));
    enriched.sort((a, b) => b.uses_30d - a.uses_30d);
    return enriched.slice(0, limit);
  } catch {
    return null;
  }
}

export async function recentUsageCountForRef(
  supabase: Supa,
  refId: string,
  days = 7,
): Promise<number | null> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('legal_ref_usages')
      .select('id', { count: 'exact', head: true })
      .eq('ref_id', refId)
      .gte('used_at', cutoff);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function correctionCountForRef(supabase: Supa, refId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('legal_ref_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('ref_id', refId);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}
