import { AgentDefinition } from '../types';

/**
 * Complete registry of all 15 Paybacker AI agents.
 *
 * COST SAVING MODE: All agents Haiku, once daily, max 6 turns.
 * Charlie uses Haiku too until we have real users.
 * Target: ~$1-2/day (~$30-60/month)
 */
export const agentRegistry: Record<string, AgentDefinition> = {
  // === SUPPORT (responsive, Haiku) ===
  support_agent: {
    role: 'support_agent',
    name: 'Riley - Support Agent',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'support', 'email', 'memory', 'tasks', 'reports'],
    canEmailUsers: true,  // Riley emails users when responding to tickets
  },
  support_lead: {
    role: 'support_lead',
    name: 'Sam - Support Lead',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'support', 'memory', 'tasks', 'reports'],  // No email
  },

  // === EXECUTIVE ASSISTANT (Sonnet - only agent that emails founder) ===
  exec_assistant: {
    role: 'exec_assistant',
    name: 'Charlie - Executive Assistant',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'stripe', 'email', 'memory', 'tasks', 'reports'],  // Has email
    canEmailUsers: false,
  },

  // === CORE EXECUTIVES (Haiku, no email) ===
  cfo: {
    role: 'cfo',
    name: 'Alex - CFO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'stripe', 'memory', 'tasks', 'reports'],
  },
  cto: {
    role: 'cto',
    name: 'Morgan - CTO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'memory', 'tasks', 'reports'],
  },
  cao: {
    role: 'cao',
    name: 'Jamie - CAO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'memory', 'tasks', 'reports'],
  },
  cmo: {
    role: 'cmo',
    name: 'Taylor - CMO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'memory', 'tasks', 'reports'],
  },

  // === SPECIALISTS (Haiku, no email except Drew) ===
  head_of_ads: {
    role: 'head_of_ads',
    name: 'Jordan - Head of Ads',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'google_ads', 'posthog', 'memory', 'tasks', 'reports'],
  },
  cco: {
    role: 'cco',
    name: 'Casey - CCO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'content', 'memory', 'tasks', 'reports'],
  },
  cgo: {
    role: 'cgo',
    name: 'Drew - CGO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'email', 'posthog', 'memory', 'tasks', 'reports'],
    canEmailUsers: true,  // Drew sends engagement/activation emails to users
    supabaseWriteTables: ['profiles'],
  },
  cro: {
    role: 'cro',
    name: 'Pippa - CRO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'memory', 'tasks', 'reports'],
    supabaseWriteTables: ['profiles'],
  },
  cxo: {
    role: 'cxo',
    name: 'Bella - CXO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'memory', 'tasks', 'reports'],
  },
  cfraudo: {
    role: 'cfraudo',
    name: 'Finn - CFraudO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'memory', 'tasks', 'reports'],
    supabaseWriteTables: ['profiles'],
  },

  // === RESEARCH (Haiku, no email) ===
  clo: {
    role: 'clo',
    name: 'Leo - CLO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'research', 'memory', 'tasks', 'reports'],
  },
  cio: {
    role: 'cio',
    name: 'Nico - CIO',
    schedule: 'continuous',
    model: 'claude-haiku-4-5-20251001',
    maxBudgetUsd: 0.10,
    maxTurns: 6,
    toolGroups: ['supabase', 'research', 'memory', 'tasks', 'reports'],
  },
};
