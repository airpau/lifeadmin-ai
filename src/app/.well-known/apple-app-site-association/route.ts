/**
 * Apple App Site Association (AASA).
 *
 * Served at `/.well-known/apple-app-site-association` with
 * Content-Type: application/json. iOS fetches this to verify
 * Universal Link ownership — tapping a link to paybacker.co.uk
 * from Mail / Messages / anywhere opens the native app instead
 * of Safari once the AASA is in place.
 *
 * The appIDs are `TEAMID.co.uk.paybacker.app`. TEAMID is the
 * Apple Developer Team ID for aireypaul@googlemail.com. Swap the
 * placeholder once the app is provisioned in App Store Connect;
 * iOS will refuse to honour Universal Links until a real Team ID
 * appears here.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = false;

// TODO: replace TEAMID once the Apple Developer Team ID is known.
const APP_ID = 'TEAMID.co.uk.paybacker.app';

export async function GET() {
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [APP_ID],
            components: [
              { '/': '/dashboard/*', comment: 'Dashboard links open in-app' },
              { '/': '/auth/*', comment: 'Email-link sign-ins route through the app' },
              { '/': '/complaints/*', comment: 'Complaint letter deep links' },
              { '/': '/', comment: 'Home page when launched via Universal Link' },
            ],
          },
        ],
      },
      webcredentials: { apps: [APP_ID] },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}
