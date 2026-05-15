// Generate the Apple Sign In OAuth client secret JWT for Supabase.
//
// Apple's Sign in with Apple OAuth requires the OAuth client secret to be
// a short-lived JWT signed with our Sign in with Apple Key (.p8 ES256).
// Supabase's Apple provider accepts that JWT directly in the Secret Key field.
//
// Run from this repo root:
//   node scripts/gen-apple-jwt.mjs
//
// Reads ~/Downloads/AuthKey_8XT5KZQ54X.p8, prints the JWT to stdout.

import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const TEAM_ID    = 'S4AQZPYZ34';
const KEY_ID     = '8XT5KZQ54X';
const SERVICE_ID = 'co.uk.paybacker.web.auth';

const DEFAULT_P8 = join(homedir(), 'Downloads', `AuthKey_${KEY_ID}.p8`);
const P8_PATH    = process.argv[2] || DEFAULT_P8;

if (!existsSync(P8_PATH)) {
  console.error(`Error: .p8 file not found at ${P8_PATH}`);
  console.error(`Pass the path as an argument:`);
  console.error(`  node scripts/gen-apple-jwt.mjs /path/to/AuthKey_${KEY_ID}.p8`);
  process.exit(1);
}

const privateKeyPEM = readFileSync(P8_PATH, 'utf8');
const privateKey = await importPKCS8(privateKeyPEM, 'ES256');

const now = Math.floor(Date.now() / 1000);
const sixMonthsInSeconds = 60 * 60 * 24 * 180;

const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
  .setIssuer(TEAM_ID)
  .setIssuedAt(now)
  .setExpirationTime(now + sixMonthsInSeconds)
  .setAudience('https://appleid.apple.com')
  .setSubject(SERVICE_ID)
  .sign(privateKey);

console.log('');
console.log('--- Apple Sign In OAuth Client Secret JWT ---');
console.log('');
console.log(jwt);
console.log('');
console.log('--- end of JWT ---');
console.log('');
console.log(`Expires: ${new Date((now + sixMonthsInSeconds) * 1000).toISOString()}`);
console.log(`Issued:  ${new Date(now * 1000).toISOString()}`);
console.log('');
console.log('Apple JWT secret keys expire after 6 months max. Re-run this');
console.log('script before then or sign-in will silently break.');
