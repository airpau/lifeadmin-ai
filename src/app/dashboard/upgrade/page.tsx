import { redirect } from 'next/navigation';

// Canonical upgrade destination is the public pricing page.
// This route exists so internal links can use /dashboard/upgrade without
// knowing the exact pricing URL — change the redirect target here if it moves.
export default function UpgradePage() {
  redirect('/pricing');
}
