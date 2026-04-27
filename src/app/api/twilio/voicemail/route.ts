/**
 * Twilio Voicemail transcription callback.
 *
 * Twilio POSTs here once the inbound voicemail has been transcribed
 * (usually 30-90 seconds after the call ends). We:
 *   1. Validate the request actually came from Twilio
 *   2. Email the transcription + recording link to hello@paybacker.co.uk
 *      via Resend (already wired)
 *
 * Body (form-encoded) from Twilio includes:
 *   From, To, CallSid, RecordingSid, RecordingUrl, RecordingDuration,
 *   TranscriptionText, TranscriptionStatus, TranscriptionUrl
 *
 * For details see https://www.twilio.com/docs/voice/twiml/record#transcribe
 */
import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { validateTwilioSignature } from '@/lib/twilio/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOTIFY_TO = process.env.TWILIO_VOICEMAIL_NOTIFY_TO || 'hello@paybacker.co.uk';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  // Defence: fail closed unless the request really is from Twilio.
  if (process.env.TWILIO_AUTH_TOKEN) {
    const ok = await validateTwilioSignature(req);
    if (!ok) {
      console.warn('[twilio/voicemail] signature validation failed');
      return new NextResponse('Forbidden', { status: 403 });
    }
  } else {
    console.warn('[twilio/voicemail] TWILIO_AUTH_TOKEN not set — skipping signature check (dev mode)');
  }

  const form = await req.formData();
  const data: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    data[k] = typeof v === 'string' ? v : '';
  }

  const from = data.From || '(unknown)';
  const callSid = data.CallSid || '';
  const recordingUrl = data.RecordingUrl || '';
  const recordingDuration = data.RecordingDuration || '';
  const transcriptionText = data.TranscriptionText || '(no transcription text — likely silent or below audio threshold)';
  const transcriptionStatus = data.TranscriptionStatus || '';

  // Twilio's RecordingUrl is the audio resource — append .mp3 for direct playback.
  const playableUrl = recordingUrl ? `${recordingUrl}.mp3` : '';

  const subject = `📞 Paybacker voicemail from ${from}`;
  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 16px;">
      <h2 style="color: #34d399; font-size: 22px; margin: 0 0 16px;">New voicemail on +447488895049</h2>
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 8px;">From <strong style="color: #e2e8f0;">${escapeHtml(from)}</strong> — ${escapeHtml(recordingDuration)}s</p>
      <div style="background: #1e293b; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <div style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Transcription (${escapeHtml(transcriptionStatus)})</div>
        <div style="color: #e2e8f0; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(transcriptionText)}</div>
      </div>
      ${playableUrl ? `<p style="margin: 16px 0;"><a href="${escapeHtml(playableUrl)}" style="color: #34d399; text-decoration: none; font-weight: 600;">▶ Listen to recording</a></p>` : ''}
      <p style="color: #64748b; font-size: 11px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b;">CallSid: ${escapeHtml(callSid)}</p>
    </div>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFY_TO,
      subject,
      html,
    });
  } catch (err) {
    console.error('[twilio/voicemail] resend send failed', err);
    // Still return 200 so Twilio doesn't retry — we've already logged.
  }

  return NextResponse.json({ ok: true });
}
