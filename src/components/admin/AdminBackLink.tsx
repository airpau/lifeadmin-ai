import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface AdminBackLinkProps {
  /** Where the back link points. Defaults to /dashboard/admin. */
  href?: string;
  /** Visible label. Defaults to "Back to Admin". */
  label?: string;
  className?: string;
}

/**
 * Consistent back-to-admin link rendered at the top of every admin
 * sub-page. Centralises styling so the founder always has the same
 * affordance instead of relying on browser back.
 */
export default function AdminBackLink({
  href = '/dashboard/admin',
  label = 'Back to Admin',
  className = '',
}: AdminBackLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4 ${className}`}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
