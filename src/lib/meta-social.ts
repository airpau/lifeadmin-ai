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
  hashtags: string
): Promise<{ postId: string }> {
  const { accessToken, pageId } = getConfig();

  if (!accessToken || !pageId) {
    throw new Error('META_ACCESS_TOKEN and META_PAGE_ID are required');
  }

  const message = hashtags ? `${content}\n\n${hashtags}` : content;

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

export async function postToInstagram(
  content: string,
  hashtags: string
): Promise<{ postId: string }> {
  const { accessToken, igAccountId } = getConfig();

  if (!accessToken || !igAccountId) {
    throw new Error('META_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID are required');
  }

  const caption = hashtags ? `${content}\n\n${hashtags}` : content;

  // Step 1: Create media container
  const createRes = await fetch(`${META_API_BASE}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caption,
      media_type: 'TEXT',
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
