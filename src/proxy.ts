import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Awin 1st-party cookie tracking — capture ?awc= on every request
  const awc = request.nextUrl.searchParams.get('awc');
  if (awc) {
    supabaseResponse.cookies.set('awc', awc, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
  }

  // UTM + gclid tracking — capture on first landing, persist as cookies for signup attribution
  // Not httpOnly so client-side signup form can read them
  const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gad_campaignid', 'fbclid'];
  for (const param of utmParams) {
    const value = request.nextUrl.searchParams.get(param);
    if (value) {
      supabaseResponse.cookies.set(`pb_${param}`, value, {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isWaitlistMode = process.env.NEXT_PUBLIC_WAITLIST_MODE === 'true';

  // Waitlist mode: redirect signup and unauthenticated dashboard to home
  if (isWaitlistMode) {
    if (request.nextUrl.pathname === '/auth/signup' && !user) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Protect dashboard routes (non-waitlist or fallback)
  if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
    const loginUrl = new URL('/auth/login', request.url);
    const redirectPath = request.nextUrl.pathname + request.nextUrl.search;
    loginUrl.searchParams.set('redirect', redirectPath);
    return NextResponse.redirect(loginUrl);
  }

  // Server-side terms-accepted gate. Any authenticated user without a
  // recorded `terms_accepted_at` in user_metadata gets bounced to
  // /auth/accept-terms before they can reach /dashboard or /onboarding.
  // This is the backstop to the /auth/signup client-side consent
  // checkbox — it catches OAuth signups that bypassed the gate, legacy
  // accounts that pre-date the feature, and anyone who edited DOM to
  // re-enable a disabled button. The accept-terms page auto-drains the
  // sessionStorage consent blob from fresh OAuth signups, so normal
  // signups pass through invisibly.
  const needsTermsGate =
    user &&
    !user.user_metadata?.terms_accepted_at &&
    (request.nextUrl.pathname.startsWith('/dashboard') ||
      request.nextUrl.pathname.startsWith('/onboarding'));
  if (needsTermsGate) {
    const url = new URL('/auth/accept-terms', request.url);
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Admin-only path protection
  if (request.nextUrl.pathname.startsWith('/dashboard/admin') && user) {
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com').split(',');
    if (!adminEmails.includes(user.email || '')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Redirect authenticated users away from auth pages, honouring any ?redirect= deep link.
  // Exempt /auth/accept-terms (users must stay here to record consent) and
  // /auth/callback (OAuth code exchange — interrupting it breaks the session),
  // otherwise the terms gate above would loop.
  const isAcceptTermsPage = request.nextUrl.pathname.startsWith('/auth/accept-terms');
  const isAuthCallback = request.nextUrl.pathname.startsWith('/auth/callback');
  if (request.nextUrl.pathname.startsWith('/auth') && user && !isAcceptTermsPage && !isAuthCallback) {
    const rawRedirect = request.nextUrl.searchParams.get('redirect');
    const destination = rawRedirect?.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : '/dashboard';
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // Deals page is available to all users (affiliate revenue)
  // Scanner shows "coming soon" on the page itself
  // No tier gating needed at middleware level

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
