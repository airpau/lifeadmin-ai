/**
 * Minimal Todoist integration for document reminders.
 *
 * OAuth: https://developer.todoist.com/guides/#oauth. The redirect URL is
 * the one registered on the Todoist app (App Management console), which
 * must be https://paybacker.co.uk/api/auth/todoist/callback. Scope
 * data:read_write is the smallest scope that can create tasks.
 *
 * Tasks are created with Todoist's unified API v1. TODOIST_API_BASE can
 * point elsewhere if Todoist moves the endpoint again.
 *
 * Tasks are only ever created when the user presses the button for one
 * document. Nothing is created automatically.
 */

import { fetchWithRetry } from '@/lib/email/fetch-retry';

export const TODOIST_SCOPE = 'data:read_write';
const AUTHORIZE_URL = 'https://todoist.com/oauth/authorize';
const TOKEN_URL = 'https://todoist.com/oauth/access_token';
const REVOKE_URL = 'https://api.todoist.com/api/v1/access_tokens/revoke';

function apiBase(): string {
  return (process.env.TODOIST_API_BASE || 'https://api.todoist.com/api/v1').replace(/\/$/, '');
}

export function todoistConfigured(): boolean {
  return !!(process.env.TODOIST_CLIENT_ID && process.env.TODOIST_CLIENT_SECRET);
}

export function todoistAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.TODOIST_CLIENT_ID || '',
    scope: TODOIST_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${p}`;
}

export async function exchangeTodoistCode(code: string): Promise<{ access_token: string; token_type?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TODOIST_CLIENT_ID || '',
      client_secret: process.env.TODOIST_CLIENT_SECRET || '',
      code,
    }),
  });
  if (!res.ok) throw new Error(`Todoist token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string; token_type?: string };
  if (!data.access_token) throw new Error('Todoist returned no access token');
  return { access_token: data.access_token, token_type: data.token_type };
}

export class TodoistAuthError extends Error {}

export async function createTodoistTask(
  token: string,
  task: { content: string; description: string; dueDate: string },
): Promise<{ id: string; url: string | null }> {
  const res = await fetchWithRetry(
    `${apiBase()}/tasks`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: task.content, description: task.description, due_date: task.dueDate }),
    },
    // Creating a task is not idempotent, so no retries (a retried 5xx
    // could create the task twice). fetchWithRetry is used for its
    // per-attempt timeout only.
    { label: 'todoist create task', retries: 0 },
  );
  if (res.status === 401 || res.status === 403) throw new TodoistAuthError('Todoist access was refused');
  if (!res.ok) throw new Error(`Todoist create task failed (${res.status})`);
  const data = (await res.json()) as { id?: string; url?: string };
  if (!data.id) throw new Error('Todoist returned no task id');
  return { id: String(data.id), url: data.url ?? null };
}

/** Best effort: tell Todoist to forget the token on disconnect. */
export async function revokeTodoistToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.TODOIST_CLIENT_ID || '',
        client_secret: process.env.TODOIST_CLIENT_SECRET || '',
        access_token: token,
      }),
    });
  } catch {
    // ignore: the stored token is wiped either way
  }
}
