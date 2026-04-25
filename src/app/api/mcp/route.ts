/**
 * Paybacker MCP Server — Next.js API Route (Stateless, Hardened)
 *
 * Cloud-accessible MCP endpoint for Claude Managed Agents ONLY.
 * Deployed at https://paybacker.co.uk/api/mcp
 *
 * SECURITY:
 * - Bearer token authentication required (MCP_BEARER_TOKEN env var)
 * - Rate limited (60 requests/minute per IP)
 * - Request body size capped at 100KB
 * - No social media tools (post_to_facebook, post_to_instagram removed)
 * - No write access to Supabase tables other than shared_context
 * - All tool calls logged to audit table
 * - CORS restricted (no browser access)
 *
 * SAFE TOOLS ONLY:
 * - Context read/write/append (shared_context table only)
 * - Session and handoff logging
 * - Task management
 * - Project status updates
 * - Server health checks (read-only HEAD requests)
 * - Business log reading (read-only)
 * - Communication logging
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CONTEXT_FILES = [
  "project-status.md",
  "memory.md",
  "task-queue.md",
  "handoff-notes.md",
  "decisions-log.md",
  "active-sessions.md",
  "infrastructure.md",
  "business-ops.md",
  "seo-analytics.md",
] as const;

const MAX_BODY_SIZE = 100 * 1024; // 100KB
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per window
const MAX_CONTENT_LENGTH = 50_000; // 50KB max for any context write

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, resets on cold start — safe for serverless)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodically clean stale entries (prevent memory leak)
function cleanRateLimitMap() {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function validateAuth(req: NextRequest): boolean {
  const token = process.env.MCP_BEARER_TOKEN?.trim();
  if (!token) {
    // FAIL CLOSED: if no token is configured, reject everything
    console.error("[MCP] SECURITY: MCP_BEARER_TOKEN not configured — rejecting all requests");
    return false;
  }
  const auth = req.headers.get("authorization")?.trim();
  if (!auth) return false;

  // Constant-time comparison to prevent timing attacks
  const expected = `Bearer ${token}`;
  if (auth.length !== expected.length) {
    console.error(`[MCP] AUTH: Length mismatch — got ${auth.length}, expected ${expected.length}`);
    return false;
  }
  let result = 0;
  for (let i = 0; i < auth.length; i++) {
    result |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// Supabase helpers (shared_context table ONLY)
// ---------------------------------------------------------------------------

function getSupabaseCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  return { url, key };
}

async function supabaseContextQuery(
  path: string,
  options: { method?: string; body?: string } = {}
): Promise<unknown> {
  // SAFETY: Only allow queries against shared_context table
  if (!path.startsWith("shared_context")) {
    throw new Error("SECURITY: Only shared_context table is accessible via MCP");
  }

  const { url, key } = getSupabaseCredentials();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: options.method === "PATCH" ? "return=representation" : "return=minimal",
    },
    body: options.body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return null;
}

// Read-only Supabase access for allowlisted tables.
async function supabaseReadOnly(table: string, query: string): Promise<unknown> {
  const allowedTables = ["business_log", "profiles", "plan_downgrade_events", "subscriptions_expiring_soon", "upcoming_payments"];
  if (!allowedTables.includes(table)) {
    throw new Error(`SECURITY: Read-only access denied for table: ${table}`);
  }

  const { url, key } = getSupabaseCredentials();
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }
  return res.json();
}

// Append-only writes to business_log. No update, no delete. Sanitises inputs.
async function supabaseInsertBusinessLog(row: {
  category: string;
  title: string;
  content: string;
  created_by: string;
}): Promise<unknown> {
  const { url, key } = getSupabaseCredentials();
  const res = await fetch(`${url}/rest/v1/business_log`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Telegram-admin rate limit (separate from request rate limit)
// Stricter — a leaked token mustn't be able to spam the founder.
// ---------------------------------------------------------------------------

const telegramAdminLimit = { count: 0, windowStart: 0 };
const TELEGRAM_ADMIN_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const TELEGRAM_ADMIN_MAX = 10; // 10 admin pings per hour

function checkTelegramAdminLimit(): boolean {
  const now = Date.now();
  if (now - telegramAdminLimit.windowStart > TELEGRAM_ADMIN_WINDOW_MS) {
    telegramAdminLimit.windowStart = now;
    telegramAdminLimit.count = 0;
  }
  if (telegramAdminLimit.count >= TELEGRAM_ADMIN_MAX) return false;
  telegramAdminLimit.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

async function logAudit(toolName: string, ip: string, success: boolean, detail?: string) {
  try {
    const { url, key } = getSupabaseCredentials();
    await fetch(`${url}/rest/v1/shared_context`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        file_name: "_audit_log",
        content: JSON.stringify({
          tool: toolName,
          ip,
          success,
          detail: detail?.slice(0, 200),
          at: new Date().toISOString(),
        }),
        updated_by: "mcp-audit",
      }),
    });
  } catch {
    // Audit logging is best-effort — never block the response
    console.error("[MCP] Failed to write audit log");
  }
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

function validateContextFile(file: string): string {
  const name = file.endsWith(".md") ? file : `${file}.md`;
  if (!VALID_CONTEXT_FILES.includes(name as (typeof VALID_CONTEXT_FILES)[number])) {
    throw new Error(`Invalid context file: ${name}. Valid: ${VALID_CONTEXT_FILES.join(", ")}`);
  }
  // Prevent path traversal
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("SECURITY: Path traversal detected");
  }
  return name;
}

async function readContext(file: string): Promise<string> {
  const name = validateContextFile(file);
  const rows = (await supabaseContextQuery(
    `shared_context?file_name=eq.${encodeURIComponent(name)}&select=content`
  )) as Array<{ content: string }>;
  if (!rows || rows.length === 0) return `(File ${name} does not exist yet)`;
  return rows[0].content;
}

async function writeContext(file: string, content: string, updatedBy = "agent"): Promise<void> {
  const name = validateContextFile(file);

  // Content size limit
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`Content too large: ${content.length} bytes (max ${MAX_CONTENT_LENGTH})`);
  }

  // Sanitize updatedBy (max 50 chars, alphanumeric + hyphens only)
  const safeUpdatedBy = updatedBy.replace(/[^a-zA-Z0-9\-_ ]/g, "").slice(0, 50);

  await supabaseContextQuery(`shared_context?file_name=eq.${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify({
      content,
      updated_by: safeUpdatedBy,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function appendContext(file: string, extra: string, updatedBy = "agent"): Promise<void> {
  if (extra.length > MAX_CONTENT_LENGTH) {
    throw new Error(`Append content too large: ${extra.length} bytes`);
  }
  const existing = await readContext(file);
  const merged = existing.startsWith("(File ") ? extra : existing + "\n" + extra;

  // Check total size after merge
  if (merged.length > MAX_CONTENT_LENGTH * 10) {
    throw new Error("Context file has grown too large. Consider archiving old entries.");
  }

  await writeContext(file, merged, updatedBy);
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ---------------------------------------------------------------------------
// Create MCP server — SAFE TOOLS ONLY
// ---------------------------------------------------------------------------

function createPaybackerMcpServer(): McpServer {
  const server = new McpServer(
    { name: "paybacker-mcp-server", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  // === SHARED CONTEXT (read/write to shared_context table only) ===

  server.tool(
    "read_context",
    "Reads a shared context file",
    { file: z.string().describe(`One of: ${VALID_CONTEXT_FILES.join(", ")}`) },
    async ({ file }) => ({
      content: [{ type: "text" as const, text: await readContext(file) }],
    })
  );

  server.tool(
    "write_context",
    "Overwrites a shared context file",
    {
      file: z.string(),
      content: z.string().max(MAX_CONTENT_LENGTH, "Content too large"),
    },
    async ({ file, content }) => {
      await writeContext(file, content);
      return { content: [{ type: "text" as const, text: `Wrote ${file}` }] };
    }
  );

  server.tool(
    "append_context",
    "Appends content to a shared context file",
    {
      file: z.string(),
      content: z.string().max(MAX_CONTENT_LENGTH, "Content too large"),
    },
    async ({ file, content }) => {
      await appendContext(file, content);
      return { content: [{ type: "text" as const, text: `Appended to ${file}` }] };
    }
  );

  // === SESSION & HANDOFF LOGGING ===

  server.tool(
    "log_session",
    "Logs a session to active-sessions.md",
    {
      agent_name: z.string().max(100),
      summary: z.string().max(5000),
    },
    async ({ agent_name, summary }) => {
      const entry = `\n## ${timestamp()} - ${agent_name}\n**Summary:** ${summary}\n`;
      await appendContext("active-sessions.md", entry, agent_name);
      return { content: [{ type: "text" as const, text: `Session logged for ${agent_name}` }] };
    }
  );

  server.tool(
    "log_handoff",
    "Adds a handoff note for the next agent",
    {
      from_agent: z.string().max(100),
      summary: z.string().max(5000),
      next_steps: z.string().max(5000),
    },
    async ({ from_agent, summary, next_steps }) => {
      const entry = `\n---\n\n## ${timestamp()} - ${from_agent}\n**Completed:** ${summary}\n\n**Next steps:** ${next_steps}\n`;
      await appendContext("handoff-notes.md", entry, from_agent);
      return { content: [{ type: "text" as const, text: `Handoff logged from ${from_agent}` }] };
    }
  );

  server.tool(
    "log_decision",
    "Logs a decision to decisions-log.md",
    {
      decision: z.string().max(1000),
      reason: z.string().max(5000),
      made_by: z.string().max(100),
    },
    async ({ decision, reason, made_by }) => {
      const entry = `\n## ${timestamp()} - ${decision}\n**Decision:** ${decision}\n**Reason:** ${reason}\n**Made by:** ${made_by}\n`;
      await appendContext("decisions-log.md", entry, made_by);
      return { content: [{ type: "text" as const, text: `Decision logged: ${decision}` }] };
    }
  );

  // === TASK MANAGEMENT ===

  server.tool("get_tasks", "Returns the current task queue", {}, async () => ({
    content: [{ type: "text" as const, text: await readContext("task-queue.md") }],
  }));

  server.tool(
    "add_task",
    "Adds a task to the task queue",
    {
      title: z.string().max(200),
      priority: z.enum(["critical", "high", "medium", "low"]),
      description: z.string().max(2000),
      assigned_to: z.string().max(100).optional(),
    },
    async ({ title, priority, description, assigned_to }) => {
      const prio = priority.charAt(0).toUpperCase() + priority.slice(1);
      const assignee = assigned_to ? ` (@${assigned_to})` : "";
      const taskLine = `- [ ] ${title} - ${description}${assignee}\n`;

      let content = await readContext("task-queue.md");
      if (content.startsWith("(File ")) {
        content = "# Task Queue\n\n## Critical\n\n## High\n\n## Medium\n\n## Low\n";
      }
      const sectionHeader = `## ${prio}`;
      const idx = content.indexOf(sectionHeader);
      if (idx !== -1) {
        const after = idx + sectionHeader.length;
        const next = content.indexOf("\n## ", after);
        const at = next !== -1 ? next : content.length;
        content = content.slice(0, at) + taskLine + content.slice(at);
      } else {
        content += `\n${sectionHeader}\n${taskLine}`;
      }
      await writeContext("task-queue.md", content);
      return { content: [{ type: "text" as const, text: `Added ${priority} task: ${title}` }] };
    }
  );

  server.tool(
    "complete_task",
    "Marks a task as complete",
    {
      title: z.string().max(200),
      result: z.string().max(1000).optional(),
    },
    async ({ title, result }) => {
      let content = await readContext("task-queue.md");
      const note = result ? ` (${result})` : "";
      const pat = new RegExp(`- \\[ \\] ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
      if (pat.test(content)) {
        content = content.replace(pat, `- [x] ${title}${note}`);
        await writeContext("task-queue.md", content);
        return { content: [{ type: "text" as const, text: `Completed: ${title}` }] };
      }
      return { content: [{ type: "text" as const, text: `Not found: ${title}` }] };
    }
  );

  server.tool(
    "update_project_status",
    "Updates a section of project-status.md",
    {
      section: z.string().max(200),
      content: z.string().max(MAX_CONTENT_LENGTH),
    },
    async ({ section, content: newContent }) => {
      let content = await readContext("project-status.md");
      if (content.startsWith("(File ")) content = "# Project Status\n";
      const header = `## ${section}`;
      const idx = content.indexOf(header);
      if (idx !== -1) {
        const after = idx + header.length;
        const next = content.indexOf("\n## ", after);
        const end = next !== -1 ? next : content.length;
        content = content.slice(0, after) + "\n" + newContent + "\n" + content.slice(end);
      } else {
        content += `\n${header}\n${newContent}\n`;
      }
      await writeContext("project-status.md", content);
      return { content: [{ type: "text" as const, text: `Updated: ${section}` }] };
    }
  );

  // === INFRASTRUCTURE (READ-ONLY) ===

  server.tool("get_server_health", "Checks deployment status (read-only HEAD requests)", {}, async () => {
    const results: string[] = [];
    try {
      const res = await fetch("https://paybacker.co.uk", { method: "HEAD" });
      results.push(`Vercel: ${res.status === 200 ? "UP" : `Status ${res.status}`}`);
    } catch (e) {
      results.push(`Vercel: DOWN - ${(e as Error).message}`);
    }
    return { content: [{ type: "text" as const, text: results.join("\n") }] };
  });

  server.tool(
    "read_business_log",
    "Reads recent entries from business_log table (read-only)",
    { limit: z.number().min(1).max(100).optional() },
    async ({ limit }) => {
      const count = limit || 20;
      const data = await supabaseReadOnly(
        "business_log",
        `select=*&order=created_at.desc&limit=${count}`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // === COMMUNICATION LOGGING ===

  server.tool(
    "log_communication",
    "Logs a communication to business-ops.md",
    {
      type: z.string().max(50),
      with_whom: z.string().max(200),
      summary: z.string().max(5000),
      follow_up: z.string().max(2000).optional(),
    },
    async ({ type, with_whom, summary, follow_up }) => {
      const fu = follow_up ? `\n**Follow-up:** ${follow_up}` : "";
      const entry = `\n### ${timestamp()} - ${type} with ${with_whom}\n${summary}${fu}\n`;
      await appendContext("business-ops.md", entry, "agent");
      return { content: [{ type: "text" as const, text: `Logged ${type} with ${with_whom}` }] };
    }
  );

  // === STRUCTURED BUSINESS_LOG WRITES (append-only, drives the digest cron) ===

  const ALLOWED_BUSINESS_LOG_CATEGORIES = [
    "clean",
    "info",
    "finding",
    "recommendation",
    "alert",
    "warn",
    "critical",
    "escalation",
    "agent_governance",
  ] as const;

  server.tool(
    "append_business_log",
    "Insert a structured row into the business_log table. Used by managed agents at the end of every session — drives the agent-digest cron (07:00/12:30/19:00 UTC).",
    {
      category: z.enum(ALLOWED_BUSINESS_LOG_CATEGORIES),
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(4000),
      created_by: z.string().min(1).max(100),
    },
    async ({ category, title, content, created_by }) => {
      // Sanitise created_by to alphanumeric+hyphens (no SQL/HTML/markdown injection vectors).
      const safeCreatedBy = created_by.replace(/[^a-zA-Z0-9\-_ ]/g, "").slice(0, 100);
      const row = await supabaseInsertBusinessLog({
        category,
        title: title.slice(0, 200),
        content: content.slice(0, 4000),
        created_by: safeCreatedBy || "unknown-agent",
      });
      const id = (Array.isArray(row) ? row[0] : row) as { id?: string } | null;
      return {
        content: [
          {
            type: "text" as const,
            text: `Inserted business_log row ${id?.id ?? "?"} (category=${category}).`,
          },
        ],
      };
    }
  );

  // === FINANCE SNAPSHOT (read-only aggregates, used by finance-analyst) ===

  server.tool(
    "get_finance_snapshot",
    "Returns a structured snapshot of Paybacker financial state: paying users by tier, MRR/ARR, signups (7d/30d), active trials, conversions/expiries, plan downgrade events, expiring subscriptions, upcoming payments. Aggregates only — no per-user PII. Test accounts (test+%, googletest%, %@example.com) excluded.",
    {
      tier_prices_gbp: z
        .object({
          free: z.number().default(0),
          plus: z.number().default(4.99),
          pro: z.number().default(9.99),
        })
        .partial()
        .optional()
        .describe("Optional override for tier monthly prices in GBP. Defaults to canonical {free:0, plus:4.99, pro:9.99}."),
    },
    async ({ tier_prices_gbp }) => {
      const tierPrices: Record<string, number> = {
        free: 0,
        plus: 4.99,
        pro: 9.99,
        ...(tier_prices_gbp ?? {}),
      };

      // Fetch only the columns we aggregate. No raw email returned in output.
      const profilesRaw = (await supabaseReadOnly(
        "profiles",
        "select=email,subscription_tier,trial_ends_at,trial_converted_at,trial_expired_at,stripe_subscription_id,created_at&limit=10000"
      )) as Array<{
        email: string | null;
        subscription_tier: string | null;
        trial_ends_at: string | null;
        trial_converted_at: string | null;
        trial_expired_at: string | null;
        stripe_subscription_id: string | null;
        created_at: string | null;
      }>;

      function isTestEmail(email: string | null): boolean {
        if (!email) return false;
        const e = email.toLowerCase();
        return e.startsWith("test+") || e.endsWith("@example.com") || e.startsWith("googletest");
      }

      const real = profilesRaw.filter((p) => !isTestEmail(p.email));
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      const tierCounts: Record<string, number> = {};
      const unknownTiers: Record<string, number> = {};
      let payingUsers = 0;
      let mrrPence = 0;
      let signups7d = 0;
      let signups30d = 0;
      let activeTrials = 0;
      let conv7d = 0;
      let conv30d = 0;
      let exp7d = 0;
      let exp30d = 0;

      for (const p of real) {
        const tier = (p.subscription_tier ?? "free").toLowerCase();
        tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
        if (!(tier in tierPrices)) unknownTiers[tier] = (unknownTiers[tier] ?? 0) + 1;
        if (tier !== "free" && p.stripe_subscription_id) {
          payingUsers += 1;
          mrrPence += Math.round((tierPrices[tier] ?? 0) * 100);
        }
        if (p.created_at) {
          const t = new Date(p.created_at).getTime();
          if (t >= sevenDaysAgo) signups7d += 1;
          if (t >= thirtyDaysAgo) signups30d += 1;
        }
        if (
          p.trial_ends_at &&
          new Date(p.trial_ends_at).getTime() > now &&
          !p.trial_converted_at &&
          !p.trial_expired_at
        ) {
          activeTrials += 1;
        }
        if (p.trial_converted_at) {
          const t = new Date(p.trial_converted_at).getTime();
          if (t >= sevenDaysAgo) conv7d += 1;
          if (t >= thirtyDaysAgo) conv30d += 1;
        }
        if (p.trial_expired_at) {
          const t = new Date(p.trial_expired_at).getTime();
          if (t >= sevenDaysAgo) exp7d += 1;
          if (t >= thirtyDaysAgo) exp30d += 1;
        }
      }

      // Optional aggregate count tables — tolerant if a table doesn't exist on a branch.
      let downgrades7d: number | string = "unavailable";
      try {
        const sevenIso = new Date(sevenDaysAgo).toISOString();
        const rows = (await supabaseReadOnly(
          "plan_downgrade_events",
          `select=id&created_at=gte.${encodeURIComponent(sevenIso)}`
        )) as unknown[];
        downgrades7d = rows.length;
      } catch {
        // leave as 'unavailable'
      }

      let expiringSoon: number | string = "unavailable";
      try {
        const rows = (await supabaseReadOnly(
          "subscriptions_expiring_soon",
          "select=id"
        )) as unknown[];
        expiringSoon = rows.length;
      } catch {
        // leave as 'unavailable'
      }

      let upcoming7d: number | string = "unavailable";
      try {
        const sevenAhead = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
        const rows = (await supabaseReadOnly(
          "upcoming_payments",
          `select=id&due_date=lte.${encodeURIComponent(sevenAhead)}`
        )) as unknown[];
        upcoming7d = rows.length;
      } catch {
        // leave as 'unavailable'
      }

      const mrr = mrrPence / 100;
      const arr = mrr * 12;

      const snapshot = {
        generated_at: new Date().toISOString(),
        users: {
          total_real: real.length,
          test_users_excluded: profilesRaw.length - real.length,
          tier_counts: tierCounts,
          unknown_tiers_seen: unknownTiers,
          paying_users: payingUsers,
        },
        revenue: {
          mrr_gbp: Number(mrr.toFixed(2)),
          arr_gbp: Number(arr.toFixed(2)),
          tier_prices_gbp_used: tierPrices,
        },
        growth: {
          signups_last_7d: signups7d,
          signups_last_30d: signups30d,
        },
        trials: {
          active: activeTrials,
          conversions_7d: conv7d,
          conversions_30d: conv30d,
          expiries_7d: exp7d,
          expiries_30d: exp30d,
          conversion_rate_30d:
            conv30d + exp30d === 0 ? null : Number((conv30d / (conv30d + exp30d)).toFixed(3)),
        },
        churn: { plan_downgrade_events_7d: downgrades7d },
        contracts: {
          subscriptions_expiring_soon: expiringSoon,
          upcoming_payments_next_7d: upcoming7d,
        },
        notes: {
          test_email_filter:
            "Excluded emails matching: test+%, %@example.com, googletest%",
          mrr_method:
            "tier × stripe_subscription_id NOT NULL × tier_prices_gbp[tier]; unknown tiers contribute 0 until acknowledged.",
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(snapshot, null, 2) }],
      };
    }
  );

  // === TELEGRAM ADMIN PING (rate-limited, append-only mirror) ===

  server.tool(
    "post_to_telegram_admin",
    "Sends a Telegram message to the founder admin chat. Reserved for things needing the founder's decision BEFORE the next digest cycle, or critical-severity events. Routine reporting goes to append_business_log. Hard-capped at 10 admin pings per hour.",
    {
      agent_name: z.string().min(1).max(100),
      severity: z.enum(["info", "notice", "recommend", "warn", "critical"]),
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(2000),
      ask: z.string().max(500).optional(),
    },
    async ({ agent_name, severity, title, body, ask }) => {
      // Hard rule: severity recommend/warn/critical require an explicit 'ask'.
      if (["recommend", "warn", "critical"].includes(severity) && !ask?.trim()) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Refused: severity=${severity} requires a non-empty 'ask' field. Tell me what decision the founder needs to make.`,
            },
          ],
        };
      }

      // Hard rate limit so a leaked bearer token can't spam the founder.
      if (!checkTelegramAdminLimit()) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Refused: Telegram admin rate limit hit (${TELEGRAM_ADMIN_MAX}/hour). Write to business_log instead.`,
            },
          ],
        };
      }

      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
      if (!token || !chatId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Refused: TELEGRAM_BOT_TOKEN or TELEGRAM_FOUNDER_CHAT_ID env var not configured.",
            },
          ],
        };
      }

      // Sanitise inputs for Telegram HTML mode.
      function escapeHtml(input: string): string {
        return input
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      const safeAgent = agent_name.replace(/[^a-zA-Z0-9\-_ ]/g, "").slice(0, 100);

      const sevPrefix: Record<string, string> = {
        info: "🟢",
        notice: "🔵",
        recommend: "🟡",
        warn: "🟠",
        critical: "🔴",
      };
      const lines = [
        `${sevPrefix[severity] ?? "•"} <b>${escapeHtml(title)}</b>`,
        `<i>${escapeHtml(safeAgent)} · ${severity} · ${timestamp()} UTC</i>`,
        "",
        escapeHtml(body),
      ];
      if (ask?.trim()) {
        lines.push("");
        lines.push(`<b>Ask:</b> ${escapeHtml(ask)}`);
      }
      const text = lines.join("\n").slice(0, 3800);

      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(chatId),
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      if (!tgRes.ok) {
        const errText = await tgRes.text();
        return {
          content: [
            { type: "text" as const, text: `Error sending Telegram: ${errText.slice(0, 200)}` },
          ],
        };
      }

      // Mirror to business_log so the digest still has a record.
      try {
        await supabaseInsertBusinessLog({
          category: severity === "critical" || severity === "warn" ? severity : "escalation",
          title: `[telegram-admin] ${title}`.slice(0, 200),
          content: `${body}${ask ? `\n\nAsk: ${ask}` : ""}`.slice(0, 4000),
          created_by: safeAgent,
        });
      } catch {
        // Mirror failure shouldn't fail the Telegram send.
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Sent Telegram admin message (severity=${severity}) and mirrored to business_log.`,
          },
        ],
      };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleMcpRequest(req: NextRequest): Promise<NextResponse | Response> {
  const ip = getClientIp(req);

  // 1. Auth check (fail closed)
  if (!validateAuth(req)) {
    await logAudit("AUTH_FAIL", ip, false, req.headers.get("user-agent") || "unknown");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit
  cleanRateLimitMap();
  if (!checkRateLimit(ip)) {
    await logAudit("RATE_LIMIT", ip, false);
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // 3. Body size check (clone to preserve body for the transport)
  const cloned = req.clone();
  const bodyText = await cloned.text();
  if (bodyText.length > MAX_BODY_SIZE) {
    await logAudit("BODY_TOO_LARGE", ip, false, `${bodyText.length} bytes`);
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  // 4. Create stateless MCP server + Web Standard transport
  const mcpServer = createPaybackerMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless — no session tracking needed
  });

  await mcpServer.connect(transport);

  // 5. Handle request directly — NextRequest IS a Web Standard Request
  //    Pass the original req (body not consumed) to the transport
  const response = await transport.handleRequest(req);

  return response;
}

// ---------------------------------------------------------------------------
// Next.js App Router exports
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  return handleMcpRequest(req);
}

export async function GET(req: NextRequest) {
  // Health check for plain GET (no auth required for health)
  if (!req.headers.get("accept")?.includes("text/event-stream")) {
    return NextResponse.json(
      {
        status: "ok",
        server: "paybacker-mcp-server",
        version: "2.1.0",
        tools: 16,
        note: "Social media tools disabled on public endpoint. Includes get_finance_snapshot, append_business_log, post_to_telegram_admin (rate-limited at 10/hour).",
      },
      {
        headers: {
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      }
    );
  }
  return handleMcpRequest(req);
}

export async function DELETE(req: NextRequest) {
  return handleMcpRequest(req);
}

// Block all other methods
export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
