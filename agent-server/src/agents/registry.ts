import { AgentDefinition } from '../types';

/**
 * Complete registry of all 15 Paybacker AI agents.
 *
 * Cost-optimised for launch phase:
 * - Most agents use Haiku ($0.10-0.15/run) instead of Sonnet ($0.30-0.60/run)
 * - Only Charlie (EA) uses Sonnet for synthesising all reports
 * - Support agents run frequently, others run 1-4x daily
 * - Estimated daily cost: ~$8-12/day (~$250-350/month)
 */
export const agentRegistry: Record<string, AgentDefinition> = {
  // === SUPPORT (responsive, Haiku) ===
  support_agent: {
    role: 'support_agent',
    name: 'Riley - Support Agent',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 8,
    toolGroups: ['supabase', 'support', 'email', 'memory', 'tasks', 'reports'],
    canEmailUsers: true,
  },
  support_lead: {
    role: 'support_lead',
    name: 'Sam - Support Lead',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 8,
    toolGroups: ['supabase', 'support', 'email', 'memory', 'tasks', 'reports'],
  },

  // === EXECUTIVE ASSISTANT (Sonnet - needs to synthesise all reports) ===
  exec_assistant: {
    role: 'exec_assistant',
    name: 'Charlie - Executive Assistant',
    schedule: 'continuous',
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.40,
    maxTurns: 12,
    toolGroups: ['supabase', 'stripe', 'email', 'memory', 'tasks', 'reports'],
    canEmailUsers: false,
  },

  // === CORE EXECUTIVES (Haiku, 4x daily) ===
  cfo: {
    role: 'cfo',
    name: 'Alex - CFO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'stripe', 'email', 'memory', 'tasks', 'reports'],
  },
  cto: {
    role: 'cto',
    name: 'Morgan - CTO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  cao: {
    role: 'cao',
    name: 'Jamie - CAO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  cmo: {
    role: 'cmo',
    name: 'Taylor - CMO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },

  // === SPECIALISTS (Haiku, 2x daily) ===
  head_of_ads: {
    role: 'head_of_ads',
    name: 'Jordan - Head of Ads',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 8,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  cco: {
    role: 'cco',
    name: 'Casey - CCO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'content', 'email', 'memory', 'tasks', 'reports'],
  },
  cgo: {
    role: 'cgo',
    name: 'Drew - CGO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
    canEmailUsers: true,
    supabaseWriteTables: ['profiles'],
  },
  cro: {
    role: 'cro',
    name: 'Pippa - CRO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
    supabaseWriteTables: ['profiles'],
  },
  cxo: {
    role: 'cxo',
    name: 'Bella - CXO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
  },
  cfraudo: {
    role: 'cfraudo',
    name: 'Finn - CFraudO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 8,
    toolGroups: ['supabase', 'email', 'memory', 'tasks', 'reports'],
    supabaseWriteTables: ['profiles'],
  },

  // === RESEARCH (Haiku, 1x daily) ===
  clo: {
    role: 'clo',
    name: 'Leo - CLO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'research', 'email', 'memory', 'tasks', 'reports'],
  },
  cio: {
    role: 'cio',
    name: 'Nico - CIO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.15,
    maxTurns: 10,
    toolGroups: ['supabase', 'research', 'email', 'memory', 'tasks', 'reports'],
  },
};
