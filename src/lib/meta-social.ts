import { uploadImageToStorage } from './storage';

const META_API_BASE = 'https://graph.facebook.com/v18.0';

function getConfig() {
  return {
    accessToken: process.env.META_ACCESS_TOKEN,
    pageId: process.env.META_PAGE_ID,
    igAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID,
  };
}

export async function postToFacebook(
  content: string,
  hashtags: string,
  imageBase64?: string,
  imageMimeType?: string
): Promise<{ postId: string }> {
  const { accessToken, pageId } = getConfig();

  if (!accessToken || !pageId) {
    throw new Error('META_ACCESS_TOKEN and META_PAGE_ID are required');
  }

  const message = hashtags ? `${content}\n\n${hashtags}` : content;

  if (imageBase64) {
    // Step 1: Upload photo as unpublished
    const formData = new FormData();
    const mimeType = imageMimeType ?? 'image/png';
    const blob = new Blob([Buffer.from(imageBase64, 'base64')], { type: mimeType });
    formData.append('source', blob, 'post.png');
    formData.append('published', 'false');
    formData.append('access_token', accessToken);

    const photoRes = await fetch(`${META_API_BASE}/${pageId}/photos`, {
      method: 'POST',
      body: formData,
    });

    const photoData = await photoRes.json();
    if (!photoRes.ok || photoData.error) {
      throw new Error(photoData.error?.message ?? `Facebook photo upload error: ${photoRes.status}`);
    }

    const photoId = photoData.id;

    // Step 2: Create post with attached photo
    const postRes = await fetch(`${META_API_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        attached_media: [{ media_fbid: photoId }],
        access_token: accessToken,
      }),
    });

    const postData = await postRes.json();
    if (!postRes.ok || postData.error) {
      throw new Error(postData.error?.message ?? `Facebook feed post error: ${postRes.status}`);
    }

    return { postId: postData.id };
  }

  // Text-only post
  const res = await fetch(`${META_API_BASE}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      access_token: accessToken,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Facebook API error: ${res.status}`);
  }

  return { postId: data.id };
}

/**
 * Post an image to Instagram via the Content Publishing API.
 *
 * REQUIREMENTS (all must be met before this will work):
 * 1. Meta app must be in Live mode (not Development) — requires Meta App Review completion
 * 2. App must have instagram_content_publish permission approved
 * 3. Instagram account must be a Business or Creator account connected to the Facebook Page
 * 4. imageBase64 is REQUIRED — Instagram Content Publishing API does not support text-only posts
 */
export async function postToInstagram(
  content: string,
  hashtags: string,
  imageBase64: string,
  imageMimeType?: string
): Promise<{ postId: string }> {
  const { accessToken, igAccountId } = getConfig();

  if (!accessToken || !igAccountId) {
    throw new Error('META_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID are required');
  }

  const caption = hashtags ? `${content}\n\n${hashtags}` : content;

  // Instagram requires a public URL — upload to Supabase Storage first
  // NOTE: 'social-images' bucket must be public in Supabase dashboard
  const filename = `instagram_${Date.now()}.png`;
  const imageUrl = await uploadImageToStorage(
    imageBase64,
    imageMimeType ?? 'image/png',
    filename
  );

  // Step 1: Create image media container
  const createRes = await fetch(`${META_API_BASE}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caption,
      image_url: imageUrl,
      access_token: accessToken,
    }),
  });

  const createData = await createRes.json();
  if (!createRes.ok || createData.error) {
    throw new Error(createData.error?.message ?? `Instagram media create error: ${createRes.status}`);
  }

  const creationId = createData.id;

  // Step 2: Publish the container
  const publishRes = await fetch(`${META_API_BASE}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: accessToken,
    }),
  });

  const publishData = await publishRes.json();
  if (!publishRes.ok || publishData.error) {
    throw new Error(publishData.error?.message ?? `Instagram publish error: ${publishRes.status}`);
  }

  return { postId: publishData.id };
}
