/**
 * Env Check — admin diagnostic
 *
 * Reports the EXISTENCE (not values) of env vars required by the managed-agent MCP tools.
 * Useful for verifying Vercel env config without burning agent token budget.
 *
 * Auth: Bearer CRON_SECRET. Returns only "present" booleans + lengths — never values.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const REQUIRED_VARS = [
  // Core (already needed for existing tools)
  "MCP_BEARER_TOKEN",
  "CRON_SECRET",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AGENTS_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_FOUNDER_CHAT_ID",

  // New tools (added 2026-04-25 v2.2.0)
  "GITHUB_TOKEN",
  "VERCEL_TOKEN",
  "VERCEL_PROJECT_ID",
  "VERCEL_TEAM_ID",
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_API_KEY",
  "POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "POSTHOG_PROJECT_ID",
  "STRIPE_SECRET_KEY",

  // Feature env vars referenced by other parts of the app
  "EMAIL_ENCRYPTION_KEY",
  "RESEND_API_KEY",
  // TRUELAYER_* decommissioned 2026-04-27. Yapily-only now.
  "YAPILY_APPLICATION_UUID",
  "YAPILY_APPLICATION_SECRET",
];

function status(name: string): { present: boolean; length: number; prefix?: string } {
  const v = process.env[name];
  if (!v) return { present: false, length: 0 };
  return {
    present: true,
    length: v.length,
    // Show only prefix to confirm shape without leaking the secret.
    prefix: v.slice(0, 4) + "…",
  };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result: Record<string, ReturnType<typeof status>> = {};
  for (const name of REQUIRED_VARS) {
    result[name] = status(name);
  }

  // Compute readiness for each MCP tool
  const tool_readiness = {
    github_tools: !!process.env.GITHUB_TOKEN,
    vercel_tool: !!process.env.VERCEL_TOKEN,
    posthog_tool: !!(
      process.env.POSTHOG_PERSONAL_API_KEY ||
      process.env.POSTHOG_API_KEY ||
      process.env.POSTHOG_PROJECT_API_KEY
    ),
    stripe_tool: !!process.env.STRIPE_SECRET_KEY,
    telegram_admin_tool:
      !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_FOUNDER_CHAT_ID,
    finance_snapshot_tool:
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    runtime: "vercel",
    vars: result,
    tool_readiness,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
