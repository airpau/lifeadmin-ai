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

  // Web analytics in the Telegram brief + /analytics command (added 2026-06-01)
  // POSTHOG_PERSONAL_API_KEY (above) is the READ key for insights/funnels.
  // GA4 is optional — wired only when the property id + a service-account
  // credential are present (see src/lib/analytics/posthog-insights.ts).
  "GOOGLE_ANALYTICS_PROPERTY_ID",
  "GA4_SERVICE_ACCOUNT_JSON",
  "GA4_CLIENT_EMAIL",
  "GA4_PRIVATE_KEY",

  // Feature env vars referenced by other parts of the app
  "EMAIL_ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "YAPILY_APPLICATION_UUID",
  "YAPILY_APPLICATION_SECRET",

  // Yapily Hosted Pages flow gate (build review, 2026-07-29). Must be
  // exactly "true" or the app silently falls back to the legacy
  // /account-auth-requests flow. The route reports a 4-char prefix, and
  // the prefix of "true" is the whole value — so this is a full readout.
  "YAPILY_HOSTED_PAGES_ENABLED",

  // Awin publisher API. Without it, awin-programme-sync cannot run, and
  // the deals catalogue cannot be checked against the programmes we
  // have actually joined — which is how it came to advertise thirty
  // merchants we had no relationship with. Format is a UUID.
  "AWIN_API_TOKEN",

  // Higgsfield became the DEFAULT image generator on 23 Aug 2026. Auth is a
  // key PAIR. If either half is missing, the social cron logs a warning and
  // silently falls back to fal.ai — the post still goes out, so the only
  // symptom is that the switch quietly never took effect. Hence checking it
  // here rather than waiting to notice.
  "HIGGSFIELD_API_KEY_ID",
  "HIGGSFIELD_API_KEY_SECRET",
  "HIGGSFIELD_API_KEY",
  "FAL_KEY",

  // The Meta system-user token the social cron posts with. A short-lived user
  // token here is why 2026-08-22 published nothing.
  "META_ACCESS_TOKEN",
  "META_PAGE_ID",
  "META_INSTAGRAM_ACCOUNT_ID",
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
    // True when the social cron will actually use Higgsfield. False means it
    // still works, but falls back to fal.ai.
    higgsfield_generator:
      !!(
        (process.env.HIGGSFIELD_API_KEY_ID && process.env.HIGGSFIELD_API_KEY_SECRET) ||
        (process.env.HIGGSFIELD_API_KEY || "").includes(":")
      ),
    social_posting: !!process.env.META_ACCESS_TOKEN && !!process.env.META_PAGE_ID,
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
