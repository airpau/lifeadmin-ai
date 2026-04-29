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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
