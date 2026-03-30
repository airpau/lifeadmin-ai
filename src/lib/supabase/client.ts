import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Fall back to empty placeholder strings so that Next.js build-time SSR of
  // 'use client' components doesn't throw "URL and API key are required".
  // Real values are always present at runtime in deployed environments.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  );
}
