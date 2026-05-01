/**
 * Admin — consumer abandonment nurture dashboard.
 *
 * Founder-gated by the parent /dashboard/admin/layout.tsx.
 */

import ConsumerLeadsClient from './ConsumerLeadsClient';
import AdminBackLink from '@/components/admin/AdminBackLink';

export const dynamic = 'force-dynamic';

export default function ConsumerLeadsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <AdminBackLink />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Consumer abandonment nurture</h1>
      <p className="text-sm text-slate-500 mb-6">
        Captured B2C leads from abandoned Stripe checkouts and pricing-page subscribe clicks. Daily
        cron drips a 4-email sequence (T+1h, T+24h, T+72h, T+7d) and issues a 10% Stripe code on
        email 3.
      </p>
      <ConsumerLeadsClient />
    </div>
  );
}
