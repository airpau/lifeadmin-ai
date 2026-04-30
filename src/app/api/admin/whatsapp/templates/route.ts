/**
 * GET /api/admin/whatsapp/templates
 *
 * Founder-gated read of registry + whatsapp_template_sids rows for the
 * admin UI panel at /dashboard/admin/whatsapp.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { TEMPLATES, PENDING_RESUBMISSION, type TemplateName } from '@/lib/whatsapp/template-registry';
import { listTemplateSidRows } from '@/lib/whatsapp/template-sids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const rows = await listTemplateSidRows();
  const registry = (Object.keys(TEMPLATES) as TemplateName[]).map((name) => {
    const t = TEMPLATES[name];
    return {
      name,
      fallback_sid: t.sid,
      category: t.category,
      is_pending_resubmission: t.sid === PENDING_RESUBMISSION,
    };
  });

  return NextResponse.json({ rows, registry });
}
