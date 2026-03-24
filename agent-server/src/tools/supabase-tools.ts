import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let _supabase: SupabaseClient;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

// Blocklist of dangerous SQL keywords for run_sql
const BLOCKED_SQL = /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE)\b/i;

export const queryTable = tool(
  'query_table',
  'Query rows from a Supabase table with optional filters, ordering, and limits. Returns JSON array of matching rows.',
  {
    table: z.string().describe('Table name to query'),
    select: z.string().default('*').describe('Columns to select (PostgreSQL select syntax)'),
    filters: z.array(z.object({
      column: z.string(),
      operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']),
      value: z.any(),
    })).default([]).describe('Array of filter conditions'),
    order: z.object({
      column: z.string(),
      ascending: z.boolean().default(false),
    }).optional().describe('Order by column'),
    limit: z.number().max(200).default(50).describe('Max rows to return (max 200)'),
  },
  async (args) => {
    const sb = getSupabase();
    let query = sb.from(args.table).select(args.select);

    for (const f of args.filters) {
      if (f.operator === 'eq') query = query.eq(f.column, f.value);
      else if (f.operator === 'neq') query = query.neq(f.column, f.value);
      else if (f.operator === 'gt') query = query.gt(f.column, f.value);
      else if (f.operator === 'gte') query = query.gte(f.column, f.value);
      else if (f.operator === 'lt') query = query.lt(f.column, f.value);
      else if (f.operator === 'lte') query = query.lte(f.column, f.value);
      else if (f.operator === 'like') query = query.like(f.column, f.value);
      else if (f.operator === 'ilike') query = query.ilike(f.column, f.value);
      else if (f.operator === 'is') query = query.is(f.column, f.value);
      else if (f.operator === 'in') query = query.in(f.column, f.value);
    }

    if (args.order) {
      query = query.order(args.order.column, { ascending: args.order.ascending });
    }

    query = query.limit(args.limit);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: 'text' as const, text: `Query error: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
  { annotations: { readOnlyHint: true, destructiveHint: false } }
);

export const countRows = tool(
  'count_rows',
  'Count rows in a table matching optional filters.',
  {
    table: z.string().describe('Table name'),
    filters: z.array(z.object({
      column: z.string(),
      operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is']),
      value: z.any(),
    })).default([]).describe('Filter conditions'),
  },
  async (args) => {
    const sb = getSupabase();
    let query = sb.from(args.table).select('*', { count: 'exact', head: true });

    for (const f of args.filters) {
      if (f.operator === 'eq') query = query.eq(f.column, f.value);
      else if (f.operator === 'neq') query = query.neq(f.column, f.value);
      else if (f.operator === 'gt') query = query.gt(f.column, f.value);
      else if (f.operator === 'gte') query = query.gte(f.column, f.value);
      else if (f.operator === 'lt') query = query.lt(f.column, f.value);
      else if (f.operator === 'lte') query = query.lte(f.column, f.value);
      else if (f.operator === 'is') query = query.is(f.column, f.value);
    }

    const { count, error } = await query;
    if (error) {
      return { content: [{ type: 'text' as const, text: `Count error: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Count: ${count}` }] };
  },
  { annotations: { readOnlyHint: true, destructiveHint: false } }
);

export const insertRow = tool(
  'insert_row',
  'Insert a new row into a Supabase table. Only available for tables the agent has write access to.',
  {
    table: z.string().describe('Table name'),
    data: z.record(z.string(), z.any()).describe('Object with column:value pairs to insert'),
  },
  async (args) => {
    const sb = getSupabase();
    const { data, error } = await sb.from(args.table).insert(args.data).select().single();
    if (error) {
      return { content: [{ type: 'text' as const, text: `Insert error: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Inserted: ${JSON.stringify(data)}` }] };
  },
  { annotations: { readOnlyHint: false, destructiveHint: false } }
);

export const updateRow = tool(
  'update_row',
  'Update rows in a Supabase table matching filters. Only available for tables the agent has write access to.',
  {
    table: z.string().describe('Table name'),
    filters: z.array(z.object({
      column: z.string(),
      operator: z.enum(['eq', 'neq']),
      value: z.any(),
    })).min(1).describe('At least one filter required to prevent accidental mass updates'),
    data: z.record(z.string(), z.any()).describe('Object with column:value pairs to update'),
  },
  async (args) => {
    const sb = getSupabase();
    let query = sb.from(args.table).update(args.data);

    for (const f of args.filters) {
      if (f.operator === 'eq') query = query.eq(f.column, f.value);
      else if (f.operator === 'neq') query = query.neq(f.column, f.value);
    }

    const { data, error } = await query.select();
    if (error) {
      return { content: [{ type: 'text' as const, text: `Update error: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Updated ${(data || []).length} rows` }] };
  },
  { annotations: { readOnlyHint: false, destructiveHint: false } }
);

export const runSql = tool(
  'run_sql',
  'Execute a read-only SQL query against the database. Only SELECT statements are allowed. Use for complex joins, aggregations, or queries that cannot be expressed with query_table.',
  {
    query: z.string().describe('SQL SELECT query to execute'),
  },
  async (args) => {
    if (BLOCKED_SQL.test(args.query)) {
      return {
        content: [{ type: 'text' as const, text: 'Blocked: only SELECT queries are allowed. No DDL or DML statements.' }],
        isError: true,
      };
    }

    const sb = getSupabase();
    const { data, error } = await sb.rpc('exec_sql', { query_text: args.query });
    if (error) {
      // Fallback: try using the REST API directly
      return {
        content: [{ type: 'text' as const, text: `SQL error: ${error.message}. Use query_table instead for simpler queries.` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  },
  { annotations: { readOnlyHint: true, destructiveHint: false } }
);

export const supabaseTools = [queryTable, countRows, insertRow, updateRow, runSql];
export const supabaseReadOnlyTools = [queryTable, countRows, runSql];
