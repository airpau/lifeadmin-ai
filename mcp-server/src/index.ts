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
const PROJECT_DIR = "/Users/paul-ops/.openclaw/workspace/lifeadmin-ai";
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

// Tool definitions
const TOOLS = [
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
];

// Tool handlers
async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  ensureContextDir();

  switch (name) {
    // --- Shared Context ---
    case "read_context": {
      return readContextFile(args.file as string);
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
