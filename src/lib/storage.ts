import { createClient } from '@supabase/supabase-js';

// NOTE: The 'social-images' bucket must be created manually in Supabase dashboard:
// Storage → New bucket → Name: "social-images" → Public: true → Create bucket

/**
 * Upload base64 image to Supabase Storage, return public URL.
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.
 */
export async function uploadImageToStorage(
  base64Data: string,
  mimeType: string,
  filename: string
): Promise<string> {
  // Trim env values defensively — Vercel's env-add UI can preserve a
  // trailing newline if the value was pasted with one, and that newline
  // ends up embedded mid-URL in the public link we return. Caught
  // 2026-04-27 when the first per-post blog hero image URL contained
  // a literal `\n` between the host and `/storage/...`. Trimming on
  // read fixes both the URL we build and the supabase-js client init.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const buffer = Buffer.from(base64Data, 'base64');

  const { error } = await supabase.storage
    .from('social-images')
    .upload(filename, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/social-images/${filename}`;
}
