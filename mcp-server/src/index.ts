#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

// Constants
// PROJECT_DIR can be overridden via env var so this MCP works on any machine
// (previously hard-coded to a stale ~/.openclaw path that no longer exists).
const PROJECT_DIR =
  process.env.PAYBACKER_PROJECT_DIR || "/Users/paul-ops/lifeadmin-ai";
const CONTEXT_DIR = join(PROJECT_DIR, "shared-context");
const FACEBOOK_PAGE_ID = "1056645287525328";
const INSTAGRAM_ID = "17841440175351137";
const META_API_VERSION = "v25.0";

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
];

// Helpers
function ensureContextDir(): void {
  if (!existsSync(CONTEXT_DIR)) {
    mkdirSync(CONTEXT_DIR, { recursive: true });
  }
}

function resolveContextFile(file: string): string {
  const name = file.endsWith(".md") ? file : `${file}.md`;
  if (!VALID_CONTEXT_FILES.includes(name)) {
    throw new Error(`Invalid context file: ${name}. Valid files: ${VALID_CONTEXT_FILES.join(", ")}`);
  }
  return join(CONTEXT_DIR, name);
}

function readContextFile(file: string): string {
  const path = resolveContextFile(file);
  if (!existsSync(path)) {
    return `(File ${file} does not exist yet)`;
  }
  return readFileSync(path, "utf-8");
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function getMetaToken(): string {
  const token = process.env.PAYBACKER_META_TOKEN;
  if (!token) throw new Error("PAYBACKER_META_TOKEN env var not set");
  return token;
}

function getSupabaseCredentials(): { url: string; key: string } {
  const url = process.env.PAYBACKER_SUPABASE_URL;
  const key = process.env.PAYBACKER_SUPABASE_KEY;
  if (!url || !key) throw new Error("PAYBACKER_SUPABASE_URL and PAYBACKER_SUPABASE_KEY env vars required");
  return { url, key };
}

function getTelegramAdminCredentials(): { token: string; chatId: string } {
  const token = process.env.PAYBACKER_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId =
    process.env.PAYBACKER_TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) {
    throw new Error(
      "PAYBACKER_TELEGRAM_BOT_TOKEN (or TELEGRAM_BOT_TOKEN) and PAYBACKER_TELEGRAM_ADMIN_CHAT_ID (or TELEGRAM_FOUNDER_CHAT_ID) env vars required",
    );
  }
  return { token, chatId };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TELEGRAM_SEVERITY_PREFIX: Record<string, string> = {
  info: "🟢",
  notice: "🔵",
  recommend: "🟡",
  warn: "🟠",
  critical: "🔴",
};

// Tool definitions
const TOOLS = [
  // --- Session bootstrap (call this FIRST in any new Paybacker chat) ---
  {
    name: "get_project_briefing",
    description:
      "Returns a single consolidated briefing for the Paybacker project: all shared-context files, current git status, open PRs, and recent business_log entries. Call this at the START of any new chat to pick up where the last session left off. Replaces having to call read_context 9 times + get_git_status + read_business_log separately.",
    inputSchema: {
      type: "object" as const,
      properties: {
        business_log_limit: {
          type: "number",
          description: "How many recent business_log rows to include (default 10)",
        },
        include_git: {
          type: "boolean",
          description: "Include git status + recent commits + open PRs (default true)",
        },
      },
    },
  },
  // Shared Context Tools
  {
    name: "read_context",
    description: "Reads a shared context file from the shared-context directory",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: {
          type: "string",
          description: `Context file to read. One of: ${VALID_CONTEXT_FILES.join(", ")}`,
        },
      },
      required: ["file"],
    },
  },
  {
    name: "write_context",
    description: "Overwrites a shared context file with new content",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: { type: "string", description: "Context file to write" },
        content: { type: "string", description: "New content for the file" },
      },
      required: ["file", "content"],
    },
  },
  {
    name: "append_context",
    description: "Appends content to a shared context file (useful for logs)",
    inputSchema: {
      type: "object" as const,
      properties: {
        file: { type: "string", description: "Context file to append to" },
        content: { type: "string", description: "Content to append" },
      },
      required: ["file", "content"],
    },
  },
  {
    name: "log_session",
    description: "Logs a session start/end to active-sessions.md",
    inputSchema: {
      type: "object" as const,
      properties: {
        interface: {
          type: "string",
          description: "Which Claude interface (Claude Code SSH, Claude Desktop, Chrome Extension)",
        },
        summary: { type: "string", description: "What was done in this session" },
      },
      required: ["interface", "summary"],
    },
  },
  {
    name: "log_handoff",
    description: "Adds a handoff note for the next session/interface to pick up",
    inputSchema: {
      type: "object" as const,
      properties: {
        from_interface: { type: "string", description: "Which interface is handing off" },
        summary: { type: "string", description: "What was completed" },
        next_steps: { type: "string", description: "What the next session should do" },
      },
      required: ["from_interface", "summary", "next_steps"],
    },
  },
  {
    name: "log_decision",
    description: "Logs a business or technical decision to decisions-log.md",
    inputSchema: {
      type: "object" as const,
      properties: {
        decision: { type: "string", description: "The decision made" },
        reason: { type: "string", description: "Why this decision was made" },
        made_by: { type: "string", description: "Who made the decision" },
      },
      required: ["decision", "reason", "made_by"],
    },
  },
  // Task Management
  {
    name: "get_tasks",
    description: "Returns the current task queue from task-queue.md",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "add_task",
    description: "Adds a task to the task queue",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title" },
        priority: {
          type: "string",
          enum: ["critical", "high", "medium", "low"],
          description: "Task priority",
        },
        description: { type: "string", description: "Task description" },
        assigned_to: { type: "string", description: "Optional: who this task is assigned to" },
      },
      required: ["title", "priority", "description"],
    },
  },
  {
    name: "complete_task",
    description: "Marks a task as complete in the task queue",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title to mark as done" },
        result: { type: "string", description: "Optional: result or notes about completion" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_project_status",
    description: "Updates a section of project-status.md",
    inputSchema: {
      type: "object" as const,
      properties: {
        section: { type: "string", description: "Section heading to update (e.g. 'Current Sprint')" },
        content: { type: "string", description: "New content for this section" },
      },
      required: ["section", "content"],
    },
  },
  // Social Media
  {
    name: "post_to_facebook",
    description: "Posts a message to the Paybacker Facebook page",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Post message/caption" },
        image_url: { type: "string", description: "Optional: public URL of image to attach" },
      },
      required: ["message"],
    },
  },
  {
    name: "post_to_instagram",
    description: "Posts to the Paybacker Instagram account (requires image)",
    inputSchema: {
      type: "object" as const,
      properties: {
        caption: { type: "string", description: "Post caption" },
        image_url: { type: "string", description: "Public URL of image to post" },
      },
      required: ["caption", "image_url"],
    },
  },
  {
    name: "get_recent_posts",
    description: "Gets recent posts from Facebook or Instagram",
    inputSchema: {
      type: "object" as const,
      properties: {
        platform: { type: "string", enum: ["facebook", "instagram"], description: "Platform" },
        limit: { type: "number", description: "Number of posts to fetch (default 5)" },
      },
      required: ["platform"],
    },
  },
  // Infrastructure
  {
    name: "git_push",
    description: "Runs git pull --rebase then git push origin master on Paul's machine. Use this after committing changes in the sandbox to push them to GitHub (which auto-deploys to Vercel).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_git_status",
    description: "Returns current git branch, recent commits, and working tree status",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_server_health",
    description: "Checks Railway and Vercel deployment status",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "read_business_log",
    description: "Reads recent entries from the Supabase business_log table",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of entries to fetch (default 20)" },
      },
    },
  },
  // Communication
  {
    name: "log_communication",
    description: "Logs an email, call, or meeting to business-ops.md",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "Type: email, call, meeting, slack, etc." },
        with: { type: "string", description: "Who the communication was with" },
        summary: { type: "string", description: "Summary of what was discussed" },
        follow_up: { type: "string", description: "Optional: follow-up action needed" },
      },
      required: ["type", "with", "summary"],
    },
  },
  {
    name: "get_finance_snapshot",
    description:
      "Returns a structured snapshot of Paybacker's financial state from Supabase: user counts by tier (free/plus/pro), active paying users, estimated MRR + ARR, signups (last 7d/30d), active onboarding trials, trial conversions / expiries (7d/30d), recent plan downgrade events, subscriptions expiring soon, and upcoming payments. Read-only. Use this on every finance-analyst session before reasoning about revenue health.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tier_prices_gbp: {
          type: "object",
          description: "Optional override for tier monthly prices in GBP. Defaults to the canonical {free:0, plus:4.99, pro:9.99} from src/lib/plan-limits.ts. Use only if the live pricing config has changed and you want the agent to compute MRR with new prices.",
        },
      },
    },
  },
  {
    name: "append_business_log",
    description:
      "Inserts a structured row into the Supabase `business_log` table so the agent-digest cron can surface it to the founder. Use this on EVERY managed-agent session to record what you did and what you found, even on clean runs (use category='clean'). Categories that drive escalation in the digest: alert, critical, warn, finding, recommendation, escalation. Routine reporting categories: clean, info, agent_governance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: [
            "clean",
            "info",
            "finding",
            "recommendation",
            "alert",
            "warn",
            "critical",
            "escalation",
            "agent_governance",
          ],
          description: "Severity bucket. 'clean' = nothing to report. 'finding' = pattern noted. 'recommendation' = proposed action, founder decides. 'alert/warn/critical' = degraded → broken. 'escalation' = needs immediate decision.",
        },
        title: {
          type: "string",
          description: "Short headline (max ~80 chars). Verb-led, specific.",
        },
        content: {
          type: "string",
          description: "1–4 sentences. Include evidence pointer (table+row id, log signature). Do NOT paste raw PII or secrets.",
        },
        created_by: {
          type: "string",
          description: "Agent identifier (e.g. 'alert-tester', 'feature-tester', 'digest-compiler').",
        },
      },
      required: ["category", "title", "content", "created_by"],
    },
  },
  {
    name: "post_to_telegram_admin",
    description:
      "Sends a Telegram message to the founder (Paul) admin chat. Reserved for things needing the founder's decision BEFORE the next digest cycle (07:00 / 12:30 / 19:00 UTC), or for critical-severity events. Routine reporting goes to business_log; the digest cron handles routine Telegram surfacing. If unsure: do not use this tool — write to business_log via append_context instead.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_name: {
          type: "string",
          description:
            "Identifier of the agent sending the message (e.g. 'alert-tester', 'feature-tester'). Used in the message header so the founder can see source at a glance.",
        },
        severity: {
          type: "string",
          enum: ["info", "notice", "recommend", "warn", "critical"],
          description:
            "Severity level. info = routine (rarely use). notice = pattern worth noting. recommend = proposed action, founder decides. warn = degraded, founder should know. critical = production impact, immediate.",
        },
        title: {
          type: "string",
          description: "Short headline (max ~80 chars). Verb-led, specific. e.g. 'Riley silent for 3h' or 'Stripe webhook returning 500'.",
        },
        body: {
          type: "string",
          description:
            "1–3 sentence detail with evidence pointer (table+row id, log signature, or shared-context filename). Do NOT paste raw user data or secrets.",
        },
        ask: {
          type: "string",
          description:
            "Single-sentence ask: what decision or action you need from the founder. Required for severity in {recommend, warn, critical}.",
        },
      },
      required: ["agent_name", "severity", "title", "body"],
    },
  },
  {
    name: "get_project_briefing",
    description:
      "Returns a single consolidated briefing for the Paybacker project: all shared-context files, current git status, open PRs, and recent business_log entries. Call this at the START of any new chat to pick up where the last session left off — one call replaces reading 9 context files individually.",
    inputSchema: {
      type: "object" as const,
      properties: {
        business_log_limit: {
          type: "number",
          description: "How many recent business_log rows to include (default 10)",
        },
      },
    },
  },
];

