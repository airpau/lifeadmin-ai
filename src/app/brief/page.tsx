// src/app/brief/page.tsx
// Vanity URL: paybacker.co.uk/brief → the focused daily brief page.
// Keeps the public link short and professional in WhatsApp/Telegram summaries
// (instead of exposing the deep /dashboard/brief path). Auth is enforced by the
// dashboard route it redirects to.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function BriefVanityRedirect() {
  redirect('/dashboard/brief');
}
