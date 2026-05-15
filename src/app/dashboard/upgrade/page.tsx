import { redirect } from 'next/navigation';

// Canonical upgrade destination is the public pricing page.
// This route exists so internal links can use /dashboard/upgrade without
// knowing the exact pricing URL — change the redirect target here if it moves.
//
// B2B API customers (portal-token context) are sent to /for-business#buy
// so they don't land on consumer £4.99/£9.99 pricing.
export default function UpgradePage() {
  redirect('/pricing');
}
