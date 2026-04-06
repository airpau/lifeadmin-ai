import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { notifyAgents } from '@/lib/agent-notify';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = 'airpau/lifeadmin-ai';

async function sendTelegram(text: string) {
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!chatId) return;
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(chatId), text: chunk, parse_mode: 'Markdown' }),
    });
  }
}

async function githubApi(path: string, method = 'GET', body?: any) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    method,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/**
 * Developer Agent - creates PRs for approved proposals or direct requests.
 *
 * SAFETY RULES:
 * 1. NEVER commits to main/master
 * 2. ALWAYS creates a branch and PR
 * 3. Can only CREATE or MODIFY files, never DELETE
 * 4. PR requires human review before merge
 * 5. Notifies founder via Telegram with PR link
 *
 * POST body: { task, context?, proposalId? }
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { task, context, proposalId } = await request.json();
  if (!task) {
    return NextResponse.json({ error: 'task description required' }, { status: 400 });
  }

  const supabase = getAdmin();

  // Get business log for context
  const { data: businessLog } = await supabase
    .from('business_log')
    .select('category, title, content')
    .order('created_at', { ascending: false })
    .limit(15);

  const logContext = (businessLog || []).map((l: any) => `[${l.category}] ${l.title}: ${l.content}`).join('\n');

  // Get the current file tree (key files only)
  let fileTree = '';
  try {
    const tree = await githubApi('/git/trees/master?recursive=1');
    if (tree.tree) {
      const relevantFiles = tree.tree
        .filter((f: any) => f.type === 'blob' && (
          f.path.startsWith('src/') || f.path.startsWith('agent-server/src/') ||
          f.path.startsWith('supabase/') || f.path === 'package.json'
        ))
        .map((f: any) => f.path)
        .slice(0, 200);
      fileTree = relevantFiles.join('\n');
    }
  } catch {}

  // Use Claude to plan and generate the code changes
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: `You are Morgan, the CTO and Developer Agent at Paybacker LTD. You write production code for the Next.js/TypeScript/Supabase platform.

SAFETY RULES (NEVER VIOLATE):
- You can ONLY create or modify files. NEVER delete files.
- You work on feature branches, never main/master.
- Your code must be production-ready, type-safe TypeScript.
- Follow existing patterns in the codebase.
- Never expose API keys or secrets in code.
- Never use em dashes in any text content.

TECH STACK:
- Next.js 16, React, TypeScript, Tailwind CSS
- Supabase (PostgreSQL + Auth + RLS)
- Vercel deployment
- All API routes use App Router (route.ts)

BUSINESS CONTEXT:
${logContext}

FILE TREE (key files):
${fileTree}

Return a JSON object with:
{
  "branchName": "dev/short-description",
  "prTitle": "Short PR title (under 70 chars)",
  "prBody": "Description of what this PR does",
  "files": [
    {
      "path": "src/path/to/file.ts",
      "action": "create" | "modify",
      "content": "full file content for create, or null for modify",
      "patch": "for modify: the specific changes as a unified diff"
    }
  ]
}

IMPORTANT: Keep changes SMALL and FOCUSED.
- Prefer creating NEW small utility files or components over rewriting large existing files.
- If modifying an existing file, only include the NEW or CHANGED code as a new helper/component file that the existing file can import.
- Never try to rewrite an entire page component. Instead, create a wrapper or utility.
- Each file in your response should be under 200 lines.
- One PR per task. Maximum 3 files per PR.`,
    messages: [{
      role: 'user',
      content: `${context ? `Context: ${context}\n\n` : ''}Task: ${task}`,
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let plan: any;
  try {
    // Strip markdown code fences if present
    let jsonText = textBlock.text;
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1];
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) plan = JSON.parse(jsonMatch[0]);
    else throw new Error('No JSON found');
  } catch (parseErr: any) {
    return NextResponse.json({ error: 'Failed to parse plan', detail: parseErr.message, raw: textBlock.text.substring(0, 500) }, { status: 500 });
  }

  if (!plan.files || plan.files.length === 0) {
    return NextResponse.json({ error: 'No files in plan' }, { status: 400 });
  }

  // Create the branch
  try {
    // Get master SHA
    const masterRef = await githubApi('/git/ref/heads/master');
    const masterSha = masterRef.object?.sha;
    if (!masterSha) {
      return NextResponse.json({ error: 'Could not get master SHA' }, { status: 500 });
    }

    // Create branch
    const branchName = plan.branchName || `dev/agent-${Date.now()}`;
    await githubApi('/git/refs', 'POST', {
      ref: `refs/heads/${branchName}`,
      sha: masterSha,
    });

    // Create/update files on the branch
    for (const file of plan.files) {
      if (!file.path || !file.content) continue;

      // Check if file exists
      let existingSha: string | undefined;
      try {
        const existing = await githubApi(`/contents/${file.path}?ref=${branchName}`);
        existingSha = existing.sha;
      } catch {}

      const fileData: any = {
        message: `${file.action === 'create' ? 'Add' : 'Update'} ${file.path}`,
        content: Buffer.from(file.content).toString('base64'),
        branch: branchName,
      };
      if (existingSha) fileData.sha = existingSha;

      await githubApi(`/contents/${file.path}`, 'PUT', fileData);
    }

    // Create PR
    const pr = await githubApi('/pulls', 'POST', {
      title: plan.prTitle || `[Dev Agent] ${task.substring(0, 60)}`,
      body: `## Summary\n${plan.prBody || task}\n\n## Files Changed\n${plan.files.map((f: any) => `- ${f.action}: \`${f.path}\``).join('\n')}\n\n---\n*Auto-generated by Morgan (Developer Agent). Review before merging.*`,
      head: branchName,
      base: 'master',
    });

    const prUrl = pr.html_url || pr.url;
    console.log(`[developer] PR response:`, JSON.stringify(pr).substring(0, 500));

    if (!prUrl && pr.errors) {
      // PR might fail if branch has no diff or already exists
      return NextResponse.json({
        ok: false,
        error: `PR creation failed: ${pr.errors.map((e: any) => e.message).join(', ')}`,
        branch: branchName,
        files: plan.files.length,
      });
    }

    // Update proposal if linked
    if (proposalId) {
      await supabase.from('improvement_proposals').update({
        status: 'in_development',
        github_issue_url: prUrl,
        implementation_result: `PR created: ${prUrl}`,
      }).eq('id', proposalId);
    }

    // Log to business log
    await supabase.from('business_log').insert({
      category: 'progress',
      title: `Dev Agent PR: ${plan.prTitle || task.substring(0, 50)}`,
      content: `PR created: ${prUrl}. Branch: ${branchName}. Files: ${plan.files.map((f: any) => f.path).join(', ')}`,
      created_by: 'developer_agent',
    });

    // Notify via Telegram
    await sendTelegram(`*Developer Agent - PR Created*\n\n${plan.prTitle || task}\n\nFiles: ${plan.files.length}\n${plan.files.map((f: any) => `  ${f.action}: \`${f.path}\``).join('\n')}\n\n[Review PR](${prUrl})`);

    // Notify all relevant agents
    await notifyAgents('pr_created', `PR: ${plan.prTitle || task}`, `Developer agent created PR: ${prUrl}. Branch: ${branchName}. Files: ${plan.files.map((f: any) => f.path).join(', ')}. Task: ${task}`, 'developer_agent');

    return NextResponse.json({
      ok: true,
      pr: prUrl,
      branch: branchName,
      files: plan.files.length,
    });
  } catch (err: any) {
    console.error('[developer] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
