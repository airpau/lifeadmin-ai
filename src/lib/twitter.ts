/**
 * Twitter/X API v2 integration for posting and engagement.
 * Uses OAuth 1.0a for tweet actions (consumer key + access token).
 */

import crypto from 'crypto';

const API_BASE = 'https://api.twitter.com/2';

function getCredentials() {
  return {
    consumerKey: process.env.TWITTER_CONSUMER_KEY || '',
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
  };
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const sortedParams = Object.keys(params).sort().map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function buildOAuthHeader(method: string, url: string, body?: Record<string, string>): string {
  const creds = getCredentials();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...(body || {}) };
  const signature = generateOAuthSignature(method, url, allParams, creds.consumerSecret, creds.accessTokenSecret);
  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams).sort().map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`);
  return `OAuth ${headerParts.join(', ')}`;
}

/**
 * Post a tweet. Throws with the actual API error message on failure.
 */
export async function postTweet(text: string): Promise<{ id: string; text: string }> {
  const url = `${API_BASE}/tweets`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': buildOAuthHeader('POST', url),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    const data = await res.json();
    if (data.errors || data.detail) {
      const reason = data.errors?.[0]?.message || data.detail || 'Unknown error';
      console.error('[twitter] Post failed:', reason);
      throw new Error(reason);
    }
    return { id: data.data?.id, text: data.data?.text };
  } catch (err: any) {
    console.error('[twitter] Post error:', err.message);
    throw err;
  }
}

/**
 * Reply to a tweet.
 */
export async function replyToTweet(tweetId: string, text: string): Promise<{ id: string } | null> {
  const url = `${API_BASE}/tweets`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': buildOAuthHeader('POST', url),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        reply: { in_reply_to_tweet_id: tweetId },
      }),
    });

    const data = await res.json();
    if (data.errors) {
      console.error('[twitter] Reply failed:', data.errors[0]?.message);
      return null;
    }
    return { id: data.data?.id };
  } catch (err: any) {
    console.error('[twitter] Reply error:', err.message);
    return null;
  }
}

/**
 * Get mentions (tweets mentioning our account).
 */
export async function getMentions(sinceId?: string): Promise<Array<{ id: string; text: string; author_id: string; created_at: string }>> {
  const creds = getCredentials();

  // First get our user ID
  const meUrl = `${API_BASE}/users/me`;
  const meRes = await fetch(meUrl, {
    headers: { 'Authorization': buildOAuthHeader('GET', meUrl) },
  });
  const meData = await meRes.json();
  const userId = meData.data?.id;
  if (!userId) return [];

  // Get mentions
  let url = `${API_BASE}/users/${userId}/mentions?tweet.fields=created_at,author_id&max_results=10`;
  if (sinceId) url += `&since_id=${sinceId}`;

  const res = await fetch(url, {
    headers: { 'Authorization': buildOAuthHeader('GET', url.split('?')[0]) },
  });

  const data = await res.json();
  return (data.data || []).map((t: any) => ({
    id: t.id,
    text: t.text,
    author_id: t.author_id,
    created_at: t.created_at,
  }));
}

/**
 * Search for tweets about relevant topics (for engagement).
 */
export async function searchTweets(query: string, maxResults: number = 10): Promise<Array<{ id: string; text: string; author_id: string }>> {
  const url = `${API_BASE}/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${maxResults}&tweet.fields=author_id`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': buildOAuthHeader('GET', url.split('?')[0]) },
    });

    const data = await res.json();
    return (data.data || []).map((t: any) => ({
      id: t.id,
      text: t.text,
      author_id: t.author_id,
    }));
  } catch {
    return [];
  }
}

/**
 * Like a tweet.
 */
export async function likeTweet(tweetId: string): Promise<boolean> {
  const creds = getCredentials();

  const meUrl = `${API_BASE}/users/me`;
  const meRes = await fetch(meUrl, {
    headers: { 'Authorization': buildOAuthHeader('GET', meUrl) },
  });
  const userId = (await meRes.json()).data?.id;
  if (!userId) return false;

  const url = `${API_BASE}/users/${userId}/likes`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': buildOAuthHeader('POST', url),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tweet_id: tweetId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