// Tool handlers
async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  ensureContextDir();

  switch (name) {
    // --- Session bootstrap ---
    case "get_project_briefing": {
      const includeGit = args.include_git !== false;
      const logLimit = (args.business_log_limit as number) || 10;
      const sections: string[] = [];

      sections.push("# Paybacker project briefing");
      sections.push(`_Generated: ${timestamp()}_`);
      sections.push(`_Project dir: ${PROJECT_DIR}_`);
      sections.push("");

      // 1. All shared-context files
      sections.push("## Shared context");
      for (const file of VALID_CONTEXT_FILES) {
        const path = join(CONTEXT_DIR, file);
        sections.push(`\n### ${file}`);
        if (existsSync(path)) {
          const body = readFileSync(path, "utf-8").trim();
          sections.push(body || "_(empty)_");
        } else {
          sections.push("_(file does not exist yet)_");
        }
      }

      // 2. Git status
      if (includeGit) {
        sections.push("\n## Git status");
        try {
          const branch = execSync("git branch --show-current", {
            cwd: PROJECT_DIR,
            encoding: "utf-8",
          }).trim();
          const status =
            execSync("git status --short", { cwd: PROJECT_DIR, encoding: "utf-8" }).trim() ||
            "(clean working tree)";
          const log = execSync("git log --oneline -10", {
            cwd: PROJECT_DIR,
            encoding: "utf-8",
          }).trim();
          let prs = "";
          try {
            prs = execSync("gh pr list --limit 5 2>/dev/null || echo '(gh CLI unavailable)'", {
              cwd: PROJECT_DIR,
              encoding: "utf-8",
            }).trim();
          } catch {
            prs = "(could not fetch PRs)";
          }
          sections.push(`**Branch:** ${branch}`);
          sections.push("\n**Working tree:**\n```\n" + status + "\n```");
          sections.push("\n**Recent commits:**\n```\n" + log + "\n```");
          sections.push("\n**Open PRs:**\n```\n" + prs + "\n```");
        } catch (e) {
          sections.push(`_(git status failed: ${(e as Error).message})_`);
        }
      }

      // 3. Recent business_log rows
      sections.push("\n## Recent business_log rows");
      try {
        const { url, key } = getSupabaseCredentials();
        const res = await fetch(
          `${url}/rest/v1/business_log?select=created_at,category,title,content,created_by&order=created_at.desc&limit=${logLimit}`,
          {
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
            },
          },
        );
        const data = (await res.json()) as unknown;
        if (!res.ok) {
          sections.push(`_(business_log fetch failed: ${JSON.stringify(data)})_`);
        } else if (Array.isArray(data) && data.length === 0) {
          sections.push("_(no recent rows)_");
        } else {
          sections.push("```json\n" + JSON.stringify(data, null, 2) + "\n```");
        }
      } catch (e) {
        sections.push(`_(business_log unavailable: ${(e as Error).message})_`);
      }

      sections.push(
        "\n---\nTip: end of session? call `log_session` and `log_handoff` so the next chat inherits the context.",
      );
      return sections.join("\n");
    }

    // --- Shared Context ---
    case "read_context": {
      return readContextFile(args.file as string);
    }

    case "get_project_briefing": {
      const limit = (args.business_log_limit as number) || 10;
      const parts: string[] = [];
      parts.push(`# Paybacker project briefing (generated ${timestamp()})`);
      parts.push("");

      // Shared context files
      parts.push("## Shared context files");
      for (const file of VALID_CONTEXT_FILES) {
        const content = readContextFile(file);
        parts.push(`\n### ${file}\n`);
        parts.push(content);
      }

      // Git status
      parts.push("\n## Git status\n");
      try {
        const branch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: PROJECT_DIR,
          encoding: "utf-8",
        }).trim();
        const status = execSync("git status --short", {
          cwd: PROJECT_DIR,
          encoding: "utf-8",
        });
        const log = execSync("git log --oneline -10", {
          cwd: PROJECT_DIR,
          encoding: "utf-8",
        });
        parts.push(`Branch: ${branch}`);
        parts.push("\nWorking tree:");
        parts.push(status || "(clean)");
        parts.push("\nRecent commits:");
        parts.push(log);
      } catch (e) {
        parts.push(`(git status unavailable: ${(e as Error).message})`);
      }

      // Open PRs
      parts.push("\n## Open PRs\n");
      try {
        const prs = execSync(
          "gh pr list -R airpau/lifeadmin-ai --state open --json number,title,headRefName,author",
          { cwd: PROJECT_DIR, encoding: "utf-8" },
        );
        parts.push(prs || "(none)");
      } catch (e) {
        parts.push(`(gh pr list unavailable: ${(e as Error).message})`);
      }

      // Recent business_log
      parts.push(`\n## Recent business_log (last ${limit})\n`);
      try {
        const { url, key } = getSupabaseCredentials();
        const res = await fetch(
          `${url}/rest/v1/business_log?select=*&order=created_at.desc&limit=${limit}`,
          {
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
            },
          },
        );
        if (res.ok) {
          const rows = (await res.json()) as Array<Record<string, unknown>>;
          parts.push(JSON.stringify(rows, null, 2));
        } else {
          parts.push(`(business_log fetch failed: ${res.status})`);
        }
      } catch (e) {
        parts.push(`(business_log unavailable: ${(e as Error).message})`);
      }

      return parts.join("\n");
    }

    case "write_context": {
      const path = resolveContextFile(args.file as string);
      writeFileSync(path, args.content as string, "utf-8");
      return `Wrote ${args.file}`;
    }

    case "append_context": {
      const path = resolveContextFile(args.file as string);
      appendFileSync(path, "\n" + (args.content as string), "utf-8");
      return `Appended to ${args.file}`;
    }

    case "log_session": {
      const entry = `\n## ${timestamp()} - ${args.interface}\n**Summary:** ${args.summary}\n`;
      const path = resolveContextFile("active-sessions.md");
      appendFileSync(path, entry, "utf-8");
      return `Session logged for ${args.interface}`;
    }

    case "log_handoff": {
      const entry = `\n---\n\n## ${timestamp()} - ${args.from_interface}\n**Completed:** ${args.summary}\n\n**Next steps:** ${args.next_steps}\n`;
      const path = resolveContextFile("handoff-notes.md");
      appendFileSync(path, entry, "utf-8");
      return `Handoff logged from ${args.from_interface}`;
    }

    case "log_decision": {
      const entry = `\n## ${timestamp()} - ${args.decision}\n**Decision:** ${args.decision}\n**Reason:** ${args.reason}\n**Made by:** ${args.made_by}\n`;
      const path = resolveContextFile("decisions-log.md");
      appendFileSync(path, entry, "utf-8");
      return `Decision logged: ${args.decision}`;
    }

    // --- Task Management ---
    case "get_tasks": {
      return readContextFile("task-queue.md");
    }

    case "add_task": {
      const priority = (args.priority as string).charAt(0).toUpperCase() + (args.priority as string).slice(1);
      const assignee = args.assigned_to ? ` (@${args.assigned_to})` : "";
      const entry = `- [ ] ${args.title} - ${args.description}${assignee}\n`;

      const path = resolveContextFile("task-queue.md");
      let content = existsSync(path) ? readFileSync(path, "utf-8") : "# Task Queue\n\n## Critical\n\n## High\n\n## Medium\n\n## Low\n";

      // Find the right priority section and append
      const sectionHeader = `## ${priority}`;
      const sectionIndex = content.indexOf(sectionHeader);
      if (sectionIndex !== -1) {
        // Find the end of this section (next ## or end of file)
        const afterHeader = sectionIndex + sectionHeader.length;
        const nextSection = content.indexOf("\n## ", afterHeader);
        const insertAt = nextSection !== -1 ? nextSection : content.length;
        content = content.slice(0, insertAt) + entry + content.slice(insertAt);
      } else {
        content += `\n${sectionHeader}\n${entry}`;
      }

      writeFileSync(path, content, "utf-8");
      return `Added ${args.priority} task: ${args.title}`;
    }

    case "complete_task": {
      const path = resolveContextFile("task-queue.md");
      if (!existsSync(path)) return "No task queue found";

      let content = readFileSync(path, "utf-8");
      const title = args.title as string;
      const result = args.result ? ` (${args.result})` : "";

      // Replace "- [ ] Title" with "- [x] Title (result)"
      const pattern = new RegExp(`- \\[ \\] ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
      if (pattern.test(content)) {
        content = content.replace(pattern, `- [x] ${title}${result}`);
        writeFileSync(path, content, "utf-8");
        return `Completed task: ${title}`;
      }
      return `Task not found: ${title}`;
    }

    case "update_project_status": {
      const path = resolveContextFile("project-status.md");
      let content = existsSync(path) ? readFileSync(path, "utf-8") : "# Project Status\n";

      const section = args.section as string;
      const sectionHeader = `## ${section}`;
      const sectionIndex = content.indexOf(sectionHeader);

      if (sectionIndex !== -1) {
        const afterHeader = sectionIndex + sectionHeader.length;
        const nextSection = content.indexOf("\n## ", afterHeader);
        const endOfSection = nextSection !== -1 ? nextSection : content.length;
        content = content.slice(0, afterHeader) + "\n" + (args.content as string) + "\n" + content.slice(endOfSection);
      } else {
        content += `\n${sectionHeader}\n${args.content as string}\n`;
      }

      writeFileSync(path, content, "utf-8");
      return `Updated project status section: ${section}`;
    }

    // --- Social Media ---
    case "get_finance_snapshot": {
      const { url, key } = getSupabaseCredentials();
      const tierPricesArg = args.tier_prices_gbp as Record<string, number> | undefined;
      const tierPrices: Record<string, number> = tierPricesArg ?? {
        free: 0,
        plus: 4.99,
        pro: 9.99,
      };

      const headers = {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      };

      // Filter out test/demo accounts so MRR reflects real users.
      // Test pattern: email ILIKE 'test+%' OR ILIKE '%@example.com' OR ILIKE 'googletest%'
      const testEmailFilter =
        "or=(email.ilike.test+%25,email.ilike.%25@example.com,email.ilike.googletest%25)";

      // We do two queries: one with the test filter to subtract, one without.
      // Supabase REST doesn't support NOT(or=…) cleanly, so we fetch all profiles' tier
      // + email and aggregate locally — fast for our size and trivial to filter.
      const profilesUrl = `${url}/rest/v1/profiles?select=id,email,subscription_tier,trial_ends_at,trial_converted_at,trial_expired_at,stripe_subscription_id,onboarded_at,created_at&limit=10000`;
      const profilesRes = await fetch(profilesUrl, { headers });
      if (!profilesRes.ok) {
        return `Error fetching profiles: ${await profilesRes.text()}`;
      }
      const allProfiles = (await profilesRes.json()) as Array<{
        id: string;
        email: string | null;
        subscription_tier: string | null;
        trial_ends_at: string | null;
        trial_converted_at: string | null;
        trial_expired_at: string | null;
        stripe_subscription_id: string | null;
        onboarded_at: string | null;
        created_at: string | null;
      }>;

      function isTestEmail(email: string | null): boolean {
        if (!email) return false;
        const e = email.toLowerCase();
        return (
          e.startsWith("test+") ||
          e.endsWith("@example.com") ||
          e.startsWith("googletest")
        );
      }

      const realProfiles = allProfiles.filter((p) => !isTestEmail(p.email));
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
      let trialConversions7d = 0;
      let trialConversions30d = 0;
      let trialExpiries7d = 0;
      let trialExpiries30d = 0;

      for (const p of realProfiles) {
        const tier = (p.subscription_tier ?? "free").toLowerCase();
        tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
        if (!(tier in tierPrices)) {
          unknownTiers[tier] = (unknownTiers[tier] ?? 0) + 1;
        }
        if (tier !== "free" && p.stripe_subscription_id) {
          payingUsers += 1;
          const price = tierPrices[tier] ?? 0;
          mrrPence += Math.round(price * 100);
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
          if (t >= sevenDaysAgo) trialConversions7d += 1;
          if (t >= thirtyDaysAgo) trialConversions30d += 1;
        }
        if (p.trial_expired_at) {
          const t = new Date(p.trial_expired_at).getTime();
          if (t >= sevenDaysAgo) trialExpiries7d += 1;
          if (t >= thirtyDaysAgo) trialExpiries30d += 1;
        }
      }

      const mrr = mrrPence / 100;
      const arr = mrr * 12;

      // Plan downgrade events (last 7d) — keep tolerant if table doesn't exist on a branch.
      let planDowngradeEvents7d: number | string = "unavailable";
      try {
        const sevenDaysIso = new Date(sevenDaysAgo).toISOString();
        const ddRes = await fetch(
          `${url}/rest/v1/plan_downgrade_events?select=id&created_at=gte.${encodeURIComponent(sevenDaysIso)}`,
          { headers: { ...headers, prefer: "count=exact" } },
        );
        if (ddRes.ok) {
          const cr = ddRes.headers.get("content-range");
          // content-range looks like "0-9/42" — last segment is the total count.
          const total = cr ? parseInt(cr.split("/")[1] ?? "0", 10) : (await ddRes.json() as unknown[]).length;
          planDowngradeEvents7d = Number.isFinite(total) ? total : 0;
        }
      } catch {
        // leave as 'unavailable'
      }

      let expiringSoon: number | string = "unavailable";
      try {
        const exRes = await fetch(
          `${url}/rest/v1/subscriptions_expiring_soon?select=id`,
          { headers: { ...headers, prefer: "count=exact" } },
        );
        if (exRes.ok) {
          const cr = exRes.headers.get("content-range");
          expiringSoon = cr ? parseInt(cr.split("/")[1] ?? "0", 10) : 0;
        }
      } catch {
        // leave as 'unavailable'
      }

      let upcomingPayments7d: number | string = "unavailable";
      try {
        const sevenDaysAhead = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
        const upRes = await fetch(
          `${url}/rest/v1/upcoming_payments?select=id&due_date=lte.${encodeURIComponent(sevenDaysAhead)}`,
          { headers: { ...headers, prefer: "count=exact" } },
        );
        if (upRes.ok) {
          const cr = upRes.headers.get("content-range");
          upcomingPayments7d = cr ? parseInt(cr.split("/")[1] ?? "0", 10) : 0;
        }
      } catch {
        // leave as 'unavailable'
      }

      const snapshot = {
        generated_at: new Date().toISOString(),
        users: {
          total_real: realProfiles.length,
          test_users_excluded: allProfiles.length - realProfiles.length,
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
          conversions_7d: trialConversions7d,
          conversions_30d: trialConversions30d,
          expiries_7d: trialExpiries7d,
          expiries_30d: trialExpiries30d,
          conversion_rate_30d:
            trialConversions30d + trialExpiries30d === 0
              ? null
              : Number(
                  (
                    trialConversions30d /
                    (trialConversions30d + trialExpiries30d)
                  ).toFixed(3),
                ),
        },
        churn: {
          plan_downgrade_events_7d: planDowngradeEvents7d,
        },
        contracts: {
          subscriptions_expiring_soon: expiringSoon,
          upcoming_payments_next_7d: upcomingPayments7d,
        },
        notes: {
          test_email_filter:
            "Excluded emails matching: test+%, %@example.com, googletest%",
          mrr_method:
            "tier × stripe_subscription_id NOT NULL × tier_prices_gbp[tier]; unknown tiers are listed but contribute 0 to MRR until acknowledged.",
        },
      };

      return JSON.stringify(snapshot, null, 2);
    }

    case "append_business_log": {
      const { url, key } = getSupabaseCredentials();
      const category = String(args.category || "info");
      const title = String(args.title || "(no title)").slice(0, 200);
      const content = String(args.content || "").slice(0, 4000);
      const createdBy = String(args.created_by || "unknown");

      const insertRes = await fetch(`${url}/rest/v1/business_log`, {
        method: "POST",
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          category,
          title,
          content,
          created_by: createdBy,
        }),
      });
      const insertData = (await insertRes.json()) as unknown;
      if (!insertRes.ok) {
        return `Error inserting business_log row: ${JSON.stringify(insertData)}`;
      }
      const inserted = Array.isArray(insertData) ? insertData[0] : insertData;
      const id = (inserted as Record<string, unknown> | null)?.id ?? "?";
      return `Inserted business_log row ${id} (category=${category}).`;
    }

    case "post_to_telegram_admin": {
      const { token, chatId } = getTelegramAdminCredentials();
      const agentName = String(args.agent_name || "unknown-agent");
      const severity = String(args.severity || "info");
      const title = String(args.title || "(no title)");
      const body = String(args.body || "");
      const ask = args.ask ? String(args.ask) : "";

      if (
        ["recommend", "warn", "critical"].includes(severity) &&
        !ask.trim()
      ) {
        return `Refused: severity=${severity} requires a non-empty 'ask' field. Tell me what decision the founder needs to make.`;
      }

      const prefix = TELEGRAM_SEVERITY_PREFIX[severity] ?? "•";
      // Telegram MarkdownV2 is fussy about escaping; stick to plain HTML mode for safety.
      const lines: string[] = [];
      lines.push(`${prefix} <b>${escapeHtml(title)}</b>`);
      lines.push(`<i>${escapeHtml(agentName)} · ${severity} · ${timestamp()} UTC</i>`);
      if (body.trim()) {
        lines.push("");
        lines.push(escapeHtml(body));
      }
      if (ask.trim()) {
        lines.push("");
        lines.push(`<b>Ask:</b> ${escapeHtml(ask)}`);
      }
      const text = lines.join("\n").slice(0, 3800);

      const tgRes = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        },
      );
      const tgData = (await tgRes.json()) as Record<string, unknown>;
      if (!tgRes.ok || tgData.ok === false) {
        return `Error sending Telegram admin message: ${JSON.stringify(tgData)}`;
      }

      // Mirror to business-ops.md so the digest still has a record.
      try {
        appendFileSync(
          resolveContextFile("business-ops.md"),
          `\n\n## [telegram-admin] ${timestamp()} UTC — ${agentName} · ${severity}\n**${title}**\n\n${body}${ask ? `\n\n_Ask:_ ${ask}` : ""}\n`,
        );
      } catch (err) {
        // Mirror failure shouldn't fail the Telegram send — log to stdout for the host.
        console.error("[post_to_telegram_admin] mirror to business-ops.md failed:", err);
      }

      return `Sent Telegram admin message (severity=${severity}) and mirrored to business-ops.md.`;
    }

    case "post_to_facebook": {
      const systemToken = getMetaToken();

      // Get page access token from system token
      const tokenRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${FACEBOOK_PAGE_ID}?fields=access_token&access_token=${systemToken}`
      );
      const tokenData = (await tokenRes.json()) as Record<string, unknown>;
      if (!tokenRes.ok) {
        return `Error getting page token: ${JSON.stringify(tokenData)}`;
      }
      const pageToken = tokenData.access_token as string;

      // Post to page
      const imageUrl = args.image_url as string | undefined;
      let postRes: Response;

      if (imageUrl) {
        postRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${FACEBOOK_PAGE_ID}/photos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: imageUrl,
              message: args.message,
              access_token: pageToken,
            }),
          }
        );
      } else {
        postRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${FACEBOOK_PAGE_ID}/feed`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: args.message,
              access_token: pageToken,
            }),
          }
        );
      }

      const postData = (await postRes.json()) as Record<string, unknown>;
      if (!postRes.ok) {
        return `Error posting to Facebook: ${JSON.stringify(postData)}`;
      }
      return `Posted to Facebook. Post ID: ${postData.id || postData.post_id}`;
    }

    case "post_to_instagram": {
      const systemToken = getMetaToken();

      // Step 1: Create media container
      const containerRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${INSTAGRAM_ID}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: args.image_url,
            caption: args.caption,
            access_token: systemToken,
          }),
        }
      );
      const containerData = (await containerRes.json()) as Record<string, unknown>;
      if (!containerRes.ok) {
        return `Error creating IG media container: ${JSON.stringify(containerData)}`;
      }
      const containerId = containerData.id as string;

      // Step 2: Wait briefly for processing
      await new Promise((r) => setTimeout(r, 5000));

      // Step 3: Publish
      const publishRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${INSTAGRAM_ID}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: systemToken,
          }),
        }
      );
      const publishData = (await publishRes.json()) as Record<string, unknown>;
      if (!publishRes.ok) {
        return `Error publishing to IG: ${JSON.stringify(publishData)}`;
      }
      return `Posted to Instagram. Media ID: ${publishData.id}`;
    }

    case "get_recent_posts": {
      const systemToken = getMetaToken();
      const limit = (args.limit as number) || 5;
      const platform = args.platform as string;

      let url: string;
      if (platform === "facebook") {
        url = `https://graph.facebook.com/${META_API_VERSION}/${FACEBOOK_PAGE_ID}/posts?fields=message,created_time,permalink_url&limit=${limit}&access_token=${systemToken}`;
      } else {
        url = `https://graph.facebook.com/${META_API_VERSION}/${INSTAGRAM_ID}/media?fields=caption,timestamp,permalink,media_url&limit=${limit}&access_token=${systemToken}`;
      }

      const res = await fetch(url);
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        return `Error fetching ${platform} posts: ${JSON.stringify(data)}`;
      }
      return JSON.stringify(data, null, 2);
    }

    // --- Infrastructure ---
    case "git_push": {
      try {
        // Pull first to avoid rejection if remote is ahead
        const pullOut = execSync("git pull --rebase origin master 2>&1 || true", {
          cwd: PROJECT_DIR,
          encoding: "utf-8",
        }).trim();
        const pushOut = execSync("git push origin master 2>&1", {
          cwd: PROJECT_DIR,
          encoding: "utf-8",
        }).trim();
        return `## git pull --rebase\n${pullOut}\n\n## git push\n${pushOut}`;
      } catch (e) {
        return `Error during git push: ${(e as Error).message}`;
      }
    }

    case "get_git_status": {
      try {
        const branch = execSync("git branch --show-current", { cwd: PROJECT_DIR, encoding: "utf-8" }).trim();
        const status = execSync("git status --short", { cwd: PROJECT_DIR, encoding: "utf-8" }).trim();
        const log = execSync("git log --oneline -10", { cwd: PROJECT_DIR, encoding: "utf-8" }).trim();

        let prInfo = "";
        try {
          prInfo = execSync("gh pr list --limit 5 2>/dev/null || echo 'gh CLI not available'", {
            cwd: PROJECT_DIR,
            encoding: "utf-8",
          }).trim();
        } catch {
          prInfo = "(could not fetch PRs)";
        }

        return [
          `## Branch: ${branch}`,
          "",
          "## Working Tree",
          status || "(clean)",
          "",
          "## Recent Commits",
          log,
          "",
          "## Open PRs",
          prInfo,
        ].join("\n");
      } catch (e) {
        return `Error reading git status: ${(e as Error).message}`;
      }
    }

    case "get_server_health": {
      const results: string[] = [];

      // Check Vercel (production site)
      try {
        const res = await fetch("https://paybacker.co.uk", { method: "HEAD" });
        results.push(`Vercel (paybacker.co.uk): ${res.status === 200 ? "UP" : `Status ${res.status}`}`);
      } catch (e) {
        results.push(`Vercel: DOWN - ${(e as Error).message}`);
      }

      // Check Railway (agent server)
      try {
        const res = await fetch("https://lifeadmin-ai-production.up.railway.app", { method: "HEAD" });
        results.push(`Railway (agents): ${res.status < 500 ? "UP" : `Status ${res.status}`}`);
      } catch (e) {
        results.push(`Railway: DOWN - ${(e as Error).message}`);
      }

      return results.join("\n");
    }

    case "read_business_log": {
      const { url, key } = getSupabaseCredentials();
      const limit = (args.limit as number) || 20;

      try {
        const res = await fetch(
          `${url}/rest/v1/business_log?select=*&order=created_at.desc&limit=${limit}`,
          {
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
            },
          }
        );
        const data = await res.json();
        if (!res.ok) {
          return `Error reading business_log: ${JSON.stringify(data)}`;
        }
        return JSON.stringify(data, null, 2);
      } catch (e) {
        return `Error: ${(e as Error).message}`;
      }
    }

    // --- Communication ---
    case "log_communication": {
      const followUp = args.follow_up ? `\n**Follow-up:** ${args.follow_up}` : "";
      const entry = `\n### ${timestamp()} - ${args.type} with ${args.with}\n${args.summary}${followUp}\n`;
      const path = resolveContextFile("business-ops.md");
      appendFileSync(path, entry, "utf-8");
      return `Logged ${args.type} with ${args.with}`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// Create and start server
const server = new Server(
  { name: "paybacker-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, (args ?? {}) as Record<string, unknown>);
    return {
      content: [{ type: "text" as const, text: result }],
    };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Paybacker MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
