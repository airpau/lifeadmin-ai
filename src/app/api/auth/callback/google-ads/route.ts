import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return new NextResponse(`<html><body style="background:#020617;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h1 style="color:#ef4444;">Authorisation Failed</h1><p style="color:#94a3b8;">${error}</p></div></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code) {
    return new NextResponse(`<html><body style="background:#020617;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h1 style="color:#ef4444;">No Code</h1><p style="color:#94a3b8;">No authorisation code received.</p></div></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Exchange code for refresh token
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET || '',
        redirect_uri: 'https://paybacker.co.uk/api/auth/callback/google-ads',
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.refresh_token) {
      return new NextResponse(`<html><body style="background:#020617;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;max-width:600px;"><h1 style="color:#22c55e;">Google Ads Connected</h1><p style="color:#94a3b8;margin-bottom:24px;">Copy this refresh token and send it to your developer:</p><div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;word-break:break-all;font-family:monospace;font-size:13px;color:#f59e0b;">${tokenData.refresh_token}</div><p style="color:#475569;font-size:12px;margin-top:16px;">This token does not expire. Keep it safe.</p><a href="/dashboard/admin" style="color:#f59e0b;margin-top:16px;display:inline-block;">Go to Admin Dashboard</a></div></body></html>`, {
        headers: { 'Content-Type': 'text/html' },
      });
    } else {
      return new NextResponse(`<html><body style="background:#020617;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h1 style="color:#ef4444;">Token Exchange Failed</h1><pre style="color:#94a3b8;text-align:left;background:#1e293b;padding:16px;border-radius:8px;font-size:12px;">${JSON.stringify(tokenData, null, 2)}</pre></div></body></html>`, {
        headers: { 'Content-Type': 'text/html' },
      });
    }
  } catch (err: any) {
    return new NextResponse(`<html><body style="background:#020617;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h1 style="color:#ef4444;">Error</h1><p style="color:#94a3b8;">${err.message}</p></div></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
