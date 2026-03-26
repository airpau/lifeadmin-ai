/**
 * Meta Custom Audiences API
 * Syncs leads and user segments to Facebook Custom Audiences for retargeting.
 * Uses the same SHA256 hashing as the Conversions API.
 */

const API_VERSION = 'v25.0';
const AD_ACCOUNT_ID = 'act_1413289257265883';

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getToken(): string {
  return process.env.META_ACCESS_TOKEN || '';
}

// Create a new Custom Audience
export async function createCustomAudience(
  name: string,
  description: string,
  subtype: 'CUSTOM' | 'LOOKALIKE' = 'CUSTOM',
): Promise<{ id: string; name: string } | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          subtype,
          customer_file_source: 'USER_PROVIDED_ONLY',
          access_token: token,
        }),
      }
    );
    const data = await res.json();
    if (data.error) {
      console.error('[meta-audiences] Create failed:', data.error.message);
      return null;
    }
    return { id: data.id, name };
  } catch (err: any) {
    console.error('[meta-audiences] Create error:', err.message);
    return null;
  }
}

// List existing Custom Audiences
export async function listCustomAudiences(): Promise<{ id: string; name: string; approximate_count: number }[]> {
  const token = getToken();
  if (!token) return [];

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/customaudiences?fields=id,name,approximate_count&limit=50&access_token=${token}`
    );
    const data = await res.json();
    return (data.data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      approximate_count: a.approximate_count || 0,
    }));
  } catch {
    return [];
  }
}

// Upload users to an existing Custom Audience (batch)
export async function uploadToAudience(
  audienceId: string,
  users: { email?: string; phone?: string; firstName?: string; lastName?: string }[],
): Promise<{ num_received: number; num_invalid: number } | null> {
  const token = getToken();
  if (!token || users.length === 0) return null;

  // Hash all user data
  const hashedUsers = await Promise.all(
    users.map(async (u) => {
      const row: string[] = [];
      // Schema order must match the schema array below
      row.push(u.email ? await sha256(u.email) : '');
      row.push(u.phone ? await sha256(u.phone.replace(/[\s\-\(\)]/g, '')) : '');
      row.push(u.firstName ? await sha256(u.firstName) : '');
      row.push(u.lastName ? await sha256(u.lastName) : '');
      row.push(await sha256('gb')); // country
      return row;
    })
  );

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${audienceId}/users`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            schema: ['EMAIL', 'PHONE', 'FN', 'LN', 'COUNTRY'],
            data: hashedUsers,
          },
          access_token: token,
        }),
      }
    );
    const data = await res.json();
    if (data.error) {
      console.error('[meta-audiences] Upload failed:', data.error.message);
      return null;
    }
    return {
      num_received: data.num_received || 0,
      num_invalid: data.num_invalid_entries || 0,
    };
  } catch (err: any) {
    console.error('[meta-audiences] Upload error:', err.message);
    return null;
  }
}

// Remove users from an audience
export async function removeFromAudience(
  audienceId: string,
  emails: string[],
): Promise<boolean> {
  const token = getToken();
  if (!token || emails.length === 0) return false;

  const hashedData = await Promise.all(
    emails.map(async (email) => [await sha256(email)])
  );

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${audienceId}/users`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            schema: ['EMAIL'],
            data: hashedData,
          },
          access_token: token,
        }),
      }
    );
    const data = await res.json();
    return !data.error;
  } catch {
    return false;
  }
}

// Create a Lookalike Audience from an existing audience
export async function createLookalikeAudience(
  sourceAudienceId: string,
  name: string,
  ratio: number = 0.01, // 1% lookalike (most similar)
): Promise<{ id: string } | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subtype: 'LOOKALIKE',
          origin_audience_id: sourceAudienceId,
          lookalike_spec: JSON.stringify({
            type: 'similarity',
            country: 'GB',
            ratio,
          }),
          access_token: token,
        }),
      }
    );
    const data = await res.json();
    if (data.error) {
      console.error('[meta-audiences] Lookalike failed:', data.error.message);
      return null;
    }
    return { id: data.id };
  } catch (err: any) {
    console.error('[meta-audiences] Lookalike error:', err.message);
    return null;
  }
}
