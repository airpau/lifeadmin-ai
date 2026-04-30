import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Server-side gate for every page under /dashboard/admin/*. Sidebar
// nav already hides admin links for non-admin users, but the URLs
// were directly addressable. This layout redirects non-admins to
// the dashboard root before any admin page renders.
//
// Allowlist source-of-truth is NEXT_PUBLIC_ADMIN_EMAILS (comma-
// separated). Falls back to aireypaul@googlemail.com when unset, to
// match the dashboard sidebar gate and the /api/admin/* gates.

export const dynamic = 'force-dynamic';

function getAdminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email || !getAdminEmails().includes(user.email.toLowerCase())) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
