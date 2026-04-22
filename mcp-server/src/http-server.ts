#!/usr/bin/env node

/**
 * Paybacker MCP Server — HTTP Transport
 *
 * Cloud-accessible version of the MCP server for use with Claude Managed Agents.
 * Uses StreamableHTTPServerTransport instead of stdio.
 * Stores shared context in Supabase instead of local filesystem.
 *
 * Deploy to: Vercel / Railway / any Node.js host
 * Endpoint: POST/GET/DELETE /mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "3100", 10);
const BEARER_TOKEN = process.env.MCP_BEARER_TOKEN; // optional auth

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

// ---------------------------------------------------------------------------
// Supabase helpers (replaces local filesystem)
// ---------------------------------------------------------------------------

function getSupabaseCredentials(): { url: string; key: string } {
  const url = process.env.PAYBACKER_SUPABASE_URL;
  const key = process.env.PAYBACKER_SUPABASE_KEY;
  if (!url || !key)
    throw new Error("PAYBACKER_SUPABASE_URL and PAYBACKER_SUPABASE_KEY env vars required");
  return { url, key };
}

async function supabaseQuery(
  path: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<unknown> {
  const { url, key } = getSupabaseCredentials();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: options.method === "PATCH" ? "return=representation" : "return=minimal",
      ...options.headers,
    },
    body: options.body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${options.method || "GET"} ${path} failed: ${res.status} ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return null;
}

async function readContext(file: string): Promise<string> {
  const name = file.endsWith(".md") ? file : `${file}.md`;
  if (!VALID_CONTEXT_FILES.includes(name)) {
    throw new Error(`Invalid context file: ${name}. Valid: ${VALID_CONTEXT_FILES.join(", ")}`);
  }
  const rows = (await supabaseQuery(
    `shared_context?file_name=eq.${encodeURIComponent(name)}&select=content`
  )) as Array<{ content: string }>;
  if (!rows || rows.length === 0) return `(File ${name} does not exist yet)`;
  return rows[0].content;
}

async function writeContext(file: string, content: string, updatedBy = "agent"): Promise<void> {
  const name = file.endsWith(".md") ? file : `${file}.md`;
  if (!VALID_CONTEXT_FILES.includes(name)) {
    throw new Error(`Invalid context file: ${name}`);
  }
  await supabaseQuery(
    `shared_context?file_name=eq.${encodeURIComponent(name)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ content, updated_by: updatedBy, updated_at: new Date().toISOString() }),
    }
  );
}

async function appendContext(file: string, extra: string, updatedBy = "agent"): Promise<void> {
  const existing = await readContext(file);
  const merged = existing.startsWith("(File ") ? extra : existing + "\n" + extra;
  await writeContext(file, merged, updatedBy);
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function getMetaToken(): string {
  const token = process.env.PAYBACKER_META_TOKEN;
  if (!token) throw new Error("PAYBACKER_META_TOKEN env var not set");
  return token;
}

// ---------------------------------------------------------------------------
// Tool definitions (same interface as stdio version)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "read_context",
    description: "Reads a shared context file",
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
          description: "Which Claude interface (Managed Agent, Claude Code, etc.)",
        },
        summary: { type: "string", description: "What was done in this session" },
      },
      required: ["interface", "summary"],
    },
  },
  {
    name: "log_handoff",
    description: "Adds a handoff note for the next session/agent to pick up",
    inputSchema: {
      type: "object" as const,
      properties: {
        from_interface: { type: "string", description: "Which interface/agent is handing off" },
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
  {
    name: "get_tasks",
    description: "Returns the current task queue",
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
        section: { type: "string", description: "Section heading to update" },
        content: { type: "string", description: "New content for this section" },
      },
      required: ["section", "content"],
    },
  },
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
  {
    name: "get_server_health",
    description: "Checks Vercel and Railway deployment status",
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

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

async function handleTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    // --- Shared Context (now backed by Supabase) ---
    case "read_context":
      return readContext(args.file as string);

    case "write_context": {
      await writeContext(args.file as string, args.content as string);
      return `Wrote ${args.file}`;
    }

    case "append_context": {
      await appendContext(args.file as string, args.content as string);
      return `Appended to ${args.file}`;
    }

    case "log_session": {
      const entry = `\n## ${timestamp()} - ${args.interface}\n**Summary:** ${args.summary}\n`;
      await appendContext("active-sessions.md", entry, args.interface as string);
      return `Session logged for ${args.interface}`;
    }

    case "log_handoff": {
      const entry = `\n---\n\n## ${timestamp()} - ${args.from_interface}\n**Completed:** ${args.summary}\n\n**Next steps:** ${args.next_steps}\n`;
      await appendContext("handoff-notes.md", entry, args.from_interface as string);
      return `Handoff logged from ${args.from_interface}`;
    }

    case "log_decision": {
      const entry = `\n## ${timestamp()} - ${args.decision}\n**Decision:** ${args.decision}\n**Reason:** ${args.reason}\n**Made by:** ${args.made_by}\n`;
      await appendContext("decisions-log.md", entry, args.made_by as string);
      return `Decision logged: ${args.decision}`;
    }

    // --- Task Management ---
    case "get_tasks":
      return readContext("task-queue.md");

    case "add_task": {
      const priority = (args.priority as string).charAt(0).toUpperCase() + (args.priority as string).slice(1);
      const assignee = args.assigned_to ? ` (@${args.assigned_to})` : "";
      const taskLine = `- [ ] ${args.title} - ${args.description}${assignee}\n`;

      let content = await readContext("task-queue.md");
      if (content.startsWith("(File ")) {
        content = "# Task Queue\n\n## Critical\n\n## High\n\n## Medium\n\n## Low\n";
      }

      const sectionHeader = `## ${priority}`;
      const sectionIndex = content.indexOf(sectionHeader);
      if (sectionIndex !== -1) {
        const afterHeader = sectionIndex + sectionHeader.length;
        const nextSection = content.indexOf("\n## ", afterHeader);
        const insertAt = nextSection !== -1 ? nextSection : content.length;
        content = content.slice(0, insertAt) + taskLine + content.slice(insertAt);
      } else {
        content += `\n${sectionHeader}\n${taskLine}`;
      }

      await writeContext("task-queue.md", content);
      return `Added ${args.priority} task: ${args.title}`;
    }

    case "complete_task": {
      let content = await readContext("task-queue.md");
      const title = args.title as string;
      const result = args.result ? ` (${args.result})` : "";

      const pattern = new RegExp(`- \\[ \\] ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
      if (pattern.test(content)) {
        content = content.replace(pattern, `- [x] ${title}${result}`);
        await writeContext("task-queue.md", content);
        return `Completed task: ${title}`;
      }
      return `Task not found: ${title}`;
    }

    case "update_project_status": {
      let content = await readContext("project-status.md");
      if (content.startsWith("(File ")) content = "# Project Status\n";

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

      await writeContext("project-status.md", content);
      return `Updated project status section: ${section}`;
    }

    // --- Social Media ---
    case "post_to_facebook": {
      const systemToken = getMetaToken();
      const tokenRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${FACEBOOK_PAGE_ID}?fields=access_token&access_token=${systemToken}`
      );
      const tokenData = (await tokenRes.json()) as Record<string, unknown>;
      if (!tokenRes.ok) return `Error getting page token: ${JSON.stringify(tokenData)}`;
      const pageToken = tokenData.access_token as string;

      const imageUrl = args.image_url as string | undefined;
      const endpoint = imageUrl ? "photos" : "feed";
      const body = imageUrl
        ? { url: imageUrl, message: args.message, access_token: pageToken }
        : { message: args.message, access_token: pageToken };

      const postRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${FACEBOOK_PAGE_ID}/${endpoint}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      const postData = (await postRes.json()) as Record<string, unknown>;
      if (!postRes.ok) return `Error posting to Facebook: ${JSON.stringify(postData)}`;
      return `Posted to Facebook. Post ID: ${postData.id || postData.post_id}`;
    }

    case "post_to_instagram": {
      const systemToken = getMetaToken();
      const containerRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${INSTAGRAM_ID}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: args.image_url, caption: args.caption, access_token: systemToken }),
        }
      );
      const containerData = (await containerRes.json()) as Record<string, unknown>;
      if (!containerRes.ok) return `Error creating IG media container: ${JSON.stringify(containerData)}`;

      await new Promise((r) => setTimeout(r, 5000));

      const publishRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${INSTAGRAM_ID}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: containerData.id, access_token: systemToken }),
        }
      );
      const publishData = (await publishRes.json()) as Record<string, unknown>;
      if (!publishRes.ok) return `Error publishing to IG: ${JSON.stringify(publishData)}`;
      return `Posted to Instagram. Media ID: ${publishData.id}`;
    }

    case "get_recent_posts": {
      const systemToken = getMetaToken();
      const limit = (args.limit as number) || 5;
      const platform = args.platform as string;
      const url =
        platform === "facebook"
          ? `https://graph.facebook.com/${META_API_VERSION}/${FACEBOOK_PAGE_ID}/posts?fields=message,created_time,permalink_url&limit=${limit}&access_token=${systemToken}`
          : `https://graph.facebook.com/${META_API_VERSION}/${INSTAGRAM_ID}/media?fields=caption,timestamp,permalink,media_url&limit=${limit}&access_token=${systemToken}`;

      const res = await fetch(url);
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return `Error fetching ${platform} posts: ${JSON.stringify(data)}`;
      return JSON.stringify(data, null, 2);
    }

    // --- Infrastructure ---
    case "get_server_health": {
      const results: string[] = [];
      try {
        const res = await fetch("https://paybacker.co.uk", { method: "HEAD" });
        results.push(`Vercel (paybacker.co.uk): ${res.status === 200 ? "UP" : `Status ${res.status}`}`);
      } catch (e) {
        results.push(`Vercel: DOWN - ${(e as Error).message}`);
      }
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
      const res = await fetch(
        `${url}/rest/v1/business_log?select=*&order=created_at.desc&limit=${limit}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const data = await res.json();
      if (!res.ok) return `Error reading business_log: ${JSON.stringify(data)}`;
      return JSON.stringify(data, null, 2);
    }

    // --- Communication ---
    case "log_communication": {
      const followUp = args.follow_up ? `\n**Follow-up:** ${args.follow_up}` : "";
      const entry = `\n### ${timestamp()} - ${args.type} with ${args.with}\n${args.summary}${followUp}\n`;
      await appendContext("business-ops.md", entry, "agent");
      return `Logged ${args.type} with ${args.with}`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ---------------------------------------------------------------------------
// MCP Server + HTTP transport
// ---------------------------------------------------------------------------

const mcpServer = new Server(
  { name: "paybacker-mcp-server", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, (args ?? {}) as Record<string, unknown>);
    return { content: [{ type: "text" as const, text: result }] };
  } catch (error) {
    return {
      content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// HTTP request handler
// ---------------------------------------------------------------------------

// Track active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Optional bearer token auth
  if (BEARER_TOKEN) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${BEARER_TOKEN}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // Health check
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", server: "paybacker-mcp-server", version: "2.0.0" }));
    return;
  }

  // MCP endpoint
  if (req.url === "/mcp") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString("utf-8");

      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        // New session — create transport
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport!);
          },
        });

        transport.onclose = () => {
          const sid = [...transports.entries()].find(([, t]) => t === transport)?.[0];
          if (sid) transports.delete(sid);
        };

        await mcpServer.connect(transport);
      }

      await transport.handleRequest(req, res, body);
      return;
    }

    if (req.method === "GET") {
      // SSE stream for server→client notifications
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing or invalid Mcp-Session-Id" }));
      return;
    }

    if (req.method === "DELETE") {
      // Session termination
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        transports.delete(sessionId);
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
  }

  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found. MCP endpoint is POST/GET/DELETE /mcp" }));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const httpServer = createServer(handler);
httpServer.listen(PORT, () => {
  console.log(`Paybacker MCP Server (HTTP) listening on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
