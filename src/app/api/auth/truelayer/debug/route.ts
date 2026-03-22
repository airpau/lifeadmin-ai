import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    client_id: process.env.TRUELAYER_CLIENT_ID,
    client_id_length: process.env.TRUELAYER_CLIENT_ID?.length,
    redirect_uri: process.env.TRUELAYER_REDIRECT_URI,
    redirect_uri_length: process.env.TRUELAYER_REDIRECT_URI?.length,
    redirect_uri_hex_end: process.env.TRUELAYER_REDIRECT_URI ?
      Buffer.from(process.env.TRUELAYER_REDIRECT_URI.slice(-5)).toString('hex') : null,
    auth_url: process.env.TRUELAYER_AUTH_URL,
    api_url: process.env.TRUELAYER_API_URL,
    has_secret: !!process.env.TRUELAYER_CLIENT_SECRET,
    has_encryption_key: !!process.env.ENCRYPTION_KEY,
  });
}
