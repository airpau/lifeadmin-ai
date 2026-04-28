/**
 * CEO Daily Report Cron — 8am UTC
 *
 * Sends Paul a Telegram summary each morning covering:
 * - New signups in the last 24h
 * - Active disputes and status breakdown
 * - Blog and social content published
 * - Pending content awaiting approval
 * - Agent activity from business_log
 * - Recommended actions based on the data
 * - Total platform stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + limit;
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + limit / 2) end = nl + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

async function sendTelegram(token: string, chatId: number, text: string): Promise<boolean> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error('[daily-ceo-report] Telegram error:', data.description);
      return false;
    }
  }
  return true;
}

// Escape chars that break Telegram Markdown v1 in dynamic text
function esc(text: string): string {
  return text.replace(/[_*`\[]/g, (c) => `\\${c}`);
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use the executive bot (Charlie) so founder replies go to the Charlie webhook,
  // not the Pocket Agent, and conversation history is maintained for follow-ups.
  const token = (process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_USER_BOT_TOKEN);
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
  }

  const supabase = getAdmin();

  // Resolve Paul's Telegram chat ID from profiles, then telegram_sessions, then env fallback
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, telegram_chat_id')
    .eq('email', 'aireypaul@googlemail.com')
    .single();

  let chatId: number | null = profile?.telegram_chat_id
    ? Number(profile.telegram_chat_id)
    : null;

  if (!chatId && profile?.id) {
    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('telegram_chat_id')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .single();
    if (session?.telegram_chat_id) chatId = Number(session.telegram_chat_id);
  }

  if (!chatId && process.env.TELEGRAM_FOUNDER_CHAT_ID) {
    chatId = Number(process.env.TELEGRAM_FOUNDER_CHAT_ID);
  }

  if (!chatId) {
    console.error('[daily-ceo-report] Could not resolve founder Telegram chat ID');
    return NextResponse.json({ error: "Could not find founder's Telegram chat ID" }, { status: 500 });
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Fetch open GitHub PRs (non-blocking)
  type GitHubPR = { number: number; title: string; html_url: string; created_at: string; user: { login: string } };
  let openPRs: GitHubPR[] = [];
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    try {
      const prRes = await fetch(
        'https://api.github.com/repos/airpau/lifeadmin-ai/pulls?state=open&per_page=10&sort=created&direction=desc',
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );
      if (prRes.ok) openPRs = (await prRes.json()) as GitHubPR[];
    } catch (e) {
      console.error('[daily-ceo-report] GitHub PR fetch failed:', e);
    }
  }

  // Run all queries in parallel
  const [
    newUsersResult,
    totalUsersResult,
    activeDisputesResult,
    allDisputesResult,
    blogPostsResult,
    socialPostedResult,
    pendingContentResult,
    agentActivityResult,
    totalLettersResult,
  ] = await Promise.all([
    // New signups in last 24h
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString()),

    // Total users
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true }),

    // Active (unresolved) disputes
    supabase
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '("resolved","dismissed")'),

    // All disputes with status breakdown
    supabase
      .from('disputes')
      .select('status'),

    // Blog posts published in last 24h
    supabase
      .from('blog_posts')
      .select('title, slug, published_at')
      .eq('status', 'published')
      .gte('published_at', yesterday.toISOString())
      .order('published_at', { ascending: false }),

    // Social posts published in last 24h
    supabase
      .from('content_drafts')
      .select('platform, caption, posted_at')
      .eq('status', 'posted')
      .gte('posted_at', yesterday.toISOString())
      .order('posted_at', { ascending: false }),

    // Pending content drafts awaiting approval
    supabase
      .from('content_drafts')
      .select('id, platform, content_type, caption, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),

    // Agent activity from business_log in last 24h
    supabase
      .from('business_log')
      .select('category, title, created_by, created_at')
      .gte('created_at', yesterday.toISOString())
      .order('created_at', { ascending: false })
      .limit(20),

    // Total letters generated (tasks of complaint type)
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'complaint_letter'),
  ]);

  // Process results
  const newUsers = newUsersResult.count ?? 0;
  const totalUsers = totalUsersResult.count ?? 0;
  const activeDisputes = activeDisputesResult.count ?? 0;
  const totalDisputes = (allDisputesResult.data ?? []).length;
  const totalLetters = totalLettersResult.count ?? 0;

  // Dispute status breakdown
  const statusBreakdown: Record<string, number> = {};
  for (const d of allDisputesResult.data ?? []) {
    const s = d.status ?? 'unknown';
    statusBreakdown[s] = (statusBreakdown[s] ?? 0) + 1;
  }

  const blogPosts = blogPostsResult.data ?? [];
  const socialPosts = socialPostedResult.data ?? [];
  const pendingContent = pendingContentResult.data ?? [];
  const agentActivity = agentActivityResult.data ?? [];

  // Social posts grouped by platform
  const socialByPlatform: Record<string, number> = {};
  for (const p of socialPosts) {
    const pl = p.platform ?? 'unknown';
    socialByPlatform[pl] = (socialByPlatform[pl] ?? 0) + 1;
  }

  // Agent activity grouped by agent/created_by
  const agentByAgent: Record<string, string[]> = {};
  for (const entry of agentActivity) {
    const key = entry.created_by || entry.category || 'system';
    if (!agentByAgent[key]) agentByAgent[key] = [];
    agentByAgent[key].push(entry.title);
  }

  // ---- Build message ----
  const lines: string[] = [];

  lines.push(`📊 *Paybacker Daily Report — ${dateStr}*`);
  lines.push('');

  // Users
  lines.push(`*Users:* ${totalUsers} total (+${newUsers} new today)`);
  lines.push('');

  // Content published
  lines.push('*Content Published:*');
  if (blogPosts.length > 0) {
    const titles = blogPosts.map((p) => esc(p.title ?? 'Untitled')).join(', ');
    lines.push(`• Blog: ${titles}`);
  } else {
    lines.push('• Blog: None');
  }
  if (socialPosts.length > 0) {
    const platformSummary = Object.entries(socialByPlatform)
      .map(([pl, n]) => `${n} on ${pl}`)
      .join(', ');
    lines.push(`• Social: ${socialPosts.length} post${socialPosts.length !== 1 ? 's' : ''} (${platformSummary})`);
  } else {
    lines.push('• Social: None');
  }
  lines.push('');

  // Disputes
  const statusSummary = Object.entries(statusBreakdown)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ');
  lines.push(
    `*Disputes:* ${activeDisputes} active, ${totalDisputes} total${statusSummary ? ` (${statusSummary})` : ''}`,
  );
  lines.push('');

  // Pending approvals
  lines.push('*Pending Your Approval:*');
  if (pendingContent.length > 0) {
    for (const item of pendingContent.slice(0, 5)) {
      const raw = item.caption ?? item.content_type ?? 'No caption';
      const preview = esc(raw.replace(/\n/g, ' ').substring(0, 80));
      const ellipsis = raw.length > 80 ? '...' : '';
      lines.push(`• [${esc(item.platform ?? 'unknown')}] ${preview}${ellipsis}`);
    }
    if (pendingContent.length > 5) {
      lines.push(`• ...and ${pendingContent.length - 5} more`);
    }
  } else {
    lines.push('None — all clear');
  }
  lines.push('');

  // Open PRs awaiting review
  lines.push('*PRs Awaiting Your Review:*');
  if (openPRs.length > 0) {
    for (const pr of openPRs.slice(0, 5)) {
      lines.push(`• \\#${pr.number}: ${esc(pr.title)}`);
      lines.push(`  github.com/airpau/lifeadmin\\-ai/pull/${pr.number}`);
    }
    if (openPRs.length > 5) lines.push(`• ...and ${openPRs.length - 5} more`);
  } else {
    lines.push('None — inbox clear');
  }
  lines.push('');

  // Agent activity
  lines.push('*Other Agent Activity:*');
  if (Object.keys(agentByAgent).length > 0) {
    for (const [agent, titles] of Object.entries(agentByAgent).slice(0, 6)) {
      const summary = titles.slice(0, 2).map(esc).join(', ');
      const extra = titles.length > 2 ? ` (+${titles.length - 2} more)` : '';
      lines.push(`• ${esc(agent)}: ${summary}${extra}`);
    }
    if (Object.keys(agentByAgent).length > 6) {
      lines.push(`• ...and ${Object.keys(agentByAgent).length - 6} more agents`);
    }
  } else {
    lines.push('No other agent activity in the last 24h');
  }
  lines.push('');

  // Recommended actions (derived from data, no external API needed)
  lines.push('*Recommended Actions:*');
  const actions: string[] = [];

  if (pendingContent.length > 0) {
    actions.push(
      `${pendingContent.length} content draft${pendingContent.length !== 1 ? 's' : ''} awaiting approval — review at paybacker.co.uk/admin`,
    );
  }
  if (newUsers > 0) {
    actions.push(
      `${newUsers} new user${newUsers !== 1 ? 's' : ''} signed up — check onboarding flow is working correctly`,
    );
  }
  if (activeDisputes > 10) {
    actions.push(`${activeDisputes} open disputes — review for any stalled or overdue cases`);
  }
  if (blogPosts.length === 0 && socialPosts.length === 0) {
    actions.push(
      'No content published today — trigger publish-blog or social-post cron if needed',
    );
  }
  if (agentActivity.length === 0) {
    actions.push('No agent activity in last 24h — check cron jobs are running on Vercel');
  }

  if (actions.length === 0) {
    lines.push('All systems normal — no immediate actions required.');
  } else {
    for (let i = 0; i < Math.min(actions.length, 3); i++) {
      lines.push(`${i + 1}. ${actions[i]}`);
    }
  }

  lines.push('');
  lines.push(
    `_Platform totals: ${totalUsers} users · ${totalDisputes} disputes · ${totalLetters} letters generated_`,
  );

  const message = lines.join('\n');
  const ok = await sendTelegram(token, chatId, message);

  // Save to telegram_messages so the Charlie bot has this context for follow-up questions.
  // When Paul asks "who were the two new signups?", Charlie loads conversation history
  // and can answer from both the cached briefing and live DB queries.
  if (ok) {
    await supabase.from('telegram_messages').insert({
      chat_id: chatId,
      role: 'assistant',
      content: message,
    }).then(() => {}, () => {});
  }

  // Log to business_log
  await supabase.from('business_log').insert({
    category: 'ceo_report',
    title: `CEO Daily Report — ${now.toISOString().split('T')[0]}`,
    content: `Sent to founder. Users: ${totalUsers} (+${newUsers} new), Active disputes: ${activeDisputes}, Pending approvals: ${pendingContent.length}, Agent entries: ${agentActivity.length}, Open PRs: ${openPRs.length}.`,
    created_by: 'daily-ceo-report',
  });

  return NextResponse.json({
    ok,
    date: now.toISOString().split('T')[0],
    stats: {
      newUsers,
      totalUsers,
      activeDisputes,
      totalDisputes,
      totalLetters,
      blogPosts: blogPosts.length,
      socialPosts: socialPosts.length,
      pendingApprovals: pendingContent.length,
      agentEntries: agentActivity.length,
      openPRs: openPRs.length,
    },
  });
}
