/**
 * The pack definitions, one file per pack type. Adding a pack type means
 * a new definition file, an entry here and its name in PACK_TYPES
 * (types.ts). The database does not constrain pack_type, on purpose.
 */

import { disputeEvidencePack } from '@/lib/documents/packs/dispute-evidence';
import { insuranceClaimPack } from '@/lib/documents/packs/insurance-claim';
import { lenderPack } from '@/lib/documents/packs/lender';
import { taxYearPack } from '@/lib/documents/packs/tax-year';
import { PACK_TYPES, isPackType, type AnyPackDefinition, type PackType } from '@/lib/documents/packs/types';

export const PACK_DEFINITIONS: Record<PackType, AnyPackDefinition> = {
  dispute_evidence: disputeEvidencePack,
  lender: lenderPack,
  tax_year: taxYearPack,
  insurance_claim: insuranceClaimPack,
};

export function getPackDefinition(type: unknown): AnyPackDefinition | null {
  return isPackType(type) ? PACK_DEFINITIONS[type] : null;
}

/** Public description of every pack type, for the Packs tab cards. */
export function packTypeSummaries(): Array<{
  type: PackType;
  name: string;
  blurb: string;
  audience: string;
  checklist: Array<{ key: string; label: string; required: boolean }>;
}> {
  return PACK_TYPES.map((t) => {
    const d = PACK_DEFINITIONS[t];
    return {
      type: t,
      name: d.name,
      blurb: d.blurb,
      audience: d.audience,
      checklist: d.checklist.map((c) => ({ key: c.key, label: c.label, required: c.required })),
    };
  });
}
