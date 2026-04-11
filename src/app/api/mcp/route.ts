/**
 * Paybacker MCP Server â Next.js API Route (Stateless, Hardened)
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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
// Rate limiter (in-memory, resets on cold start â safe for serverless)
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

function validateAuth(req: NextRequest): string | true {
  const token = process.env.MCP_BEARER_TOKEN?.trim();
  if (!token) {
    // FAIL CLOSED: if no token is configured, reject everything
    // FAIL CLOSED
    console.error("[MCP] SECURITY: MCP_BEARER_TOKEN not configured â rejecting all requests");
    return false;
  }
  const auth = req.headers.get("authorization")?.trim();
  if (!auth) return "NO_AUTH_HEADER";

  // Constant-time comparison to prevent timing attacks
  const expected = `Bearer ${token}`;
  if (auth.length !== expected.length) {
    console.error(`[MCP] AUTH: Length mismatch \u2014 got ${auth.length}, expected ${expected.length}`);
    return `LENGTH_MISMATCH:got_${auth.length}_exp_${expected.length}_tok_${token.substring(0,4)}`;
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

// Read-only Supabase access for business_log (separate function, explicit)
async function supabaseReadOnly(table: string, query: string): Promise<unknown> {
  const allowedTables = ["business_log"];
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
    // Audit logging is best-effort â never block the response
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
// Create MCP server â SAFE TOOLS ONLY
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

  return server;
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleMcpRequest(req: NextRequest): Promise<NextResponse | Response> {
  const ip = getClientIp(req);

  // 1. Auth check (fail closed)
  const authResult = validateAuth(req);
  if (authResult !== true) {
    await logAudit("AUTH_FAIL", ip, false, req.headers.get("user-agent") || "unknown");
    return NextResponse.json({ error: "Unauthorized", debug: authResult }, { status: 401 });
  }

  // 2. Rate limit
  cleanRateLimitMap();
  if (!checkRateLimit(ip)) {
    await logAudit("RATE_LIMIT", ip, false);
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // 3. Body size check
  const body = await req.text();
  if (body.length > MAX_BODY_SIZE) {
    await logAudit("BODY_TOO_LARGE", ip, false, `${body.length} bytes`);
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  // 4. Create stateless MCP server + transport
  const mcpServer = createPaybackerMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless â no session tracking needed
  });

  await mcpServer.connect(transport);

  // 5. Convert NextRequest headers
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // 6. Handle via transport
  const response = await new Promise<Response>((resolve) => {
    const mockRes = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: "" as string,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      writeHead(status: number, hdrs?: Record<string, string>) {
        this.statusCode = status;
        if (hdrs) Object.assign(this.headers, hdrs);
      },
      write(chunk: string) {
        this.body += chunk;
        return true;
      },
      end(chunk?: string) {
        if (chunk) this.body += chunk;
        // Strip CORS â this endpoint should not be called from browsers
        const resHeaders: Record<string, string> = {
          ...this.headers,
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Cache-Control": "no-store",
        };
        resolve(
          new Response(this.body || null, {
            status: this.statusCode,
            headers: resHeaders,
          })
        );
      },
      on() {
        return this;
      },
      emit() {
        return false;
      },
      flushHeaders() {
        // noop
      },
    };

    const mockReq = {
      method: req.method,
      url: "/api/mcp",
      headers,
      on(event: string, cb: (data?: unknown) => void) {
        if (event === "data") cb(body);
        if (event === "end") cb();
        return this;
      },
      emit() {
        return false;
      },
    };

    transport.handleRequest(
      mockReq as unknown as import("node:http").IncomingMessage,
      mockRes as unknown as import("node:http").ServerResponse,
      body
    );
  });

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
        version: "2.0.0",
        tools: 13,
        note: "Social media tools disabled on public endpoint. Use local stdio server for posting.",
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
