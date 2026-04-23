/**
 * Android Digital Asset Links.
 *
 * Served at `/.well-known/assetlinks.json`. When a user taps a
 * paybacker.co.uk link on an Android device, Android checks this
 * file to verify the domain is owned by the app with our package
 * name (`co.uk.paybacker.app`) — if the SHA-256 fingerprint below
 * matches the signing key, the link opens in the native app.
 *
 * `sha256_cert_fingerprints` must be the fingerprint of the key
 * used to sign the Play Store release (or Google's internal signing
 * key if you\'ve enabled Play App Signing). Grab it from:
 *   keytool -list -v -keystore your-release-key.keystore
 * or from Play Console → Release → Setup → App signing.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = false;

// TODO: replace with the SHA-256 fingerprint of the signing key
// (upload key OR the Google-managed Play App Signing key, depending
// on which Android verifies against — check Play Console setup).
const SHA256_FINGERPRINT = 'REPLACE_WITH_SHA256_OF_PLAY_SIGNING_KEY';

export async function GET() {
  return NextResponse.json(
    [
      {
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.get_login_creds',
        ],
        target: {
          namespace: 'android_app',
          package_name: 'co.uk.paybacker.app',
          sha256_cert_fingerprints: [SHA256_FINGERPRINT],
        },
      },
    ],
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}
