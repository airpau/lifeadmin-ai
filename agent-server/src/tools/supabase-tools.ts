import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let _supabase: SupabaseClient;
function getSupabase() {
  if (!_supabase) _supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  return _supabase;
}

const BLOCKED_SQL = /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE)\b/i;

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

const queryTable: ToolDef = {
  name: 'query_table',
  description: 'Query rows from a Supabase table with optional filters, ordering, and limits.',
  schema: {
    type: 'object',
    properties: {
      table: { type: 'string', description: 'Table name' },
      select: { type: 'string', description: 'Columns to select', default: '*' },
      filters: {
        type: 'array', default: [],
        items: { type: 'object', properties: { column: { type: 'string' }, operator: { type: 'string', enum: ['eq','neq','gt','gte','lt','lte','like','ilike','is','in'] }, value: {} }, required: ['column','operator','value'] },
      },
      order: { type: 'object', properties: { column: { type: 'string' }, ascending: { type: 'boolean', default: false } } },
      limit: { type: 'number', default: 50 },
    },
    required: ['table'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    let q: any = sb.from(args.table).select(args.select || '*');
    for (const f of args.filters || []) {
      if (f.operator === 'eq') q = q.eq(f.column, f.value);
      else if (f.operator === 'neq') q = q.neq(f.column, f.value);
      else if (f.operator === 'gt') q = q.gt(f.column, f.value);
      else if (f.operator === 'gte') q = q.gte(f.column, f.value);
      else if (f.operator === 'lt') q = q.lt(f.column, f.value);
      else if (f.operator === 'lte') q = q.lte(f.column, f.value);
      else if (f.operator === 'like') q = q.like(f.column, f.value);
      else if (f.operator === 'ilike') q = q.ilike(f.column, f.value);
      else if (f.operator === 'is') q = q.is(f.column, f.value);
      else if (f.operator === 'in') q = q.in(f.column, f.value);
    }
    if (args.order) q = q.order(args.order.column, { ascending: args.order.ascending ?? false });
    q = q.limit(args.limit || 50);
    const { data, error } = await q;
    if (error) return `Error: ${error.message}`;
    return JSON.stringify(data, null, 2);
  },
};

const countRows: ToolDef = {
  name: 'count_rows',
  description: 'Count rows in a table matching filters.',
  schema: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      filters: { type: 'array', default: [], items: { type: 'object', properties: { column: { type: 'string' }, operator: { type: 'string' }, value: {} }, required: ['column','operator','value'] } },
    },
    required: ['table'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    let q: any = sb.from(args.table).select('*', { count: 'exact', head: true });
    for (const f of args.filters || []) {
      if (f.operator === 'eq') q = q.eq(f.column, f.value);
      else if (f.operator === 'gte') q = q.gte(f.column, f.value);
      else if (f.operator === 'lte') q = q.lte(f.column, f.value);
    }
    const { count, error } = await q;
    if (error) return `Error: ${error.message}`;
    return `Count: ${count}`;
  },
};

const insertRow: ToolDef = {
  name: 'insert_row',
  description: 'Insert a row into a table. Only available for tables the agent has write access to.',
  schema: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      data: { type: 'object', description: 'Column:value pairs' },
    },
    required: ['table', 'data'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    const { data, error } = await sb.from(args.table).insert(args.data).select().single();
    if (error) return `Error: ${error.message}`;
    return `Inserted: ${JSON.stringify(data)}`;
  },
};

const updateRow: ToolDef = {
  name: 'update_row',
  description: 'Update rows matching filters. At least one filter required.',
  schema: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      filters: { type: 'array', items: { type: 'object', properties: { column: { type: 'string' }, operator: { type: 'string' }, value: {} }, required: ['column','operator','value'] } },
      data: { type: 'object' },
    },
    required: ['table', 'filters', 'data'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    let q: any = sb.from(args.table).update(args.data);
    for (const f of args.filters) {
      if (f.operator === 'eq') q = q.eq(f.column, f.value);
    }
    const { data, error } = await q.select();
    if (error) return `Error: ${error.message}`;
    return `Updated ${(data || []).length} rows`;
  },
};

export const supabaseTools: ToolDef[] = [queryTable, countRows, insertRow, updateRow];
export const supabaseReadOnlyTools: ToolDef[] = [queryTable, countRows];
