import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Awin 1st-party cookie tracking
  // When an affiliate sends traffic, Awin appends ?awc=... to the landing URL.
  // We must capture it and set an HttpOnly + Secure cookie for server-side tracking.
  const awc = request.nextUrl.searchParams.get('awc');
  if (awc) {
    // 30-day cookie to match Awin's default attribution window
    response.cookies.set('awc', awc, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
  }

  return response;
}

export const config = {
  // Run on all pages except static assets and API routes that don't need it
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
