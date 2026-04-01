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

  // Redirect authenticated users away from auth pages, honouring any ?redirect= deep link
  if (request.nextUrl.pathname.startsWith('/auth') && user) {
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
