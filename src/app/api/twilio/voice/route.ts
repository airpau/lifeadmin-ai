/**
 * Twilio Voice webhook for the DSA trader-contact line (+447488895049).
 *
 * Twilio POSTs here when someone calls the number. We respond with TwiML
 * that:
 *   1. Plays a polite greeting steering callers to email
 *   2. Records up to 2 minutes of voicemail with auto-transcription
 *   3. Pings /api/twilio/voicemail when the transcription is ready
 *
 * Why this exists: the EU Digital Services Act requires Apple to display
 * a working trader phone number on every Paybacker App Store listing in
 * the EU. We don't want to staff a live line for a solo-founder SaaS,
 * so the voicemail-to-email pattern is the right shape — DSA compliant,
 * EU-user-friendly, and the founder still sees every message.
 *
 * Configured at provision time:
 *   VoiceUrl    = https://paybacker.co.uk/api/twilio/voice
 *   VoiceMethod = POST
 *
 * No env vars required for this route — TwiML is static. Signature
 * validation isn't strictly required here (the worst an attacker can
 * do is trigger our static TwiML response), but we add it anyway for
 * defence in depth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateTwilioSignature } from '@/lib/twilio/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRANSCRIBE_CALLBACK = 'https://paybacker.co.uk/api/twilio/voicemail';

const TWIML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy-Neural" language="en-GB">Thanks for calling Paybacker. The fastest way to reach our support team is by email at hello at paybacker dot co dot uk. If your message is urgent, please leave a voicemail after the tone, and we will respond within one business day.</Say>
  <Record maxLength="120" timeout="5" playBeep="true" transcribe="true" transcribeCallback="${TRANSCRIBE_CALLBACK}" finishOnKey="#" />
  <Say voice="Polly.Amy-Neural" language="en-GB">We did not record a message. Please email hello at paybacker dot co dot uk. Goodbye.</Say>
</Response>`;

export async function POST(req: NextRequest) {
  // Signature check — fails open in dev (when TWILIO_AUTH_TOKEN absent)
  // because we'd rather a misconfigured deploy still answer the phone
  // than reject the call and 500 to a real EU user.
  if (process.env.TWILIO_AUTH_TOKEN) {
    const ok = await validateTwilioSignature(req);
    if (!ok) {
      console.warn('[twilio/voice] signature validation failed');
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  return new NextResponse(TWIML, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

// Twilio sometimes pre-flights with GET — answer politely so console
// "Test it" works.
export async function GET() {
  return new NextResponse(TWIML, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}
