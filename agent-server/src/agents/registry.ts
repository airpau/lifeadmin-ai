import { AgentDefinition } from '../types';

/**
 * Complete registry of all 15 Paybacker AI agents.
 * All agents run 24/7 on continuous schedules.
 * Budget caps per run prevent cost overruns.
 */
export const agentRegistry: Record<string, AgentDefinition> = {
  cfo: {
    role: 'cfo',
    name: 'Alex - CFO',
    schedule: '0 */4 * * *',          // Every 4 hours
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'stripe', 'email', 'memory', 'tasks', 'reports'],
  },
  cto: {
    role: 'cto',
    name: 'Morgan - CTO',
    schedule: '15 */4 * * *',          // Every 4 hours (offset 15 mins)
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  cao: {
    role: 'cao',
    name: 'Jamie - CAO',
    schedule: '30 */4 * * *',          // Every 4 hours (offset 30 mins)
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  cmo: {
    role: 'cmo',
    name: 'Taylor - CMO',
    schedule: '45 */4 * * *',          // Every 4 hours (offset 45 mins)
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  head_of_ads: {
    role: 'head_of_ads',
    name: 'Jordan - Head of Ads',
    schedule: '0 */6 * * *',           // Every 6 hours
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  exec_assistant: {
    role: 'exec_assistant',
    name: 'Charlie - Executive Assistant',
    schedule: '0 */2 * * *',           // Every 2 hours
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.50,
    maxTurns: 15,
    toolGroups: ['supabase', 'stripe', 'email', 'memory', 'tasks', 'reports'],
    canEmailUsers: false,
  },
  support_lead: {
    role: 'support_lead',
    name: 'Sam - Support Lead',
    schedule: '*/30 * * * *',          // Every 30 minutes
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 10,
    toolGroups: ['supabase', 'support', 'email', 'memory', 'tasks', 'reports'],
  },
  support_agent: {
    role: 'support_agent',
    name: 'Riley - Support Agent',
    schedule: '*/15 * * * *',          // Every 15 minutes
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 10,
    toolGroups: ['supabase', 'support', 'email', 'memory', 'tasks', 'reports'],
    canEmailUsers: true,
  },
  cco: {
    role: 'cco',
    name: 'Casey - CCO',
    schedule: '0 */6 * * *',           // Every 6 hours
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.50,
    maxTurns: 12,
    toolGroups: ['supabase', 'content', 'email', 'memory', 'tasks', 'reports'],
  },
  cgo: {
    role: 'cgo',
    name: 'Drew - CGO',
    schedule: '30 */6 * * *',          // Every 6 hours (offset 30 mins)
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.30,
    maxTurns: 12,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
    canEmailUsers: true,
    supabaseWriteTables: ['profiles'],
  },
  cro: {
    role: 'cro',
    name: 'Pippa - CRO',
    schedule: '0 */4 * * *',           // Every 4 hours
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.30,
    maxTurns: 12,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
    supabaseWriteTables: ['profiles'],
  },
  clo: {
    role: 'clo',
    name: 'Leo - CLO',
    schedule: '0 */8 * * *',           // Every 8 hours
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.50,
    maxTurns: 12,
    toolGroups: ['supabase', 'research', 'email', 'memory', 'tasks', 'reports'],
  },
  cio: {
    role: 'cio',
    name: 'Nico - CIO',
    schedule: '0 */12 * * *',          // Every 12 hours
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.50,
    maxTurns: 12,
    toolGroups: ['supabase', 'research', 'email', 'memory', 'tasks', 'reports'],
  },
  cxo: {
    role: 'cxo',
    name: 'Bella - CXO',
    schedule: '15 */6 * * *',          // Every 6 hours (offset 15 mins)
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.30,
    maxTurns: 12,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  cfraudo: {
    role: 'cfraudo',
    name: 'Finn - CFraudO',
    schedule: '30 */4 * * *',          // Every 4 hours (offset 30 mins)
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
    supabaseWriteTables: ['profiles'],
  },
};
