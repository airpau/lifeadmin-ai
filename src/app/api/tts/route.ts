import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
// Default voice: Rachel (clear British female) - can be replaced with cloned voice
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

/**
 * POST /api/tts
 * Converts text to speech using ElevenLabs API.
 * Returns audio/mpeg stream.
 *
 * Body: { text: string, voiceId?: string }
 * Auth: requires logged-in user
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503 });
  }

  // Check auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { text, voiceId } = body;

  if (!text || text.length === 0) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  // Limit text length (ElevenLabs Creator plan: 100k chars/month)
  if (text.length > 5000) {
    return NextResponse.json({ error: 'Text too long. Maximum 5,000 characters.' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${ELEVENLABS_API}/text-to-speech/${voiceId || DEFAULT_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
          },
        }),
      }
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'TTS failed' }));
      return NextResponse.json(
        { error: error.detail || 'TTS generation failed' },
        { status: res.status }
      );
    }

    // Stream the audio back
    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('[tts] ElevenLabs error:', err.message);
    return NextResponse.json({ error: 'TTS service unavailable' }, { status: 500 });
  }
}
