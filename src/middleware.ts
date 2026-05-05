import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Server-side auth guard for dashboard routes.
 *
 * Prevents the flash-of-dashboard that happens when auth is only checked
 * client-side in a 'use client' layout. Redirects unauthenticated requests
 * to /auth/login before the route handler ever runs.
 *
 * B2B API key portal (/dashboard/api-keys) is excluded — it uses its own
 * passwordless magic-link auth (b2b_portal_tokens) and never creates a
 * Supabase user session.
 */

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const { pathname } = request.nextUrl

  // B2B API key portal uses its own passwordless auth — skip Supabase check
  if (pathname.startsWith('/dashboard/api-keys')) {
    return response
  }

  // Dashboard routes require Supabase auth
  if (pathname.startsWith('/dashboard')) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value)
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const redirectUrl = new URL('/auth/login', request.url)
      redirectUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(redirectUrl)
    }
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
